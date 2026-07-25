'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TokenDialog } from '@/components/token-dialog';
import { LoaderIcon, RefreshCwIcon, UsersIcon } from '@/components/icons';
import { executeAnalysis } from '@/lib/execute-analysis';
import { DEP_TYPES, type DepType } from '@/lib/types';
import { useRepoStore } from '@/stores/repo-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useTokenStore } from '@/stores/token-store';
import { useViewStore } from '@/stores/view-store';

const DEP_TYPE_LABELS: Record<DepType, string> = {
  dependencies: 'Dependencies',
  devDependencies: 'Dev dependencies',
  peerDependencies: 'Peer dependencies',
};

const DEP_TYPE_SHORT: Record<DepType, string> = {
  dependencies: 'deps',
  devDependencies: 'dev',
  peerDependencies: 'peer',
};

function IconTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function useHasCredentials(): boolean {
  const githubToken = useTokenStore((s) => s.githubToken);
  const gitlabTokens = useTokenStore((s) => s.gitlabTokens);
  return githubToken !== '' || Object.keys(gitlabTokens).length > 0;
}

interface Props {
  sharedOnly: boolean;
  onSharedOnlyChange: (value: boolean) => void;
}

/** Squared utility panel: dep-type toggle group + shared-only toggle. Disabled
 * until credentials are set — then it points at the token dialog instead. */
export function UtilityPanel({ sharedOnly, onSharedOnlyChange }: Props) {
  const hasCredentials = useHasCredentials();
  const enabledDepTypes = useSettingsStore((s) => s.enabledDepTypes);
  const toggleDepType = useSettingsStore((s) => s.toggleDepType);

  const enabledTypes = DEP_TYPES.filter((type) => enabledDepTypes[type]);
  const handleDepTypesChange = (next: string[]) => {
    for (const type of DEP_TYPES) {
      if (enabledDepTypes[type] !== next.includes(type)) {
        toggleDepType(type);
      }
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 rounded-md border bg-card px-2 py-1 shadow-sm">
        {!hasCredentials && (
          <>
            <TokenDialog />
            <span className="px-1 text-xs text-muted-foreground">Set credentials to enable tools</span>
            <Separator orientation="vertical" className="mx-1 h-5" />
          </>
        )}
        <span className="pl-1 text-xs text-muted-foreground">Types</span>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={enabledTypes}
          onValueChange={handleDepTypesChange}
          disabled={!hasCredentials}
        >
          {DEP_TYPES.map((type) => (
            <IconTooltip key={type} label={DEP_TYPE_LABELS[type]}>
              <ToggleGroupItem value={type} aria-label={DEP_TYPE_LABELS[type]}>
                {DEP_TYPE_SHORT[type]}
              </ToggleGroupItem>
            </IconTooltip>
          ))}
        </ToggleGroup>
        <IconTooltip label="Show shared only">
          <Toggle
            size="sm"
            variant="outline"
            pressed={sharedOnly}
            onPressedChange={onSharedOnlyChange}
            aria-label="Show shared only"
            disabled={!hasCredentials}
          >
            <UsersIcon className="h-4 w-4" />
            Shared
          </Toggle>
        </IconTooltip>
      </div>
    </TooltipProvider>
  );
}

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
      <IconTooltip label={analyzing ? 'Analyzing…' : tooltip}>
        <Button
          size="sm"
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
      </IconTooltip>
    </TooltipProvider>
  );
}
