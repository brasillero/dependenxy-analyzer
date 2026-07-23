import type { RepoConfig } from '@/lib/types';
import type { GitProvider, PagedGet, ParsedRepoUrl, ProxyClient } from './provider';
import { decodeBase64Utf8, isExcludedPath, parsePackageJson } from '@/lib/package-json';

const MAX_BRANCHES = 500;
const MAX_PAGES = Math.ceil(MAX_BRANCHES / 100);

interface GitHubRepoPayload {
  default_branch: string;
}

interface GitHubTreePayload {
  truncated: boolean;
  tree: Array<{ type: string; path: string }>;
}

interface GitHubContentPayload {
  content: string;
  encoding: string;
}

/** Parse the RFC 5988 Link header for a rel="next" URL. */
export function nextLinkUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

export const githubProvider: GitProvider = {
  parseUrl(raw: string): ParsedRepoUrl {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new Error('Invalid URL — paste a full GitHub repository URL.');
    }
    if (url.hostname !== 'github.com') {
      throw new Error('Not a GitHub URL.');
    }
    // Strip trailing slashes so a trailing-slash .git URL still parses.
    const segments = url.pathname
      .replace(/\/+$/, '')
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean);
    // Drop /tree/<branch>/... suffixes.
    const treeIndex = segments.indexOf('tree');
    const pathSegments = treeIndex === -1 ? segments : segments.slice(0, treeIndex);
    if (pathSegments.length !== 2) {
      throw new Error('Expected https://github.com/owner/repo');
    }
    return { provider: 'github', host: 'github.com', path: pathSegments.join('/') };
  },

  async getDefaultBranch(client: ProxyClient, repo: RepoConfig): Promise<string> {
    const payload = await client.getJson<GitHubRepoPayload>(`repos/${repo.path}`);
    return payload.default_branch;
  },

  /** Full pagination via Link header, capped at MAX_BRANCHES (spec §4.6). */
  async listBranches(pagedGet: PagedGet, repo: RepoConfig): Promise<string[]> {
    const names: string[] = [];
    let path: string | null = `repos/${repo.path}/branches`;
    let searchParams: Record<string, string> | undefined = { per_page: '100' };
    // The page cap also guards against a misbehaving upstream that keeps
    // echoing a rel="next" Link with an empty body — names.length alone
    // would never reach MAX_BRANCHES and the loop would spin forever.
    for (let page = 0; page < MAX_PAGES && path; page++) {
      const response = await pagedGet<Array<{ name: string }>>(path, searchParams);
      names.push(...response.data.map((b) => b.name));
      const next = nextLinkUrl(response.headers.get('link'));
      if (!next) break;
      // Subsequent pages: the next URL is absolute (api.github.com); reduce it
      // to a proxy-relative path and re-extract the query for ky.
      const nextUrl = new URL(next);
      path = nextUrl.pathname.replace(/^\/+/, '');
      searchParams = Object.fromEntries(nextUrl.searchParams.entries());
    }
    return names.slice(0, MAX_BRANCHES);
  },

  async listPackageJsonPaths(client: ProxyClient, repo: RepoConfig, branch: string): Promise<string[]> {
    const payload = await client.getJson<GitHubTreePayload>(
      `repos/${repo.path}/git/trees/${encodeURIComponent(branch)}`,
      { recursive: '1' },
    );
    // A truncated tree (giant repos) is tolerated: use what came (spec §4.6).
    return payload.tree
      .filter((entry) => entry.type === 'blob' && entry.path.endsWith('package.json'))
      .map((entry) => entry.path)
      .filter((path) => !isExcludedPath(path));
  },

  async fetchPackageJson(
    client: ProxyClient,
    repo: RepoConfig,
    branch: string,
    path: string,
  ): Promise<ReturnType<typeof parsePackageJson>> {
    const payload = await client.getJson<GitHubContentPayload>(
      `repos/${repo.path}/contents/${path}`,
      { ref: branch },
    );
    return parsePackageJson(path, decodeBase64Utf8(payload.content));
  },
};
