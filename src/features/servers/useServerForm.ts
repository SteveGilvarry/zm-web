import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createServer, updateServer, type CreateServerPayload, type Server } from '@/api/servers';
import { useToast } from '@/components/common/toastStore';
import { SERVER_DAEMONS, type ServerDaemon } from './serverFields';

/** `Servers.Status` enum in ZoneMinder. */
export const SERVER_STATUSES = ['Unknown', 'Running', 'NotRunning'] as const;

/** Legacy's Protocol field is free text; these are the two values it means. */
export const SERVER_PROTOCOLS = ['http', 'https'] as const;

/** The plain text fields, in the order legacy's Servers modal lists them. */
export const SERVER_TEXT_FIELDS = [
  'hostname',
  'path_to_index',
  'path_to_zms',
  'path_to_api',
] as const;
export type ServerTextField = (typeof SERVER_TEXT_FIELDS)[number];

type TextFields = Record<ServerTextField, string>;
type DaemonFields = Record<ServerDaemon, boolean>;

/** Blank means "not set": send null so the column clears rather than storing ''. */
function orNull(value: string): string | null {
  return value.trim() || null;
}

/**
 * A decimal coordinate, or null when the box is empty. A half-typed number
 * ("-", "1.") is not a coordinate yet, so it too goes out as null rather than
 * as NaN.
 */
function coordOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Form state for registering or editing a server. `editing === null`
 * creates (and clears the form on success); otherwise PATCHes that row.
 *
 * The field set is legacy's Servers modal (`web/ajax/modals/server.php`):
 * name, protocol, hostname, port, the three paths and the four daemon
 * flags — plus `status` and the coordinates, which the row carries and
 * Create/UpdateServerRequest accept even though legacy's modal omits them.
 */
export function useServerForm(editing: Server | null, onSaved: () => void) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? '');
  const [protocol, setProtocol] = useState(editing?.protocol ?? '');
  const [port, setPortRaw] = useState(editing?.port != null ? String(editing.port) : '');
  const [status, setStatus] = useState(editing?.status || 'Unknown');
  const [latitude, setLatitude] = useState(editing?.latitude != null ? String(editing.latitude) : '');
  const [longitude, setLongitude] = useState(editing?.longitude != null ? String(editing.longitude) : '');
  const [text, setText] = useState<TextFields>(() => ({
    hostname: editing?.hostname ?? '',
    path_to_index: editing?.path_to_index ?? '',
    path_to_zms: editing?.path_to_zms ?? '',
    path_to_api: editing?.path_to_api ?? '',
  }));
  const [daemons, setDaemons] = useState<DaemonFields>(() => ({
    zmstats: editing?.zmstats === 1,
    zmaudit: editing?.zmaudit === 1,
    zmtrigger: editing?.zmtrigger === 1,
    zmeventnotification: editing?.zmeventnotification === 1,
  }));

  const setTextField = (field: ServerTextField, value: string) =>
    setText((prev) => ({ ...prev, [field]: value }));
  const setDaemon = (daemon: ServerDaemon, value: boolean) =>
    setDaemons((prev) => ({ ...prev, [daemon]: value }));

  const payload = (): CreateServerPayload => ({
    name: name.trim(),
    protocol: orNull(protocol),
    hostname: orNull(text.hostname),
    port: port ? parseInt(port, 10) : null,
    path_to_index: orNull(text.path_to_index),
    path_to_zms: orNull(text.path_to_zms),
    path_to_api: orNull(text.path_to_api),
    latitude: coordOrNull(latitude),
    longitude: coordOrNull(longitude),
    ...Object.fromEntries(SERVER_DAEMONS.map((d) => [d, daemons[d]])),
    status,
  });

  const save = useMutation({
    mutationFn: () => (editing ? updateServer(editing.id, payload()) : createServer(payload())),
    onSuccess: (saved) => {
      toast.success(editing ? t('Server "{{name}}" saved', { name: saved.name }) : t('Server "{{name}}" registered', { name: saved.name }));
      onSaved();
      if (!editing) {
        setName('');
        setProtocol('');
        setPortRaw('');
        setStatus('Unknown');
        setLatitude('');
        setLongitude('');
        setText({ hostname: '', path_to_index: '', path_to_zms: '', path_to_api: '' });
        setDaemons({ zmstats: false, zmaudit: false, zmtrigger: false, zmeventnotification: false });
      }
    },
    onError: (err) => toast.apiError(err),
  });

  // Legacy's Port input is `type=number`; keep it to digits either way.
  const setPort = (value: string) => setPortRaw(value.replace(/[^0-9]/g, ''));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return {
    name,
    setName,
    protocol,
    setProtocol,
    /** `hostname` / `path_to_index` / `path_to_zms` / `path_to_api`. */
    text,
    setTextField,
    /** Convenience alias — hostname is the one text field every skin shows. */
    hostname: text.hostname,
    setHostname: (value: string) => setTextField('hostname', value),
    port,
    setPort,
    status,
    setStatus,
    latitude,
    setLatitude,
    longitude,
    setLongitude,
    daemons,
    setDaemon,
    submit,
    submitDisabled: !name.trim() || save.isPending,
    isSaving: save.isPending,
    error: save.error?.message ?? null,
  };
}
