'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { AddRepoForm } from '@/components/add-repo-form';
import { TokenDialog } from '@/components/token-dialog';
import { PlusIcon, XIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { DEP_TYPES, type DepType } from '@/lib/types';
import { useRepoStore } from '@/stores/repo-store';
import { useSettingsStore } from '@/stores/settings-store';

interface Props {
  /** The canvas-selected node id for this panel's repo (single selection), if any. */
  selectedNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
  sharedOnly: boolean;
  onSharedOnlyChange: (value: boolean) => void;
}

/** Last path segment for compact display ('group/sub/project' -> 'project'). */
function shortName(displayName: string): string {
  return displayName.split('/').filter(Boolean).pop() ?? displayName;
}

const DEP_TYPE_LABELS: Record<DepType, string> = {
  dependencies: 'dependencies',
  devDependencies: 'devDependencies',
  peerDependencies: 'peerDependencies',
};

/** One unified side panel: dependency filters + repository list, top-right. */
export function SidePanel({ selectedNodeId, onSelect, sharedOnly, onSharedOnlyChange }: Props) {
  const repos = useRepoStore((s) => s.repos);
  const removeRepo = useRepoStore((s) => s.removeRepo);
  const enabledDepTypes = useSettingsStore((s) => s.enabledDepTypes);
  const toggleDepType = useSettingsStore((s) => s.toggleDepType);
  const autoFitSelection = useSettingsStore((s) => s.autoFitSelection);
  const toggleAutoFitSelection = useSettingsStore((s) => s.toggleAutoFitSelection);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="nowheel max-h-[80vh] w-64 space-y-2 overflow-y-auto rounded-md border bg-card p-3 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Dependencies to show</p>
      <div className="space-y-1.5">
        {DEP_TYPES.map((type) => (
          <label key={type} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={enabledDepTypes[type]}
              onCheckedChange={() => toggleDepType(type)}
              aria-label={DEP_TYPE_LABELS[type]}
            />
            <span className="font-mono">{DEP_TYPE_LABELS[type]}</span>
          </label>
        ))}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={sharedOnly}
            onCheckedChange={(value) => onSharedOnlyChange(value === true)}
            aria-label="Hide unique"
          />
          Hide unique
        </label>
      </div>

      <Separator />

      <p className="text-sm font-medium text-muted-foreground">Controls</p>
      <div className="space-y-1.5">
        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
          Fit selection
          <Switch
            checked={autoFitSelection}
            onCheckedChange={toggleAutoFitSelection}
            aria-label="Fit selection"
          />
        </label>
      </div>

      <Separator />

      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-medium text-muted-foreground">
          Repositories{repos.length > 0 ? ` (${repos.length})` : ''}
        </p>
        <div className="flex items-center">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Add repository">
                <PlusIcon />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add repository</DialogTitle>
              </DialogHeader>
              <AddRepoForm onAdded={() => setAddOpen(false)} />
            </DialogContent>
          </Dialog>
          <TokenDialog size="icon-sm" />
        </div>
      </div>

      {repos.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          No repositories yet — use <span className="font-medium">Add repository</span>.
        </p>
      )}
      {repos.map((repo) => {
        const nodeId = `repo_${repo.id}`;
        const selected = selectedNodeId === nodeId;
        return (
          <div
            key={repo.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : nodeId)}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onSelect(selected ? null : nodeId);
              }
            }}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md border p-2.5 transition-colors',
              selected && 'border-primary ring-1 ring-primary',
            )}
          >
            <div className="min-w-0 flex-1" title={repo.displayName}>
              <p className="truncate font-mono text-sm font-medium">{shortName(repo.displayName)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="secondary">{repo.provider === 'github' ? 'GitHub' : 'GitLab'}</Badge>
                {repo.provider === 'gitlab' && repo.host !== 'gitlab.com' && (
                  <Badge variant="outline">{repo.host}</Badge>
                )}
                {(repo.selectedBranch ?? repo.defaultBranch) && (
                  <Badge variant="outline" className="font-mono">
                    {repo.selectedBranch ?? repo.defaultBranch}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${repo.displayName}`}
              onClick={(event) => {
                event.stopPropagation();
                if (selected) onSelect(null);
                removeRepo(repo.id);
              }}
            >
              <XIcon />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
