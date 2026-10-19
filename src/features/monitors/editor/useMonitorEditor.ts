import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteMonitor, patchMonitor, postMonitor, type MonitorCreatePayload } from '@/api/monitors-crud';
import { getMonitors } from '@/api/monitors';
import { attachMonitorToGroup, detachMonitorFromGroup } from '@/api/groups';
import { ApiClientError } from '@/api/client';
import { useToast } from '@/components/common/toastStore';
import { usePerms } from '@/features/auth/usePerms';
import type { Monitor } from '@/types';
import {
  validateDraft, fieldErrorsFromDetails, tabForField, lockedKeys, visibleTabs, columnFields,
  type TabDef, type FieldValue, type FieldErrors,
} from './fields';
import { useGroupMembership } from './useGroupMembership';
import { extractEditableFields, sameValue, sameIdSet, isUnsetSecret } from './editorState';
import { legacyErrors, legacyWarnings, splitPathCredentials, type OtherMonitors } from './legacyValidation';

/**
 * Draft values in the shape the request wants. The draft keeps every value
 * as a string or number; `deleted` is a boolean on the wire.
 */
function toWire(values: Record<string, FieldValue>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  if ('deleted' in out && out.deleted != null) out.deleted = Number(out.deleted) !== 0;
  return out;
}

/**
 * What a new monitor starts with: legacy `?view=monitor` (Add) or
 * `?view=monitor&dupId=N` (Clone). Nothing is written until Save.
 */
export interface MonitorEditorSeed {
  /** A complete create body; the draft starts from it and Save posts it with the edits on top. */
  values: MonitorCreatePayload;
  /** Name of the monitor the values were copied from, for the "cloned from" notice. */
  clonedFrom?: string;
  /** Monitor whose group membership a clone starts with (legacy copies `GroupIds`). */
  groupsFrom?: number;
}

export interface UseMonitorEditorOptions {
  /** The tab catalogue the skin renders (labels already translated). */
  tabs: TabDef[];
  /** The monitor being edited; omit with `seed` to create one. */
  monitor?: Monitor;
  seed?: MonitorEditorSeed;
  onClose: () => void;
  /** After a delete. Defaults to `onClose`. */
  onDeleted?: () => void;
  /** After a create, with the new row. The editor closes first. */
  onCreated?: (monitor: Monitor) => void;
  /** Tab to open on (legacy `?tab=`); unknown ids fall back to the first tab. */
  initialTab?: string;
}

/**
 * State and verbs behind the monitor editor, shared by both skins: the
 * draft and its baseline, the per-tab change and error counts, client and
 * backend validation, group membership, and Save / Delete / Reset / Close.
 *
 * Edit mode PATCHes only the keys that changed. Create mode (a `seed`
 * instead of a `monitor`) posts the whole draft over the seed, then
 * attaches the chosen groups.
 *
 * Callers key the component on the monitor id (or `new`) so a different
 * monitor starts a fresh draft; a refetch of the same monitor leaves an
 * edit in progress alone.
 */
