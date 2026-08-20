import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createServer, updateServer, type Server } from '@/api/servers';

/** `Servers.Status` enum in ZoneMinder. */
export const SERVER_STATUSES = ['Unknown', 'Running', 'NotRunning'] as const;

/**
 * Form state for registering or editing a server. `editing === null`
 * creates (and clears the form on success); otherwise PATCHes that row.
 * Only the fields Create/UpdateServerRequest carry are offered — legacy's
 * protocol/path/daemon flags have no backend yet.
 */
export function useServerForm(editing: Server | null, onSaved: () => void) {
  const [name, setName] = useState(editing?.name ?? '');
  const [hostname, setHostname] = useState(editing?.hostname ?? '');
  const [port, setPortRaw] = useState(editing?.port != null ? String(editing.port) : '');
  const [status, setStatus] = useState(editing?.status || 'Unknown');

  const payload = () => ({
    name: name.trim(),
    hostname: hostname.trim() || null,
    port: port ? parseInt(port, 10) : null,
    status,
  });

  const save = useMutation({
    mutationFn: () => (editing ? updateServer(editing.id, payload()) : createServer(payload())),
    onSuccess: () => {
      onSaved();
      if (!editing) {
        setName('');
        setHostname('');
        setPortRaw('');
        setStatus('Unknown');
      }
    },
  });

  const setPort = (value: string) => setPortRaw(value.replace(/[^0-9]/g, ''));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return {
    name,
    setName,
    hostname,
    setHostname,
    port,
    setPort,
    status,
    setStatus,
    submit,
    submitDisabled: !name.trim() || save.isPending,
    isSaving: save.isPending,
    error: save.error?.message ?? null,
  };
}
