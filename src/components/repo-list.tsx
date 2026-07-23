'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BranchSelector } from '@/components/branch-selector';
import { cn } from '@/lib/utils';
import { useRepoStore } from '@/stores/repo-store';

export function RepoList() {
  const repos = useRepoStore((s) => s.repos);
  const selectedRepoId = useRepoStore((s) => s.selectedRepoId);
  const selectRepo = useRepoStore((s) => s.selectRepo);
  const removeRepo = useRepoStore((s) => s.removeRepo);

  return (
    <div className="space-y-2">
      {repos.map((repo) => (
        <Card
          key={repo.id}
          role="button"
          tabIndex={0}
          className={cn(
            'cursor-pointer transition-colors',
            repo.id === selectedRepoId && 'border-primary ring-1 ring-primary',
          )}
          onClick={() => selectRepo(repo.id)}
          onKeyDown={(event) => {
            // Ignore keys bubbling from nested controls (e.g. the remove button).
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault(); // Space must not scroll the page (§5.5).
              selectRepo(repo.id);
            }
          }}
        >
          <CardContent className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-medium">{repo.displayName}</p>
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
                  removeRepo(repo.id);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div onClick={(event) => event.stopPropagation()}>
              <BranchSelector repo={repo} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
