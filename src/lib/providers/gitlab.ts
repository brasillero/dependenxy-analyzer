import type { RepoConfig } from '@/lib/types';
import type { GitProvider, PagedGet, ParsedRepoUrl, ProxyClient } from './provider';
import { isExcludedPath, parsePackageJson } from '@/lib/package-json';
import { postGraphql } from '@/lib/proxy-client';
import type { PackageFilesResult } from '@/lib/package-files';

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

  /**
   * GitLab trees paginate, so a header-less single page would silently
   * truncate. Fail loudly instead — callers must use the paginated facade
   * in providers/index.ts.
   */
  async listPackageJsonPaths(client: ProxyClient, repo: RepoConfig, branch: string): Promise<string[]> {
    void client;
    void repo;
    void branch;
    throw new Error('Use the listPackageJsonPaths facade in providers/index.ts (paginated) for GitLab repos.');
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

const BLOB_BATCH_SIZE = 50;

interface GraphqlBlobsResponse {
  data?: {
    project?: {
      repository?: {
        blobs?: { nodes: Array<{ path: string; rawTextBlob: string | null }> };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

const BLOBS_QUERY = `
  query ($fullPath: ID!, $ref: String!, $paths: [String!]!) {
    project(fullPath: $fullPath) {
      repository {
        blobs(paths: $paths, ref: $ref) {
          nodes { path rawTextBlob }
        }
      }
    }
  }
`;

/**
 * Batch-read package.json files via GraphQL blobs(paths:) — one request per
 * BLOB_BATCH_SIZE files instead of one REST call per file, which dominates
 * fetch time on monorepos. Throws on transport/GraphQL failure so the caller
 * can fall back to per-file REST (older GitLab versions lack this field).
 */
export async function fetchPackageJsonsBatched(
  repo: RepoConfig,
  branch: string,
  paths: string[],
): Promise<PackageFilesResult> {
  const files: PackageFilesResult['files'] = [];
  let failedCount = 0;

  for (let start = 0; start < paths.length; start += BLOB_BATCH_SIZE) {
    const chunk = paths.slice(start, start + BLOB_BATCH_SIZE);
    const response = await postGraphql<GraphqlBlobsResponse>(repo, {
      query: BLOBS_QUERY,
      variables: { fullPath: repo.path, ref: branch, paths: chunk },
    });
    if (response.errors?.length) {
      throw new Error(`GraphQL blobs query failed: ${response.errors[0].message}`);
    }
    const nodes = response.data?.project?.repository?.blobs?.nodes;
    if (!nodes) {
      throw new Error('GraphQL blobs query returned no repository data.');
    }
    const byPath = new Map(nodes.map((node) => [node.path, node.rawTextBlob]));
    for (const path of chunk) {
      const raw = byPath.get(path);
      if (raw == null) {
        failedCount += 1;
        continue;
      }
      try {
        files.push(parsePackageJson(path, raw));
      } catch {
        failedCount += 1;
      }
    }
  }

  return { files, failedCount };
}

/** Paginated recursive-tree listing (GitLab trees paginate instead of truncating). */
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
