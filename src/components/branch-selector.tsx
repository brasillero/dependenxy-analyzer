'use client';

import { useEffect } from 'react';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBranches } from '@/hooks/use-branches';
import { effectiveBranch } from '@/hooks/use-package-json-files';
import { describeError } from '@/lib/errors';
import type { RepoConfig } from '@/lib/types';
import { useRepoStore } from '@/stores/repo-store';
import { useTokenStore } from '@/stores/token-store';

export function BranchSelector({ repo }: { repo: RepoConfig }) {
  const setBranch = useRepoStore((s) => s.setBranch);
  const hasToken = useTokenStore((s) => s.tokenFor(repo) !== null);
  const { data: branches, isLoading, error } = useBranches(repo);

  useEffect(() => {
    if (error) toast.error(describeError(error));
  }, [error]);

  if (!hasToken) {
    return (
      <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400">
        token needed
      </Badge>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-9 w-full" aria-label="Loading branches" />;
  }

  if (error) {
    return <Badge variant="destructive">branch error</Badge>;
  }

  return (
    <Select
      value={effectiveBranch(repo)}
      onValueChange={(branch) => setBranch(repo.id, branch)}
    >
      <SelectTrigger className="w-full" aria-label={`Branch for ${repo.displayName}`}>
        <SelectValue placeholder="Select branch" />
      </SelectTrigger>
      <SelectContent>
        {(branches ?? []).map((branch) => (
          <SelectItem key={branch} value={branch}>
            {branch}
          </SelectItem>
        ))}
        {/* Persisted branch deleted upstream: surface it (disabled) instead of a blank
            trigger — never silently rewrite the persisted selection. */}
        {repo.selectedBranch && !(branches ?? []).includes(repo.selectedBranch) && (
          <SelectItem value={repo.selectedBranch} disabled>
            {repo.selectedBranch} (not found)
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
