'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LoaderIcon, RefreshCwIcon } from '@/components/icons';
import { executeAnalysis } from '@/lib/execute-analysis';
import { useRepoStore } from '@/stores/repo-store';
import { useViewStore } from '@/stores/view-store';
import { useHasCredentials } from '@/stores/token-store';

/**
 * Manual refresh — the analysis itself is automatic (it runs when the repo
 * list or credentials change); this only forces a re-run.
 */
export function RefreshButton() {
  const repos = useRepoStore((s) => s.repos);
  const hasCredentials = useHasCredentials();
  const analyzing = useViewStore((s) => s.analyzing);
  const queryClient = useQueryClient();

  const disabled = repos.length === 0 || analyzing || !hasCredentials;
  const tooltip = !hasCredentials
    ? 'Set credentials first'
    : repos.length === 0
      ? 'Add a repository first'
      : 'Refresh analysis';

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            className="w-full"
            onClick={() => executeAnalysis(repos, queryClient)}
            disabled={disabled}
            aria-label="Refresh analysis"
          >
            {analyzing ? (
              <LoaderIcon className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </TooltipTrigger>
        <TooltipContent>{analyzing ? 'Analyzing…' : tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
