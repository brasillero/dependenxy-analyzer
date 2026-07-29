import type { RepoConfig } from '@/lib/types';
import type { PagedGet, ProxyClient } from './provider';
import { githubProvider } from './github';
import {
  gitlabProvider,
  listPackageJsonPathsPaginated,
  listPackageJsonPathsViaSearch,
} from './gitlab';

export function getProvider(repo: RepoConfig) {
  return repo.provider === 'github' ? githubProvider : gitlabProvider;
}

/** Paginated branch listing for either provider. */
export function listBranches(repo: RepoConfig, pagedGet: PagedGet): Promise<string[]> {
  return getProvider(repo).listBranches(pagedGet, repo);
}

/**
 * package.json discovery. GitHub's tree is a single recursive call. GitLab
 * uses the project search API (one request finds every package.json); if the
 * instance's search is unavailable it falls back to the paginated tree.
 */
export async function listPackageJsonPaths(
  repo: RepoConfig,
  branch: string,
  client: ProxyClient,
  pagedGet: PagedGet,
): Promise<string[]> {
  if (repo.provider === 'github') {
    return githubProvider.listPackageJsonPaths(client, repo, branch);
  }
  try {
    return await listPackageJsonPathsViaSearch(pagedGet, repo, branch);
  } catch {
    return listPackageJsonPathsPaginated(pagedGet, repo, branch);
  }
}
