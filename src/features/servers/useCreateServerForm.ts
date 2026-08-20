import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createServer } from '@/api/servers';

/** Form state for registering a new server; clears itself on success. */
export function useCreateServerForm(onCreated: () => void) {
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [port, setPortRaw] = useState('');

  const create = useMutation({
    mutationFn: () =>
      createServer({
        name: name.trim(),
        hostname: hostname.trim() || null,
        port: port ? parseInt(port, 10) : null,
        status: 'unknown',
      }),
    onSuccess: () => {
      onCreated();
      setName('');
      setHostname('');
      setPortRaw('');
    },
  });

  const setPort = (value: string) => setPortRaw(value.replace(/[^0-9]/g, ''));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return {
    name,
    setName,
    hostname,
    setHostname,
    port,
    setPort,
    submit,
    submitDisabled: !name.trim() || create.isPending,
  };
}
