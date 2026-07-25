'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BranchSelector } from '@/components/branch-selector';
import { XIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useRepoStore } from '@/stores/repo-store';

interface Props {
  /** The canvas-selected node id for this panel's repo (single selection), if any. */
  selectedNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
}

/** Floating repository list panel — single selection, mirrored to canvas selection. */
export function RepoListPanel({ selectedNodeId, onSelect }: Props) {
  const repos = useRepoStore((s) => s.repos);
  const removeRepo = useRepoStore((s) => s.removeRepo);

  return (
    <div className="nowheel max-h-[70vh] w-72 space-y-2 overflow-y-auto rounded-md border bg-card p-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">
        Repositories{repos.length > 0 ? ` (${repos.length})` : ''}
      </p>
      {repos.length === 0 && (
        <p className="text-xs text-muted-foreground">
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
              'cursor-pointer space-y-2 rounded-md border p-2.5 transition-colors',
              selected && 'border-primary ring-1 ring-primary',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-medium" title={repo.displayName}>
                  {repo.displayName}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="secondary">{repo.provider === 'github' ? 'GitHub' : 'GitLab'}</Badge>
                  {repo.provider === 'gitlab' && repo.host !== 'gitlab.com' && (
                    <Badge variant="outline">{repo.host}</Badge>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                aria-label={`Remove ${repo.displayName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (selected) onSelect(null);
                  removeRepo(repo.id);
                }}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
            <div onClick={(event) => event.stopPropagation()}>
              <BranchSelector repo={repo} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
