import { useQuery } from '@tanstack/react-query';
import type { RepoConfig } from '@/lib/types';
import { getJsonWithHeaders } from '@/lib/proxy-client';
import { listBranches } from '@/lib/providers';
import { useTokenStore } from '@/stores/token-store';

/** Branches for one repo — cache keyed ['branches', repo.id] (RN RF-04.1). */
export function useBranches(repo: RepoConfig | null) {
  const hasToken = useTokenStore((state) => (repo ? state.tokenFor(repo) !== null : false));
  return useQuery({
    queryKey: ['branches', repo?.id],
    queryFn: () => {
      const pagedGet = <T,>(path: string, searchParams?: Record<string, string>) =>
        getJsonWithHeaders<T>(repo!, path, searchParams);
      return listBranches(repo!, pagedGet);
    },
    enabled: repo !== null && hasToken,
  });
}
