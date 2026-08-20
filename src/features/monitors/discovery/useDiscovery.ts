import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { inspectCamera, probeCameras, type CameraCandidate, type InspectResult } from '@/api/discovery';
import { toast } from '@/components/common/toastStore';

export type DiscoveryStep = 'scan' | 'inspect' | 'profiles';

export interface DiscoveryState {
  step: DiscoveryStep;
  candidates: CameraCandidate[];
  selected: CameraCandidate | null;
  /** Device-service URL being inspected — a candidate's first XAddr or a hand-typed one. */
  xaddr: string;
  username: string;
  password: string;
  result: InspectResult | null;
  isScanning: boolean;
  isInspecting: boolean;
  scanError: unknown;
  inspectError: unknown;
  scan: (timeoutMs: number) => void;
  pick: (candidate: CameraCandidate) => void;
  setXaddr: (xaddr: string) => void;
  setUsername: (v: string) => void;
  setPassword: (v: string) => void;
  inspect: () => void;
  back: () => void;
  reset: () => void;
}

/**
 * The ONVIF discovery wizard's state: probe → pick a candidate (or type a
 * device-service URL) → inspect with credentials → choose a profile. Both
 * network calls are mutations because they are slow, user-triggered and
 * never worth caching.
 */
export function useDiscovery(): DiscoveryState {
  const [step, setStep] = useState<DiscoveryStep>('scan');
  const [selected, setSelected] = useState<CameraCandidate | null>(null);
  const [xaddr, setXaddr] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const probe = useMutation({
    mutationFn: (timeoutMs: number) => probeCameras(timeoutMs),
    onError: toast.apiError,
  });
  const inspect = useMutation({
    mutationFn: () => inspectCamera({ xaddr: xaddr.trim(), username, password }),
    onSuccess: () => setStep('profiles'),
    onError: toast.apiError,
  });

  return {
    step,
    candidates: probe.data ?? [],
    selected,
    xaddr,
    username,
    password,
    result: inspect.data ?? null,
    isScanning: probe.isPending,
    isInspecting: inspect.isPending,
    scanError: probe.error,
    inspectError: inspect.error,
    scan: (timeoutMs) => { setSelected(null); probe.mutate(timeoutMs); },
    pick: (candidate) => {
      setSelected(candidate);
      setXaddr(candidate.xaddrs[0] ?? '');
      setStep('inspect');
    },
    setXaddr: (v) => { setXaddr(v); if (step === 'scan' && v.trim()) setStep('inspect'); },
    setUsername,
    setPassword,
    inspect: () => { if (xaddr.trim()) inspect.mutate(); },
    back: () => {
      if (step === 'profiles') { inspect.reset(); setStep('inspect'); }
      else if (step === 'inspect') { setSelected(null); setStep('scan'); }
    },
    reset: () => {
      probe.reset();
      inspect.reset();
      setSelected(null);
      setXaddr('');
      setStep('scan');
    },
  };
}
