import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';

/** One cache entry is shared by the full-screen reader and sheet tab. */
export function useTranscriptQuery(transcriptId?: string, enabled = true) {
  const { clients } = useAuth();
  return useQuery({
    queryKey: ['transcript', transcriptId],
    queryFn: () => clients.cms.getTranscript(transcriptId!),
    enabled: enabled && Boolean(transcriptId),
    staleTime: 5 * 60 * 1_000,
  });
}
