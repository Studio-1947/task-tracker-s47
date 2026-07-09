import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SearchResults } from '@task-tracker/shared';
import { http } from '../lib/api';

export function useGlobalSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => http.get<SearchResults>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
