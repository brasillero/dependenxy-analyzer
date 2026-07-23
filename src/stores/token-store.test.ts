import { describe, it, expect, beforeEach } from 'vitest';
import { useTokenStore } from './token-store';
import type { RepoConfig } from '@/lib/types';

const githubRepo = { provider: 'github', host: 'github.com' } as RepoConfig;
const gitlabComRepo = { provider: 'gitlab', host: 'gitlab.com' } as RepoConfig;
const selfHostedRepo = { provider: 'gitlab', host: 'gitlab.acme.com' } as RepoConfig;

beforeEach(() => {
  useTokenStore.getState().clearAll();
});

describe('token-store', () => {
  it('starts empty (tokens never persisted)', () => {
    expect(useTokenStore.getState().tokenFor(githubRepo)).toBeNull();
  });

  it('resolves GitHub token regardless of path', () => {
    useTokenStore.getState().setGithubToken('ghp_x');
    expect(useTokenStore.getState().tokenFor(githubRepo)).toBe('ghp_x');
  });

  it('resolves GitLab tokens per host, with no silent fallback (RN RF-01.2)', () => {
    useTokenStore.getState().setGitlabToken('gitlab.acme.com', 'glpat-acme');
    expect(useTokenStore.getState().tokenFor(selfHostedRepo)).toBe('glpat-acme');
    expect(useTokenStore.getState().tokenFor(gitlabComRepo)).toBeNull();
  });

  it('stores gitlab.com token under the default host key', () => {
    useTokenStore.getState().setGitlabToken('gitlab.com', 'glpat-com');
    expect(useTokenStore.getState().tokenFor(gitlabComRepo)).toBe('glpat-com');
  });

  it('clearAll wipes everything', () => {
    useTokenStore.getState().setGithubToken('ghp_x');
    useTokenStore.getState().setGitlabToken('gitlab.com', 'glpat-com');
    useTokenStore.getState().clearAll();
    expect(useTokenStore.getState().githubToken).toBe('');
    expect(useTokenStore.getState().gitlabTokens).toEqual({});
  });

  it('setting an empty token removes the host entry', () => {
    useTokenStore.getState().setGitlabToken('gitlab.com', 'glpat-com');
    useTokenStore.getState().setGitlabToken('gitlab.com', '');
    expect(useTokenStore.getState().tokenFor(gitlabComRepo)).toBeNull();
  });
});
