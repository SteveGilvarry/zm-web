import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Joystick, Trash2 } from 'lucide-react';

import { AppShell } from '@/skins/AppShell';
import { Panel } from '@/components/common/Panel';
import {
  listControls, deleteControl, summarizeCapabilities, type Control,
} from '@/api/controls';
import { useAuthStore } from '@/stores/auth';

export const Route = createFileRoute('/settings/ptz-controls')({
  component: PtzControlsPage,
});

function PtzControlsPage() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<Control | null>(null);

  const controlsQ = useQuery({
    queryKey: ['controls'],
    queryFn: () => listControls({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteControl(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['controls'] }),
  });

  const controls = controlsQ.data?.items ?? [];

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <Panel
          title="PTZ control protocols"
          icon={<Joystick size={16} />}
        >
          <p className="text-xs text-text-muted mb-3">
            Each row is a PTZ-protocol definition the system can drive. Monitors
            reference one via <code>control_id</code> on the Control tab of the
            monitor editor. Editing the full capability matrix (50+ flags) is
            deferred — for now this page is read-only with a delete escape hatch.
          </p>

          {controlsQ.isLoading ? (
            <div className="p-8 text-center text-text-muted">Loading…</div>
          ) : controls.length === 0 ? (
            <div className="p-8 text-center text-text-muted italic">
              No PTZ control protocols defined.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted border-b border-border-subtle">
                <tr>
                  <th className="text-left px-2 py-2 w-12">ID</th>
                  <th className="text-left px-2 py-2">Name</th>
                  <th className="text-left px-2 py-2">Type</th>
                  <th className="text-left px-2 py-2">Capabilities</th>
                  <th className="text-right px-2 py-2 w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {controls.map((c) => (
                  <tr key={c.id} className="border-b border-border-subtle/40 hover:bg-surface/40">
                    <td className="px-2 py-2 font-mono tabular-nums text-text-muted">{c.id}</td>
                    <td className="px-2 py-2 text-text-primary">{c.name}</td>
                    <td className="px-2 py-2 text-text-muted">{c.type}</td>
                    <td className="px-2 py-2 text-text-secondary text-xs">
                      {summarizeCapabilities(c)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setPendingDelete(c)}
                        className="p-1 rounded text-text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {pendingDelete && (
        <div
          role="dialog"
          aria-label="Confirm delete"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="bg-panel border border-border-subtle rounded-lg p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text-primary mb-2">
              Delete "{pendingDelete.name}"?
            </h3>
            <p className="text-xs text-text-muted mb-4">
              Any monitor whose <code>control_id</code> points at this row will
              lose PTZ wiring until reassigned.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="px-3 py-1.5 text-xs rounded border border-border-subtle text-text-muted hover:bg-surface"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteMutation.mutate(pendingDelete.id);
                  setPendingDelete(null);
                }}
                className="px-3 py-1.5 text-xs rounded border border-crimson/50 bg-crimson/15 text-crimson hover:bg-crimson/25"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
