import type { RepoConfig } from '@/lib/types';
import type { GitProvider, PagedGet, ParsedRepoUrl, ProxyClient } from './provider';
import { isExcludedPath, parsePackageJson } from '@/lib/package-json';
import { fetchBranchNamesGraphql, fetchDefaultBranchGraphql } from './gitlab-graphql';

const MAX_BRANCHES = 500;
const MAX_PAGES = Math.ceil(MAX_BRANCHES / 100);
const MAX_TREE_PAGES = 100;

interface GitLabProjectPayload {
  default_branch: string;
}

interface GitLabTreeEntry {
  type: 'blob' | 'tree';
  path: string;
}

interface GitLabSearchBlobEntry {
  path: string;
}

function projectId(repo: RepoConfig): string {
  return encodeURIComponent(repo.path);
}

export const gitlabProvider: GitProvider = {
  parseUrl(raw: string): ParsedRepoUrl {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new Error('Invalid URL — paste a full GitLab repository URL.');
    }
    if (url.hostname === 'github.com') {
      throw new Error('Use the GitHub provider for github.com URLs.');
    }
    // Strip trailing slashes so a trailing-slash .git URL still parses.
    let path = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
    // Cut everything from '/-/' onward (/-/tree, /-/blob, /-/merge_requests, ...).
    path = path.split('/-/')[0];
    // Strip legacy /tree/<branch>/... suffixes.
    path = path.replace(/\/tree\/.*$/, '');
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) {
      throw new Error('Expected a GitLab project path like group/project (subgroups allowed).');
    }
    return { provider: 'gitlab', host: url.host, path: segments.join('/') };
  },

  /** GraphQL rootRef first; REST project payload as the legacy fallback. */
  async getDefaultBranch(client: ProxyClient, repo: RepoConfig): Promise<string> {
    try {
      return await fetchDefaultBranchGraphql(repo);
    } catch {
      const payload = await client.getJson<GitLabProjectPayload>(`projects/${projectId(repo)}`);
      return payload.default_branch;
    }
  },

  /** GraphQL branchNames first; paginated REST branches as the fallback. */
  async listBranches(pagedGet: PagedGet, repo: RepoConfig): Promise<string[]> {
    try {
      return await fetchBranchNamesGraphql(repo, MAX_BRANCHES);
    } catch {
      return listBranchesRest(pagedGet, repo);
    }
  },

  /**
   * GitLab trees paginate, so a header-less single page would silently
   * truncate. Fail loudly instead — callers must use the listPackageJsonPaths
   * facade in providers/index.ts (blob search with tree fallback).
   */
  async listPackageJsonPaths(client: ProxyClient, repo: RepoConfig, branch: string): Promise<string[]> {
    void client;
    void repo;
    void branch;
    throw new Error('Use the listPackageJsonPaths facade in providers/index.ts for GitLab repos.');
  },

  async fetchPackageJson(
    client: ProxyClient,
    repo: RepoConfig,
    branch: string,
    path: string,
  ): Promise<ReturnType<typeof parsePackageJson>> {
    const raw = await client.getText(
      `projects/${projectId(repo)}/repository/files/${encodeURIComponent(path)}/raw`,
      { ref: branch },
    );
    return parsePackageJson(path, raw);
  },
};

/** REST fallback for branch listing: full pagination via x-next-page, capped. */
async function listBranchesRest(pagedGet: PagedGet, repo: RepoConfig): Promise<string[]> {
  const names: string[] = [];
  let searchParams: Record<string, string> = { per_page: '100' };
  // The page cap also guards against a misbehaving upstream that keeps
  // echoing a non-empty x-next-page with an empty body — names.length alone
  // would never reach MAX_BRANCHES and the loop would spin forever.
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await pagedGet<Array<{ name: string }>>(
      `projects/${projectId(repo)}/repository/branches`,
      searchParams,
    );
    names.push(...response.data.map((b) => b.name));
    const next = response.headers.get('x-next-page');
    if (!next) break;
    searchParams = { ...searchParams, page: next };
  }
  return names.slice(0, MAX_BRANCHES);
}

export function filterPackageJsonPaths(entries: GitLabTreeEntry[]): string[] {
  return entries
    .filter((entry) => entry.type === 'blob' && entry.path.endsWith('package.json'))
    .map((entry) => entry.path)
    .filter((path) => !isExcludedPath(path));
}

/**
 * Discovery via the project search API: one request finds every package.json
 * (the tree listing needs a serial page per 100 tree entries). The same blob
 * may appear multiple times in results (multiple matches), so paths are
 * deduped. Throws on request failure so the caller falls back to the tree.
 */
export async function listPackageJsonPathsViaSearch(
  pagedGet: PagedGet,
  repo: RepoConfig,
  branch: string,
): Promise<string[]> {
  const paths = new Set<string>();
  let searchParams: Record<string, string> = {
    scope: 'blobs',
    search: 'filename:package.json',
    ref: branch,
    per_page: '100',
  };
  for (let page = 0; page < MAX_TREE_PAGES; page++) {
    const response = await pagedGet<GitLabSearchBlobEntry[]>(
      `projects/${projectId(repo)}/search`,
      searchParams,
    );
    for (const entry of response.data) {
      if (entry.path.endsWith('package.json') && !isExcludedPath(entry.path)) {
        paths.add(entry.path);
      }
    }
    const next = response.headers.get('x-next-page');
    if (!next) break;
    searchParams = { ...searchParams, page: next };
  }
  return [...paths];
}

/** Fallback discovery: paginated recursive-tree listing (GitLab trees paginate
 *  instead of truncating). */
export async function listPackageJsonPathsPaginated(
  pagedGet: PagedGet,
  repo: RepoConfig,
  branch: string,
): Promise<string[]> {
  const entries: GitLabTreeEntry[] = [];
  let searchParams: Record<string, string> = { recursive: 'true', per_page: '100', ref: branch };
  // Defensive cap (MAX_TREE_PAGES × 100 = 10,000 tree entries): guards against
  // an infinite loop on a misbehaving upstream that keeps echoing a non-empty
  // x-next-page, without realistically truncating monorepos.
  for (let page = 0; page < MAX_TREE_PAGES; page++) {
    const response = await pagedGet<GitLabTreeEntry[]>(
      `projects/${projectId(repo)}/repository/tree`,
      searchParams,
    );
    entries.push(...response.data);
    const next = response.headers.get('x-next-page');
    if (!next) break;
    searchParams = { ...searchParams, page: next };
  }
  return filterPackageJsonPaths(entries);
}
