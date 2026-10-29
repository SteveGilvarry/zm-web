import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listEncoderTemplates, type EncoderTemplate } from '@/api/encoderTemplates';

/**
 * Encoder templates grouped by encoder, in the server's order (legacy
 * `EncoderTemplates::all()` sorts by encoder, then name). One request per
 * editor; the list changes only from Options → Encoder Templates.
 */
export function useEncoderTemplates() {
  const q = useQuery({
    queryKey: ['encoder-templates'],
    queryFn: listEncoderTemplates,
    staleTime: 5 * 60_000,
  });
  const byEncoder = useMemo(() => {
    const out = new Map<string, EncoderTemplate[]>();
    for (const tpl of q.data ?? []) {
      const list = out.get(tpl.encoder) ?? [];
      list.push(tpl);
      out.set(tpl.encoder, list);
    }
    return out;
  }, [q.data]);
  return byEncoder;
}
