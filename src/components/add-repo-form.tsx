'use client';

import { useState, type FormEvent } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { githubProvider } from '@/lib/providers/github';
import { gitlabProvider } from '@/lib/providers/gitlab';
import { createProxyClient } from '@/lib/proxy-client';
import { getProvider } from '@/lib/providers';
import { describeError } from '@/lib/errors';
import type { RepoConfig } from '@/lib/types';
import { useRepoStore, sameIdentity } from '@/stores/repo-store';
import { useTokenStore } from '@/stores/token-store';

/** Client-side URL parse — invalid URLs are rejected before any request (§6.3). */
function parseRepoUrl(url: string) {
  return url.includes('github.com') ? githubProvider.parseUrl(url) : gitlabProvider.parseUrl(url);
}

export function AddRepoForm({ onAdded }: { onAdded?: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const addRepo = useRepoStore((s) => s.addRepo);
  const selectRepo = useRepoStore((s) => s.selectRepo);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) return;

    let parsed;
    try {
      parsed = parseRepoUrl(trimmed);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Invalid repository URL.';
      setError(message);
      return;
    }

    const draft: RepoConfig = {
      id: crypto.randomUUID(),
      provider: parsed.provider,
      host: parsed.host,
      path: parsed.path,
      displayName: parsed.path,
    };

    // RN RF-02.3: adding without the applicable token is blocked; nothing is saved.
    if (useTokenStore.getState().tokenFor(draft) === null) {
      toast.error(`Configure the access token for ${parsed.host} first (Access Tokens).`);
      return;
    }

    // Dedupe before any network call — same provider+host+path rules as the store.
    const existing = useRepoStore.getState().repos.find((r) => sameIdentity(r, draft));
    if (existing) {
      selectRepo(existing.id);
      setUrl('');
      toast.info('Repository already added — selected it.');
      onAdded?.();
      return;
    }

    setAdding(true);
    try {
      const client = createProxyClient(draft);
      const defaultBranch = await getProvider(draft).getDefaultBranch(client, draft);
      const id = addRepo({ ...draft, defaultBranch });
      selectRepo(id);
      setUrl('');
      onAdded?.();
    } catch (apiError) {
      toast.error(describeError(apiError));
    } finally {
      setAdding(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          aria-label="Repository URL"
        />
        <Button type="submit" variant="secondary" disabled={adding || !url.trim()}>
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
