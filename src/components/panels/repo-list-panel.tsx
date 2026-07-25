'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { XIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useRepoStore } from '@/stores/repo-store';

interface Props {
  /** The canvas-selected node id for this panel's repo (single selection), if any. */
  selectedNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
}

/** Last path segment for compact display ('group/sub/project' -> 'project'). */
function shortName(displayName: string): string {
  return displayName.split('/').filter(Boolean).pop() ?? displayName;
}

/** Floating repository list panel — compact, single selection, mirrored to canvas. */
export function RepoListPanel({ selectedNodeId, onSelect }: Props) {
  const repos = useRepoStore((s) => s.repos);
  const removeRepo = useRepoStore((s) => s.removeRepo);

  return (
    <div className="nowheel max-h-[70vh] w-56 space-y-1.5 overflow-y-auto rounded-md border bg-card p-2 shadow-sm">
      <p className="px-1 text-xs font-medium text-muted-foreground">
        Repositories{repos.length > 0 ? ` (${repos.length})` : ''}
      </p>
      {repos.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">
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
              'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors',
              selected && 'border-primary ring-1 ring-primary',
            )}
          >
            <div className="min-w-0 flex-1" title={repo.displayName}>
              <p className="truncate font-mono text-xs font-medium">{shortName(repo.displayName)}</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {repo.provider === 'github' ? 'GitHub' : 'GitLab'}
                </Badge>
                {repo.provider === 'gitlab' && repo.host !== 'gitlab.com' && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {repo.host}
                  </Badge>
                )}
                {(repo.selectedBranch ?? repo.defaultBranch) && (
                  <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px]">
                    {repo.selectedBranch ?? repo.defaultBranch}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              aria-label={`Remove ${repo.displayName}`}
              onClick={(event) => {
                event.stopPropagation();
                if (selected) onSelect(null);
                removeRepo(repo.id);
              }}
            >
              <XIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