export function useMonitorEditor({
  tabs, monitor, seed, onClose, onDeleted, onCreated, initialTab,
}: UseMonitorEditorOptions) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = usePerms();
  const isNew = !monitor;
  const source = (monitor ?? seed?.values ?? {}) as Monitor;

  const [activeTab, setActiveTab] = useState<string>(() =>
    initialTab && tabs.some((tab) => tab.id === initialTab) ? initialTab : tabs[0].id,
  );
  const [draft, setDraft] = useState<Record<string, FieldValue>>(() => extractEditableFields(source));
  // Baseline lives in state — not a ref — so updates after a save retrigger
  // the diff memo.
  const [baseline, setBaseline] = useState<Record<string, FieldValue>>(() => extractEditableFields(source));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Group membership is not a monitor column but a set of groups-monitors
  // rows. Draft `null` = untouched (follows the server); an array = edited.
  // A clone starts from its source's groups.
  const membership = useGroupMembership(monitor?.id ?? seed?.groupsFrom ?? -1);
  const [groupsDraft, setGroupsDraft] = useState<number[] | null>(null);
  const groupsBaseline = membership.baseline;
  const groupsValue = groupsDraft ?? groupsBaseline;
  const groupsDirty = groupsDraft != null && !sameIdSet(groupsDraft, groupsBaseline);

  // Every other monitor's name and RTSP stream name, for legacy's duplicate checks.
  const othersQ = useQuery({
    queryKey: ['monitors', 'editor-names'],
    queryFn: () => getMonitors({ page: 1, page_size: 1000 }),
    staleTime: 60_000,
  });
  const others = useMemo<OtherMonitors>(() => {
    const rows = (othersQ.data?.items ?? []).filter((m) => m.id !== monitor?.id);
    return {
      names: new Set(rows.map((m) => m.name)),
      rtspStreamNames: new Set(rows.map((m) => m.rtsp_stream_name).filter((n): n is string => !!n)),
    };
  }, [othersQ.data, monitor?.id]);
  // Field bounds win over legacy's form-wide checks when both flag a key.
  const validate = (d: Record<string, FieldValue>) => ({ ...legacyErrors(d, others, t), ...validateDraft(tabs, d, t) });

  // Fields the user may not change never reach the PATCH, whatever the draft says.
  const locked = useMemo(() => lockedKeys(tabs, can), [tabs, can]);

  // Write-only fields (`pass`, `onvif_password`) are dropped while blank:
  // the API never sends them back, so blank means "keep what is stored".
  const diff = useMemo(() => {
    const out: Record<string, FieldValue> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (isUnsetSecret(k, v) || locked.has(k)) continue;
      if (!sameValue(v, baseline[k])) out[k] = v;
    }
    return out;
  }, [draft, baseline, locked]);

  // Keys are counted once even when a tab lists the same key under several `show` conditions.
  const tabDiffCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of tabs) {
      const keys = new Set(columnFields([tab]).filter((f) => f.key in diff).map((f) => f.key));
      counts[tab.id] = keys.size + (tab.id === 'general' && groupsDirty ? 1 : 0);
    }
    return counts;
  }, [diff, tabs, groupsDirty]);

  const tabErrorCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of Object.keys(fieldErrors)) {
      const id = tabForField(tabs, key);
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [fieldErrors, tabs]);

  const diffCount = Object.keys(diff).length + (groupsDirty ? 1 : 0);

  // Re-validate live once the operator has seen errors, so fixing a field
  // clears its message without another Save click. Adjusting state during
  // render rather than in an effect clears it in the same frame.
  const [validatedDraft, setValidatedDraft] = useState(draft);
  if (validatedDraft !== draft) {
    setValidatedDraft(draft);
    if (Object.keys(fieldErrors).length > 0) {
      const next = validate(draft);
      // Keep backend messages for keys the client cannot judge.
      for (const [k, msg] of Object.entries(fieldErrors)) {
        if (!(k in next) && k in diff) next[k] = msg;
      }
      setFieldErrors(next);
    }
  }

  const jumpToFirstError = (errors: FieldErrors) => {
    const withErrors = new Set(Object.keys(errors).map((k) => tabForField(tabs, k)));
    const id = tabs.find((tab) => withErrors.has(tab.id))?.id;
    if (id) setActiveTab(id);
  };

  const showApiError = (e: unknown) => {
    const fromApi = e instanceof ApiClientError ? fieldErrorsFromDetails(e.details) : {};
    if (Object.keys(fromApi).length > 0) {
      setFieldErrors(fromApi);
      jumpToFirstError(fromApi);
    }
    setSaveError(e instanceof Error ? e.message : String(e));
    toast.apiError(e);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['monitors'] });
    qc.invalidateQueries({ queryKey: ['groups-monitors'] });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ closeAfter }: { closeAfter: boolean; after?: () => void }) => {
      if (!monitor) throw new Error('save called without a monitor');
      if (Object.keys(diff).length > 0) await patchMonitor(monitor.id, toWire(diff));
      if (groupsDirty && groupsDraft) {
        const want = new Set(groupsDraft);
        const have = new Set(groupsBaseline);
        for (const id of want) if (!have.has(id)) await attachMonitorToGroup(id, monitor.id);
        for (const id of have) if (!want.has(id)) await detachMonitorFromGroup(membership.rowIds[id]);
      }
      return closeAfter;
    },
    onSuccess: (closeAfter, { after }) => {
      setSaveError(null);
      setFieldErrors({});
      // Promote the saved draft to the baseline so the counter zeroes now.
      setBaseline({ ...draft });
      setGroupsDraft(null);
      if (monitor) qc.invalidateQueries({ queryKey: ['monitor', monitor.id] });
      invalidate();
      toast.success(t('Monitor saved.'));
      if (closeAfter) onClose();
      after?.();
    },
    onError: showApiError,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { ...seed!.values };
      for (const [k, v] of Object.entries(toWire(draft))) {
        if (!isUnsetSecret(k, v as FieldValue)) body[k] = v;
      }
      body.deleted = false;
      const created = await postMonitor(body as MonitorCreatePayload);
      for (const id of groupsValue) await attachMonitorToGroup(id, created.id);
      return created;
    },
    onSuccess: (created) => {
      setSaveError(null);
      setFieldErrors({});
      invalidate();
      toast.success(t('Monitor "{{name}}" created.', { name: created.name }));
      onClose();
      onCreated?.(created);
    },
    onError: showApiError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMonitor(monitor!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitors'] });
      toast.success(t('Monitor "{{name}}" deleted.', { name: monitor!.name }));
      (onDeleted ?? onClose)();
    },
    onError: toast.apiError,
  });

  /**
   * Validate, then PATCH (edit) or POST (create). Create always closes.
   * `after` runs once an edit is saved (the Zones guard's "Save").
   */
  const save = (closeAfter: boolean, after?: () => void) => {
    const errors = validate(draft);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSaveError(t('Fix the highlighted fields first.'));
      jumpToFirstError(errors);
      return;
    }
    // Legacy asks before saving something that will not work as expected.
    const warnings = legacyWarnings(draft, t);
    if (warnings.length > 0 && !confirm(warnings.join('\n'))) return;
    setSaveError(null);
    if (isNew) createMutation.mutate();
    else saveMutation.mutate({ closeAfter, after });
  };

  /** Close, asking first when there are unsaved edits. */
  const requestClose = () => {
    if (diffCount > 0 && !confirm(t('Discard {{count}} unsaved change?', { count: diffCount }))) return;
    onClose();
  };

  const requestDelete = () => {
    if (!monitor) return;
    if (!confirm(t('Delete monitor "{{name}}"? Its events stay on disk until a filter removes them.', { name: monitor.name }))) {
      return;
    }
    deleteMutation.mutate();
  };

  const reset = () => {
    setDraft({ ...baseline });
    setGroupsDraft(null);
    setFieldErrors({});
    setSaveError(null);
  };

  const updateField = (key: string, value: FieldValue) =>
    setDraft((d) => {
      const next = { ...d, [key]: value };
      // Legacy `change_Path`: credentials in an FFmpeg URL move into Username / Password.
      if (key === 'path' && d.type === 'Ffmpeg' && typeof value === 'string') {
        const split = splitPathCredentials(value);
        if (split && !locked.has('user')) {
          next.path = split.path;
          next.user = split.user;
          next.pass = split.pass;
        }
      }
      // Legacy `buffer_setting_oninput`: Pre Event Count may not exceed a set Maximum Image Buffer Size.
      if (key === 'pre_event_count' || key === 'max_image_buffer_count') {
        const max = Number(next.max_image_buffer_count) || 0;
        const pre = Number(next.pre_event_count) || 0;
        if (max && pre > max) {
          if (key === 'pre_event_count') next.max_image_buffer_count = pre;
          else next.pre_event_count = max;
        }
      }
      return next;
    });

  /**
   * Write several values into the draft at once (a monitor preset, an ONVIF
   * profile). Keys the user may not change, and keys no field edits, are
   * ignored; nothing is saved until Save.
   */
  const applyValues = (values: Record<string, unknown>) =>
    setDraft((d) => {
      const next = { ...d };
      for (const [k, v] of Object.entries(values)) {
        if (!(k in d) || locked.has(k) || v === undefined) continue;
        next[k] = v as FieldValue;
      }
      return next;
    });

  // Legacy builds the tab list from Type, DeviceClass and the Control
  // permission; a tab that disappears under the operator falls back to the first.
  const shownTabs = visibleTabs(tabs, draft, can);
  const formTabs = shownTabs.filter((tab) => !tab.navigatesTo);

  return {
    isNew,
    monitorId: monitor?.id ?? null,
    clonedFrom: seed?.clonedFrom,
    tabs: shownTabs,
    activeTab,
    setActiveTab,
    activeTabDef: formTabs.find((tab) => tab.id === activeTab) ?? formTabs[0],
    draft,
    baseline,
    diff,
    diffCount,
    tabDiffCount,
    tabErrorCount,
    fieldErrors,
    saveError,
    groupsValue,
    setGroups: setGroupsDraft,
    updateField,
    applyValues,
    save,
    reset,
    requestClose,
    requestDelete,
    saving: saveMutation.isPending || createMutation.isPending,
    deleting: deleteMutation.isPending,
    busy: saveMutation.isPending || createMutation.isPending || deleteMutation.isPending,
  };
}

export type MonitorEditorState = ReturnType<typeof useMonitorEditor>;
