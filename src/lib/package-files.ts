import type { PackageJsonFile, RepoConfig } from './types';
import { createProxyClient, getJsonWithHeaders } from './proxy-client';
import { getProvider, listPackageJsonPaths } from './providers';
import { fetchPackageJsonsBatched } from './providers/gitlab';

export interface PackageFilesResult {
  files: PackageJsonFile[];
  failedCount: number;
}

export const FETCH_CONCURRENCY = 8;

/** Effective branch: explicit user selection wins over the repo default. */
export function effectiveBranch(repo: RepoConfig): string | undefined {
  return repo.selectedBranch ?? repo.defaultBranch;
}

/** Run async tasks over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Fetch every package.json path with bounded concurrency (max 8 in flight —
 * spec §4.6). Individual failures are skipped and counted, never fatal.
 */
export async function collectFiles(
  paths: string[],
  fetchOne: (path: string) => Promise<PackageJsonFile>,
): Promise<PackageFilesResult> {
  let failedCount = 0;
  const results = await mapWithConcurrency(paths, FETCH_CONCURRENCY, async (path) => {
    try {
      return await fetchOne(path);
    } catch {
      failedCount += 1;
      return null;
    }
  });
  return {
    files: results.filter((f): f is PackageJsonFile => f !== null),
    failedCount,
  };
}

/**
 * Full read of one repo at one branch: list package.json paths (monorepo
 * scan), then fetch each file. This is the queryFn shared by
 * usePackageJsonFiles and the Analyze orchestration (same cache entry).
 */
export async function fetchPackageJsonFiles(
  repo: RepoConfig,
  branch: string,
): Promise<PackageFilesResult> {
  const client = createProxyClient(repo);
  const pagedGet = <T,>(path: string, searchParams?: Record<string, string>) =>
    getJsonWithHeaders<T>(repo, path, searchParams);
  const paths = await listPackageJsonPaths(repo, branch, client, pagedGet);
  if (repo.provider === 'gitlab') {
    try {
      // One GraphQL request per 50 files instead of one REST call per file.
      return await fetchPackageJsonsBatched(repo, branch, paths);
    } catch {
      // Older self-hosted GitLab may lack the blobs(paths:) field — fall back
      // to the per-file REST flow below.
    }
  }
  return collectFiles(paths, (path) =>
    getProvider(repo).fetchPackageJson(client, repo, branch, path),
  );
}
