import type { QueryClient } from '@tanstack/react-query';
import type { DependencyGroup, RepoConfig } from './types';
import { fetchPackageJsonFiles, type PackageFilesResult } from './package-files';
import { flattenDependencies, groupDependencies, type RepoFiles } from './grouping';
import { describeError } from './errors';
import { useTokenStore } from '@/stores/token-store';

export interface AnalysisFailure {
  repoName: string;
  error: string;
}

export interface AnalysisResult {
  groups: DependencyGroup[];
  failed: AnalysisFailure[];
}

const ANALYSIS_STALE_TIME = 5 * 60 * 1000;

/**
 * Cross-repo analysis (RF-08). Each repo is read at its effective branch via
 * ensureQueryData — warm cache entries are reused untouched (§3.6). Failures
 * (missing token, 401/404/rate limit, network) are collected per repo and
 * never abort the run.
 */
export async function runAnalysis(
  repos: RepoConfig[],
  queryClient: QueryClient,
): Promise<AnalysisResult> {
  const failed: AnalysisFailure[] = [];
  const perRepo: RepoFiles[] = [];

  for (const repo of repos) {
    const branch = repo.selectedBranch ?? repo.defaultBranch;
    if (!branch) {
      failed.push({ repoName: repo.displayName, error: 'No branch selected.' });
      continue;
    }
    if (useTokenStore.getState().tokenFor(repo) === null) {
      failed.push({
        repoName: repo.displayName,
        error: 'No access token configured for this provider/host — open Access Tokens.',
      });
      continue;
    }
    try {
      const result = await queryClient.ensureQueryData<PackageFilesResult>({
        queryKey: ['pkg-files', repo.id, branch],
        queryFn: () => fetchPackageJsonFiles(repo, branch),
        staleTime: ANALYSIS_STALE_TIME,
      });
      perRepo.push({ repo, files: result.files });
    } catch (error) {
      failed.push({ repoName: repo.displayName, error: describeError(error) });
    }
  }

  return { groups: groupDependencies(flattenDependencies(perRepo)), failed };
}
