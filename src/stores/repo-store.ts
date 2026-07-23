import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RepoConfig } from '@/lib/types';

interface RepoState {
  repos: RepoConfig[];
  selectedRepoId: string | null;
  /** Add a repo; dedupes on provider+host+path. Returns the effective repo id. */
  addRepo: (repo: RepoConfig) => string;
  removeRepo: (id: string) => void;
  setBranch: (id: string, branch: string) => void;
  selectRepo: (id: string | null) => void;
}

function sameIdentity(a: RepoConfig, b: RepoConfig): boolean {
  return a.provider === b.provider && a.host === b.host && a.path === b.path;
}

export const useRepoStore = create<RepoState>()(
  persist(
    (set, get) => ({
      repos: [],
      selectedRepoId: null,

      addRepo: (repo) => {
        const existing = get().repos.find((r) => sameIdentity(r, repo));
        if (existing) return existing.id;
        set((state) => ({ repos: [...state.repos, repo] }));
        return repo.id;
      },

      removeRepo: (id) =>
        set((state) => ({
          repos: state.repos.filter((r) => r.id !== id),
          selectedRepoId: state.selectedRepoId === id ? null : state.selectedRepoId,
        })),

      setBranch: (id, branch) =>
        set((state) => ({
          repos: state.repos.map((r) => (r.id === id ? { ...r, selectedBranch: branch } : r)),
        })),

      selectRepo: (id) => set({ selectedRepoId: id }),
    }),
    {
      name: 'rda-repos',
      partialize: (state) => ({ repos: state.repos, selectedRepoId: state.selectedRepoId }),
    },
  ),
);
