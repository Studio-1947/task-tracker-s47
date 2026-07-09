import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiBlob } from '../lib/api';

/**
 * Renders an image that lives behind the authenticated API (avatars,
 * attachments). `<img src>` can't send the Bearer header, so the bytes are
 * fetched through the API client and rendered as an object URL, cached by
 * React Query per path.
 */
export function AuthImage({
  path,
  alt = '',
  className = '',
  fallback = null,
}: {
  /** API path under /api, e.g. "/files/avatars/<uuid>.png". */
  path: string;
  alt?: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const { data: src } = useQuery({
    queryKey: ['file', path],
    queryFn: async () => URL.createObjectURL(await apiBlob(path)),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  if (!src) return <>{fallback}</>;
  return <img src={src} alt={alt} className={className} />;
}
