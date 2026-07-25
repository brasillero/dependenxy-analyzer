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

  it('dedupes by provider+host+path+branch and returns the existing id', () => {
    useRepoStore.getState().addRepo(repo('a'));
    const second = { ...repo('b'), path: 'acme/a' }; // same repo+branch, different id
    const result = useRepoStore.getState().addRepo(second);
    expect(useRepoStore.getState().repos).toHaveLength(1);
    expect(result).toBe('a');
  });

  it('allows the same repository on different branches', () => {
    useRepoStore.getState().addRepo(repo('a'));
    const result = useRepoStore
      .getState()
      .addRepo({ ...repo('b'), path: 'acme/a', selectedBranch: 'develop' });
    expect(useRepoStore.getState().repos).toHaveLength(2);
    expect(result).toBe('b');
  });

  it('rejects the same repository on the same branch twice', () => {
    useRepoStore.getState().addRepo(repo('a'));
    const result = useRepoStore
      .getState()
      .addRepo({ ...repo('b'), path: 'acme/a', selectedBranch: 'main' });
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

  it('rehydrates repos and selection from a seeded persist envelope', async () => {
    const seeded = repo('seeded');
    // Reset first: setState persists, so seeding must come after or it gets overwritten.
    useRepoStore.setState({ repos: [], selectedRepoId: null });
    localStorage.setItem(
      'rda-repos',
      JSON.stringify({ state: { repos: [seeded], selectedRepoId: 'seeded' }, version: 0 }),
    );

    await useRepoStore.persist.rehydrate();

    expect(useRepoStore.getState().repos).toEqual([seeded]);
    expect(useRepoStore.getState().selectedRepoId).toBe('seeded');
  });

  it('dedupes GitHub paths case-insensitively', () => {
    useRepoStore.getState().addRepo(repo('a', 'acme/web'));
    const result = useRepoStore.getState().addRepo(repo('b', 'Acme/Web'));
    expect(useRepoStore.getState().repos).toHaveLength(1);
    expect(result).toBe('a');
  });
});
