'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AddRepoForm } from '@/components/add-repo-form';
import { TokenDialog } from '@/components/token-dialog';
import { LoaderIcon, PlayIcon, PlusIcon, UsersIcon } from '@/components/icons';
import { runAnalysis } from '@/lib/analyze';
import { toast } from '@/lib/toast';
import { DEP_TYPES, type DepType } from '@/lib/types';
import { useRepoStore } from '@/stores/repo-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useViewStore } from '@/stores/view-store';

const DEP_TYPE_LABELS: Record<DepType, string> = {
  dependencies: 'Dependencies',
  devDependencies: 'Dev dependencies',
  peerDependencies: 'Peer dependencies',
};

function IconTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface Props {
  sharedOnly: boolean;
  onSharedOnlyChange: (value: boolean) => void;
}

/** Compact bottom-center utility panel: icon buttons + toggle groups with tooltips. */
export function UtilityPanel({ sharedOnly, onSharedOnlyChange }: Props) {
  const repos = useRepoStore((s) => s.repos);
  const enabledDepTypes = useSettingsStore((s) => s.enabledDepTypes);
  const toggleDepType = useSettingsStore((s) => s.toggleDepType);
  const [analyzing, setAnalyzing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleAnalyze = async () => {
    if (repos.length === 0 || analyzing) return;
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
      <div className="flex items-center gap-1 rounded-full border bg-card px-2 py-1 shadow-md">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <IconTooltip label="Add repository">
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Add repository">
                <PlusIcon className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </IconTooltip>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add repository</DialogTitle>
            </DialogHeader>
            <AddRepoForm onAdded={() => setAddOpen(false)} />
          </DialogContent>
        </Dialog>

        <IconTooltip label="Access tokens">
          <TokenDialog />
        </IconTooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToggleGroup
          type="multiple"
          size="sm"
          variant="outline"
          value={enabledTypes}
          onValueChange={handleDepTypesChange}
        >
          {DEP_TYPES.map((type) => (
            <IconTooltip key={type} label={DEP_TYPE_LABELS[type]}>
              <ToggleGroupItem value={type} aria-label={DEP_TYPE_LABELS[type]} className="px-2 text-xs">
                {type === 'dependencies' ? 'deps' : type === 'devDependencies' ? 'dev' : 'peer'}
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
          >
            <UsersIcon className="h-4 w-4" />
          </Toggle>
        </IconTooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <IconTooltip label={analyzing ? 'Analyzing…' : 'Analyze'}>
          <Button
            size="icon"
            onClick={handleAnalyze}
            disabled={repos.length === 0 || analyzing}
            aria-label="Analyze"
          >
            {analyzing ? (
              <LoaderIcon className="h-4 w-4 animate-spin" />
            ) : (
              <PlayIcon className="h-4 w-4" />
            )}
          </Button>
        </IconTooltip>
      </div>
    </TooltipProvider>
  );
}
