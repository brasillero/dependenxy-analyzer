'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TokenDialog } from '@/components/token-dialog';
import { LoaderIcon, PlayIcon, UsersIcon } from '@/components/icons';
import { runAnalysis } from '@/lib/analyze';
import { toast } from '@/lib/toast';
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
    <div className="flex items-center gap-1 rounded-md border bg-card px-2 py-1 shadow-sm">
      {!hasCredentials && (
        <>
          <TokenDialog />
          <span className="px-1 text-xs text-muted-foreground">Set credentials to enable tools</span>
          <Separator orientation="vertical" className="mx-1 h-5" />
        </>
      )}
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        value={enabledTypes}
        onValueChange={handleDepTypesChange}
        disabled={!hasCredentials}
      >
        {DEP_TYPES.map((type) => (
          <ToggleGroupItem
            key={type}
            value={type}
            aria-label={DEP_TYPE_LABELS[type]}
            title={DEP_TYPE_LABELS[type]}
          >
            {DEP_TYPE_SHORT[type]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Toggle
        size="sm"
        variant="outline"
        pressed={sharedOnly}
        onPressedChange={onSharedOnlyChange}
        aria-label="Show shared only"
        title="Show shared only"
        disabled={!hasCredentials}
      >
        <UsersIcon className="h-4 w-4" />
      </Toggle>
    </div>
  );
}

/** Primary Analyze action — sits outside the utility panel, to its right. */
export function AnalyzeButton() {
  const repos = useRepoStore((s) => s.repos);
  const hasCredentials = useHasCredentials();
  const [analyzing, setAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const disabled = repos.length === 0 || analyzing || !hasCredentials;
  const title = !hasCredentials
    ? 'Set credentials first'
    : repos.length === 0
      ? 'Add a repository first'
      : 'Analyze';

  const handleAnalyze = async () => {
    if (disabled) return;
    setAnalyzing(true);
    try {
      const { groups, failed } = await runAnalysis(repos, queryClient);
      useViewStore.getState().setAnalysis(groups, failed, failed.length === repos.length);
      if (failed.length === repos.length) {
        toast.error('No repository could be analyzed.');
      }
    } catch {
      toast.error('Analysis failed unexpectedly.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Button
      size="icon"
      onClick={handleAnalyze}
      disabled={disabled}
      aria-label="Analyze"
      title={analyzing ? 'Analyzing…' : title}
    >
      {analyzing ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <PlayIcon className="h-4 w-4" />}
    </Button>
  );
}
