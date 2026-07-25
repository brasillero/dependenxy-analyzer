'use client';

import { useState, type FormEvent } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderIcon, SearchIcon } from '@/components/icons';
import { githubProvider } from '@/lib/providers/github';
import { gitlabProvider } from '@/lib/providers/gitlab';
import { createProxyClient, getJsonWithHeaders } from '@/lib/proxy-client';
import { getProvider, listBranches } from '@/lib/providers';
import { describeError } from '@/lib/errors';
import type { RepoConfig } from '@/lib/types';
import { sameIdentity, useRepoStore } from '@/stores/repo-store';
import { useTokenStore } from '@/stores/token-store';

/** Client-side URL parse — invalid URLs are rejected before any request (§6.3). */
function parseRepoUrl(url: string) {
  return url.includes('github.com') ? githubProvider.parseUrl(url) : gitlabProvider.parseUrl(url);
}

/**
 * Two-stage add flow: validate the URL and fetch the repo's branches (Search),
 * then require a branch selection to confirm (Add repository). The same repo
 * may be added on several branches — dedupe is repo+branch, checked at add
 * time. The chosen branch is persisted and can't be changed later.
 */
export function AddRepoForm({ onAdded }: { onAdded?: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<RepoConfig | null>(null);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const addRepo = useRepoStore((s) => s.addRepo);
  const selectRepo = useRepoStore((s) => s.selectRepo);

  const resetFetch = () => {
    setDraft(null);
    setBranches(null);
    setBranch(null);
  };

  const handleFetch = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) return;

    let parsed;
    try {
      parsed = parseRepoUrl(trimmed);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Invalid repository URL.');
      return;
    }

    const candidate: RepoConfig = {
      id: crypto.randomUUID(),
      provider: parsed.provider,
      host: parsed.host,
      path: parsed.path,
      displayName: parsed.path,
    };

    // RN RF-02.3: adding without the applicable token is blocked; nothing is saved.
    if (useTokenStore.getState().tokenFor(candidate) === null) {
      toast.error(`Configure the access token for ${parsed.host} first (Access Tokens).`);
      return;
    }

    setLoading(true);
    try {
      const client = createProxyClient(candidate);
      const defaultBranch = await getProvider(candidate).getDefaultBranch(client, candidate);
      const pagedGet = <T,>(path: string, searchParams?: Record<string, string>) =>
        getJsonWithHeaders<T>(candidate, path, searchParams);
      const list = await listBranches(candidate, pagedGet);
      setDraft({ ...candidate, defaultBranch });
      setBranches(list);
      // A single available branch is the obvious default; otherwise the repo's default.
      setBranch(list.length === 1 ? list[0] : defaultBranch);
    } catch (apiError) {
      toast.error(describeError(apiError));
      resetFetch();
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    if (!draft || !branch) return;
    const candidate = { ...draft, selectedBranch: branch };
    // Dedupe is repo+branch — the same repo may exist on other branches.
    const existing = useRepoStore.getState().repos.find((r) => sameIdentity(r, candidate));
    if (existing) {
      selectRepo(existing.id);
      toast.info('Repository already added on this branch — selected it.');
      setUrl('');
      resetFetch();
      onAdded?.();
      return;
    }
    const id = addRepo(candidate);
    selectRepo(id);
    setUrl('');
    resetFetch();
    onAdded?.();
  };

  return (
    <form onSubmit={handleFetch} className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            resetFetch();
          }}
          placeholder="https://github.com/owner/repo"
          aria-label="Repository URL"
        />
        <Button type="submit" variant="secondary" className="w-24 shrink-0" disabled={loading || !url.trim()}>
          {loading ? (
            <LoaderIcon className="h-4 w-4 animate-spin" aria-label="Fetching" />
          ) : (
            <>
              <SearchIcon className="h-4 w-4" />
              Search
            </>
          )}
        </Button>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="add-repo-branch" className="text-sm font-medium">
          Branch
        </label>
        <Select value={branch ?? undefined} onValueChange={setBranch} disabled={!branches}>
          <SelectTrigger id="add-repo-branch" aria-label="Branch" className="w-full">
            <SelectValue
              placeholder={loading ? 'Loading branches…' : 'Available after fetching the URL'}
            />
          </SelectTrigger>
          <SelectContent>
            {(branches ?? []).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" className="w-full" onClick={handleAdd} disabled={!branch}>
        Add repository
      </Button>
    </form>
  );
}
