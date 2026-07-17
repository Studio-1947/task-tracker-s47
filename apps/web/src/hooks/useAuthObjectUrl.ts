import { useQuery } from '@tanstack/react-query';
import { apiBlob } from '../lib/api';

/**
 * Object URL for a file behind the authenticated API. An `<iframe>`/`<video>` src
 * can't carry the Bearer header, so the bytes are fetched through the API client
 * and handed back as a blob URL.
 *
 * Shares the ['file', path] cache key with AuthImage, so a file already shown as
 * an image thumbnail is not re-fetched to preview it.
 */
export function useAuthObjectUrl(path: string | null) {
  return useQuery({
    queryKey: ['file', path],
    queryFn: async () => URL.createObjectURL(await apiBlob(path!)),
    enabled: !!path,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}
