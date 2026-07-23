import type { RepoConfig } from '@/lib/types';
import type { GitProvider, PagedGet, ParsedRepoUrl, ProxyClient } from './provider';
import { isExcludedPath, parsePackageJson } from '@/lib/package-json';

const MAX_BRANCHES = 500;
const MAX_PAGES = Math.ceil(MAX_BRANCHES / 100);

interface GitLabProjectPayload {
  default_branch: string;
}

interface GitLabTreeEntry {
  type: 'blob' | 'tree';
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
    let path = url.pathname.replace(/\.git$/, '');
    // Strip /-/tree/<branch>/... or /tree/<branch>/... suffixes.
    path = path.replace(/\/(-\/)?tree\/.*$/, '');
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) {
      throw new Error('Expected a GitLab project path like group/project (subgroups allowed).');
    }
    return { provider: 'gitlab', host: url.host, path: segments.join('/') };
  },

  async getDefaultBranch(client: ProxyClient, repo: RepoConfig): Promise<string> {
    const payload = await client.getJson<GitLabProjectPayload>(`projects/${projectId(repo)}`);
    return payload.default_branch;
  },

  /** Full pagination via x-next-page header, capped at MAX_BRANCHES (spec §4.6). */
  async listBranches(pagedGet: PagedGet, repo: RepoConfig): Promise<string[]> {
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
  },

  /** Header-less single-page fallback; hooks use the paginated facade in providers/index.ts. */
  async listPackageJsonPaths(client: ProxyClient, repo: RepoConfig, branch: string): Promise<string[]> {
    const entries = await client.getJson<GitLabTreeEntry[]>(
      `projects/${projectId(repo)}/repository/tree`,
      { recursive: 'true', per_page: '100', ref: branch },
    );
    return filterPackageJsonPaths(entries);
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

export function filterPackageJsonPaths(entries: GitLabTreeEntry[]): string[] {
  return entries
    .filter((entry) => entry.type === 'blob' && entry.path.endsWith('package.json'))
    .map((entry) => entry.path)
    .filter((path) => !isExcludedPath(path));
}

/** Paginated recursive-tree listing (GitLab trees paginate instead of truncating). */
export async function listPackageJsonPathsPaginated(
  pagedGet: PagedGet,
  repo: RepoConfig,
  branch: string,
): Promise<string[]> {
  const entries: GitLabTreeEntry[] = [];
  let searchParams: Record<string, string> = { recursive: 'true', per_page: '100', ref: branch };
  // Defensive cap of 100 pages (10,000 tree entries): guards against an
  // infinite loop on a misbehaving upstream that keeps echoing a non-empty
  // x-next-page, without realistically truncating monorepos.
  for (let page = 0; page < 100; page++) {
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
