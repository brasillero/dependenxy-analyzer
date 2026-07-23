import pLimit from 'p-limit';
import type { PackageJsonFile, RepoConfig } from './types';
import { createProxyClient, getJsonWithHeaders } from './proxy-client';
import { getProvider, listPackageJsonPaths } from './providers';

export interface PackageFilesResult {
  files: PackageJsonFile[];
  failedCount: number;
}

export const FETCH_CONCURRENCY = 8;

/**
 * Fetch every package.json path with bounded concurrency (max 8 in flight —
 * spec §4.6). Individual failures are skipped and counted, never fatal.
 */
export async function collectFiles(
  paths: string[],
  fetchOne: (path: string) => Promise<PackageJsonFile>,
): Promise<PackageFilesResult> {
  const limit = pLimit(FETCH_CONCURRENCY);
  let failedCount = 0;
  const results = await Promise.all(
    paths.map((path) =>
      limit(async () => {
        try {
          return await fetchOne(path);
        } catch {
          failedCount += 1;
          return null;
        }
      }),
    ),
  );
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
  return collectFiles(paths, (path) =>
    getProvider(repo).fetchPackageJson(client, repo, branch, path),
  );
}
