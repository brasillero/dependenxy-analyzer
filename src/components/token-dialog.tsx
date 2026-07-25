'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { KeyIcon } from '@/components/icons';
import { DEFAULT_GITLAB_HOST, useTokenStore } from '@/stores/token-store';
import { useRepoStore } from '@/stores/repo-store';

export function TokenDialog({
  size = 'icon',
  label,
}: {
  size?: 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';
  /** When set, the trigger is a labeled outline button instead of an icon button. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const githubToken = useTokenStore((s) => s.githubToken);
  const gitlabTokens = useTokenStore((s) => s.gitlabTokens);
  const setGithubToken = useTokenStore((s) => s.setGithubToken);
  const setGitlabToken = useTokenStore((s) => s.setGitlabToken);
  const clearAll = useTokenStore((s) => s.clearAll);
  const repos = useRepoStore((s) => s.repos);

  const hasCredentials = githubToken !== '' || Object.keys(gitlabTokens).length > 0;

  // gitlab.com is always present; self-hosted hosts appear as repos are added.
  const gitlabHosts = useMemo(() => {
    const hosts = new Set<string>([DEFAULT_GITLAB_HOST]);
    for (const repo of repos) {
      if (repo.provider === 'gitlab') hosts.add(repo.host);
    }
    return [...hosts];
  }, [repos]);

  return (
    <TooltipProvider delayDuration={300}>
      <Dialog open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              {label ? (
                <Button variant="outline" size="sm">
                  <KeyIcon className="h-4 w-4" />
                  {label}
                </Button>
              ) : (
                <Button variant="ghost" size={size} aria-label="Access Tokens">
                  <KeyIcon className="h-4 w-4" />
                </Button>
              )}
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{hasCredentials ? 'Access Tokens' : 'Set your credentials'}</TooltipContent>
        </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Access Tokens</DialogTitle>
          <DialogDescription>
            Tokens are kept in memory only and never stored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="token-github" className="text-sm font-medium">
              GitHub
            </label>
            <Input
              id="token-github"
              type="password"
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              placeholder="ghp_…"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
          </div>
          {gitlabHosts.map((host) => (
            <div key={host} className="space-y-1.5">
              <label htmlFor={`token-gitlab-${host}`} className="text-sm font-medium">
                {host}
              </label>
              <Input
                id={`token-gitlab-${host}`}
                type="password"
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                placeholder="glpat-…"
                value={gitlabTokens[host] ?? ''}
                onChange={(e) => setGitlabToken(host, e.target.value)}
              />
            </div>
          ))}
          <Button variant="destructive" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  );
}
