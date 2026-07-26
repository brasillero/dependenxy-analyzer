import type { QueryClient } from '@tanstack/react-query';
import type { RepoConfig } from './types';
import { runAnalysis } from './analyze';
import { toast } from './toast';
import { useViewStore } from '@/stores/view-store';

/**
 * Single analysis entry point for both the automatic trigger (repo list or
 * credentials change) and the manual Refresh button. Guards against
 * concurrent runs via the view store's analyzing flag.
 *
 * Options:
 * - `refetch`: invalidate cached repo queries first, forcing fresh fetches
 *   (manual refresh). Auto runs rely on normal cache/staleTime behavior.
 * - `fit`: bump fitVersion so the viewport re-frames the graph (auto runs).
 *   Manual refresh leaves the camera where the user put it.
 */
export async function executeAnalysis(
  repos: RepoConfig[],
  queryClient: QueryClient,
  { refetch = false, fit = true }: { refetch?: boolean; fit?: boolean } = {},
): Promise<void> {
  if (repos.length === 0 || useViewStore.getState().analyzing) return;
  useViewStore.getState().setAnalyzing(true);
  try {
    if (refetch) {
      await queryClient.invalidateQueries({ queryKey: ['repositories'] });
    }
    const { groups, failed } = await runAnalysis(repos, queryClient);
    useViewStore.getState().setAnalysis(groups, failed, failed.length === repos.length);
    // Fresh results deserve a fresh layout — reset any dragged positions.
    useViewStore.getState().bumpLayoutVersion();
    if (fit) {
      useViewStore.getState().bumpFitVersion();
    }
    if (failed.length === repos.length) {
      toast.error('No repository could be analyzed.');
    }
  } catch {
    toast.error('Analysis failed unexpectedly.');
  } finally {
    useViewStore.getState().setAnalyzing(false);
  }
}
