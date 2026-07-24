import { useQuery } from '@tanstack/react-query';
import type { RepoConfig } from '@/lib/types';
import { fetchPackageJsonFiles } from '@/lib/package-files';
import { useTokenStore } from '@/stores/token-store';

export { effectiveBranch } from '@/lib/package-files';

/**
 * package.json files for one repo+branch — cache keyed
 * ['pkg-files', repo.id, branch] so branch switches never share cache
 * (RN RF-04.3, RN RF-05.1).
 */
export function usePackageJsonFiles(repo: RepoConfig | null, branch: string | undefined) {
  const hasToken = useTokenStore((state) => (repo ? state.tokenFor(repo) !== null : false));
  return useQuery({
    queryKey: ['pkg-files', repo?.id, branch],
    queryFn: () => fetchPackageJsonFiles(repo!, branch!),
    enabled: repo !== null && branch !== undefined && hasToken,
  });
}
