import type { RepoConfig } from '@/lib/types';
import type { PagedGet, ProxyClient } from './provider';
import { githubProvider } from './github';
import { gitlabProvider, listPackageJsonPathsPaginated } from './gitlab';

export function getProvider(repo: RepoConfig) {
  return repo.provider === 'github' ? githubProvider : gitlabProvider;
}

/** Paginated branch listing for either provider. */
export function listBranches(repo: RepoConfig, pagedGet: PagedGet): Promise<string[]> {
  return getProvider(repo).listBranches(pagedGet, repo);
}

/** Paginated package.json path listing (GitHub tree is single-call, GitLab paginates). */
export async function listPackageJsonPaths(
  repo: RepoConfig,
  branch: string,
  client: ProxyClient,
  pagedGet: PagedGet,
): Promise<string[]> {
  if (repo.provider === 'github') {
    return githubProvider.listPackageJsonPaths(client, repo, branch);
  }
  return listPackageJsonPathsPaginated(pagedGet, repo, branch);
}
