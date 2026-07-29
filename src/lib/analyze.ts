import type { QueryClient } from '@tanstack/react-query';
import type { DependencyGroup, RepoConfig } from './types';
import { fetchPackageJsonFiles, mapWithConcurrency, type PackageFilesResult } from './package-files';
import { flattenDependencies, groupDependencies, type RepoFiles } from './grouping';
import { describeError } from './errors';
import { effectiveBranch } from '@/lib/package-files';
import { useTokenStore } from '@/stores/token-store';

export interface AnalysisFailure {
  repoName: string;
  error: string;
}

export interface AnalysisResult {
  groups: DependencyGroup[];
  failed: AnalysisFailure[];
}

/**
 * Cache never goes stale on its own: a fetch happens only when the query is
 * missing or was explicitly invalidated (see executeAnalysis' refresh path).
 */
const ANALYSIS_STALE_TIME = Infinity;

/**
 * Cross-repo analysis (RF-08). Repos are fetched in parallel (bounded
 * concurrency — TanStack Query dedupes concurrent identical keys); each repo
 * is read at its effective branch via fetchQuery with staleTime: Infinity, so
 * warm cache entries are returned untouched and only an explicit
 * invalidateQueries (manual refresh) makes fetchQuery hit the network.
 * Failures (missing token, 401/404/rate limit, network) are collected per
 * repo and never abort the run.
 */
export async function runAnalysis(
  repos: RepoConfig[],
  queryClient: QueryClient,
): Promise<AnalysisResult> {
  type Outcome = { failure: AnalysisFailure } | { files: RepoFiles };
  const outcomes = await mapWithConcurrency(repos, 3, async (repo): Promise<Outcome> => {
    const branch = effectiveBranch(repo);
    if (!branch) {
      return { failure: { repoName: repo.displayName, error: 'No branch selected.' } };
    }
    if (useTokenStore.getState().tokenFor(repo) === null) {
      return {
        failure: {
          repoName: repo.displayName,
          error: 'No access token configured for this provider/host — open Access Tokens.',
        },
      };
    }
    try {
      const result = await queryClient.fetchQuery<PackageFilesResult>({
        queryKey: ['repositories', repo.id, branch],
        queryFn: () => fetchPackageJsonFiles(repo, branch),
        staleTime: ANALYSIS_STALE_TIME,
      });
      return { files: { repo, files: result.files } };
    } catch (error) {
      return { failure: { repoName: repo.displayName, error: describeError(error) } };
    }
  });

  const failed = outcomes.flatMap((outcome) => ('failure' in outcome ? [outcome.failure] : []));
  const perRepo = outcomes.flatMap((outcome) => ('files' in outcome ? [outcome.files] : []));
  return { groups: groupDependencies(flattenDependencies(perRepo)), failed };
}
