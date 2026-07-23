import { describe, it, expect, beforeEach } from 'vitest';
import { useRepoStore } from './repo-store';
import type { RepoConfig } from '@/lib/types';

function repo(id: string, path = `acme/${id}`): RepoConfig {
  return {
    id,
    provider: 'github',
    host: 'github.com',
    path,
    displayName: path,
    defaultBranch: 'main',
  };
}

beforeEach(() => {
  localStorage.clear();
  useRepoStore.setState({ repos: [], selectedRepoId: null });
});

describe('repo-store', () => {
  it('adds repos and persists to localStorage under rda-repos', () => {
    useRepoStore.getState().addRepo(repo('a'));
    expect(useRepoStore.getState().repos).toHaveLength(1);
    const persisted = JSON.parse(localStorage.getItem('rda-repos') ?? '{}');
    expect(persisted.state.repos).toHaveLength(1);
  });

  it('dedupes by provider+host+path and returns the existing id', () => {
    useRepoStore.getState().addRepo(repo('a'));
    const second = { ...repo('b'), path: 'acme/a' }; // same identity, different id
    const result = useRepoStore.getState().addRepo(second);
    expect(useRepoStore.getState().repos).toHaveLength(1);
    expect(result).toBe('a');
  });

  it('removing the selected repo clears the selection (RN RF-03.5)', () => {
    useRepoStore.getState().addRepo(repo('a'));
    useRepoStore.getState().selectRepo('a');
    useRepoStore.getState().removeRepo('a');
    expect(useRepoStore.getState().repos).toHaveLength(0);
    expect(useRepoStore.getState().selectedRepoId).toBeNull();
  });

  it('removing a non-selected repo keeps the selection', () => {
    useRepoStore.getState().addRepo(repo('a'));
    useRepoStore.getState().addRepo(repo('b'));
    useRepoStore.getState().selectRepo('a');
    useRepoStore.getState().removeRepo('b');
    expect(useRepoStore.getState().selectedRepoId).toBe('a');
  });

  it('setBranch persists the branch per repo', () => {
    useRepoStore.getState().addRepo(repo('a'));
    useRepoStore.getState().addRepo(repo('b'));
    useRepoStore.getState().setBranch('a', 'develop');
    expect(useRepoStore.getState().repos.find((r) => r.id === 'a')?.selectedBranch).toBe('develop');
    expect(useRepoStore.getState().repos.find((r) => r.id === 'b')?.selectedBranch).toBeUndefined();
  });

  it('selection survives a store rehydrate (persisted selectedRepoId)', () => {
    useRepoStore.getState().addRepo(repo('a'));
    useRepoStore.getState().selectRepo('a');
    const persisted = JSON.parse(localStorage.getItem('rda-repos') ?? '{}');
    expect(persisted.state.selectedRepoId).toBe('a');
  });
});
