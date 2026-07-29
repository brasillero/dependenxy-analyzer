'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LoaderIcon, RefreshCwIcon } from '@/components/icons';
import { TokenDialog } from '@/components/token-dialog';
import { executeAnalysis } from '@/lib/execute-analysis';
import { useRepoStore } from '@/stores/repo-store';
import { useViewStore } from '@/stores/view-store';
import { useHasCredentials } from '@/stores/token-store';

/**
 * Re-organize the canvas: resets dragged positions and glides every node back
 * to the freshly computed layout (LayoutAnimator honors the animations
 * setting). Purely local — no refetch, no camera fit.
 */
function ReorganizeButton() {
  const analysis = useViewStore((s) => s.analysis);
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            className="w-full"
            onClick={() => useViewStore.getState().bumpLayoutVersion()}
            disabled={!analysis}
            aria-label="Reorganize nodes"
          >
            Reorganize
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reset node positions to the computed layout</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Icon button that actually refetches: invalidates the repo queries and
 *  re-runs the analysis without moving the camera. */
function RefetchButton() {
  const repos = useRepoStore((s) => s.repos);
  const hasCredentials = useHasCredentials();
  const analyzing = useViewStore((s) => s.analyzing);
  const queryClient = useQueryClient();

  const disabled = repos.length === 0 || analyzing || !hasCredentials;
  const tooltip = !hasCredentials
    ? 'Set credentials first'
    : repos.length === 0
      ? 'Add a repository first'
      : 'Refetch repositories';

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => executeAnalysis(repos, queryClient, { refetch: true, fit: false })}
            disabled={disabled}
            aria-label="Refetch repositories"
          >
            {analyzing ? (
              <LoaderIcon className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{analyzing ? 'Analyzing…' : tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Utility buttons above the side panel: reorganize, then credentials + refetch. */
export function UtilityPanel() {
  return (
    <>
      <ReorganizeButton />
      <div className="flex items-center gap-2">
        <div className="flex-1 [&>button]:w-full">
          <TokenDialog label="Credentials" />
        </div>
        <RefetchButton />
      </div>
    </>
  );
}
