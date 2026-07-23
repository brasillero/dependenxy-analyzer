'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PackageJsonCard } from '@/components/package-json-card';
import { effectiveBranch, usePackageJsonFiles } from '@/hooks/use-package-json-files';
import { describeError } from '@/lib/errors';
import { DEP_TYPES } from '@/lib/types';
import { useRepoStore } from '@/stores/repo-store';
import { useSettingsStore } from '@/stores/settings-store';

export function DependencyPanel() {
  const repos = useRepoStore((s) => s.repos);
  const selectedRepoId = useRepoStore((s) => s.selectedRepoId);
  const enabledDepTypes = useSettingsStore((s) => s.enabledDepTypes);
  const queryClient = useQueryClient();

  const repo = repos.find((r) => r.id === selectedRepoId) ?? null;
  const branch = repo ? effectiveBranch(repo) : undefined;
  const { data, isLoading, error } = usePackageJsonFiles(repo, branch);

  useEffect(() => {
    if (error) toast.error(describeError(error));
  }, [error]);

  if (repos.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md space-y-2 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No repositories yet</p>
          <p>
            Open <span className="font-medium">Access Tokens</span> to add your GitHub/GitLab
            tokens, paste a repository URL in the sidebar, pick a branch, and its package.json
            dependencies will appear here. Use <span className="font-medium">Analyze</span> to
            detect version drift across all repositories.
          </p>
        </div>
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a repository in the sidebar.
      </div>
    );
  }

  const handleReload = () => {
    // RN RF-06.2: invalidate exactly the active repo+branch pair.
    queryClient.invalidateQueries({ queryKey: ['pkg-files', repo.id, branch] });
    queryClient.invalidateQueries({ queryKey: ['branches', repo.id] });
  };

  const allTypesOff = DEP_TYPES.every((type) => !enabledDepTypes[type]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-mono text-sm font-medium">{repo.displayName}</h2>
        {branch && <span className="text-sm text-muted-foreground">on {branch}</span>}
        {data && <Badge variant="secondary">{data.files.length} package.json</Badge>}
        {data && data.failedCount > 0 && (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            {data.failedCount} file(s) skipped
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8"
          aria-label="Reload"
          onClick={handleReload}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">{describeError(error)}</CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {data && allTypesOff && (
        <p className="text-sm text-muted-foreground">
          All dependency types are hidden — re-enable at least one type in the header.
        </p>
      )}

      {data && !allTypesOff && data.files.length === 0 && (
        <p className="text-sm text-muted-foreground">No package.json files found in this branch.</p>
      )}

      {data &&
        !allTypesOff &&
        data.files.map((file) => (
          <PackageJsonCard key={file.path} file={file} enabledTypes={enabledDepTypes} />
        ))}
    </div>
  );
}
