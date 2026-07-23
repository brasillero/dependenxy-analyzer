import type { Provider, RepoConfig, PackageJsonFile } from '@/lib/types';

export interface ParsedRepoUrl {
  provider: Provider;
  host: string;
  path: string;
}

/** Minimal HTTP surface the providers need — implemented by the Ky proxy client. */
export interface ProxyClient {
  /** GET JSON through the app proxy. Throws StatusError on non-2xx. */
  getJson<T>(path: string, searchParams?: Record<string, string>): Promise<T>;
  /** GET plain text through the app proxy (GitLab raw files). */
  getText(path: string, searchParams?: Record<string, string>): Promise<string>;
}

/** JSON plus upstream response headers (needed for Link / x-next-page pagination). */
export interface PagedResponse<T> {
  data: T;
  headers: Headers;
}
export type PagedGet = <T>(
  path: string,
  searchParams?: Record<string, string>,
) => Promise<PagedResponse<T>>;

/**
 * Symmetric interface isolating GitHub/GitLab API differences (spec §3.3).
 * Every method receives the repo so self-hosted GitLab hosts work uniformly.
 */
export interface GitProvider {
  parseUrl(url: string): ParsedRepoUrl;
  getDefaultBranch(client: ProxyClient, repo: RepoConfig): Promise<string>;
  listBranches(pagedGet: PagedGet, repo: RepoConfig): Promise<string[]>;
  listPackageJsonPaths(client: ProxyClient, repo: RepoConfig, branch: string): Promise<string[]>;
  fetchPackageJson(
    client: ProxyClient,
    repo: RepoConfig,
    branch: string,
    path: string,
  ): Promise<PackageJsonFile>;
}
