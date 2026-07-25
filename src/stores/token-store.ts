import { create } from 'zustand';
import type { Provider } from '@/lib/types';

export const DEFAULT_GITLAB_HOST = 'gitlab.com';

interface TokenState {
  githubToken: string;
  /** host (e.g. 'gitlab.com', 'gitlab.acme.com') -> token */
  gitlabTokens: Record<string, string>;
  setGithubToken: (token: string) => void;
  setGitlabToken: (host: string, token: string) => void;
  /** Resolve the applicable token; null when missing — never a silent fallback. */
  tokenFor: (target: { provider: Provider; host: string }) => string | null;
  clearAll: () => void;
}

export const useTokenStore = create<TokenState>()((set, get) => ({
  githubToken: '',
  gitlabTokens: {},

  setGithubToken: (token) => set({ githubToken: token }),

  setGitlabToken: (host, token) =>
    set((state) => {
      const gitlabTokens = { ...state.gitlabTokens };
      if (token === '') {
        delete gitlabTokens[host];
      } else {
        gitlabTokens[host] = token;
      }
      return { gitlabTokens };
    }),

  tokenFor: ({ provider, host }) => {
    const state = get();
    if (provider === 'github') {
      return state.githubToken || null;
    }
    return state.gitlabTokens[host] ?? null;
  },

  clearAll: () => set({ githubToken: '', gitlabTokens: {} }),
}));

/** True when at least one credential (GitHub or any GitLab host) is configured. */
export function useHasCredentials(): boolean {
  const githubToken = useTokenStore((s) => s.githubToken);
  const gitlabTokens = useTokenStore((s) => s.gitlabTokens);
  return githubToken !== '' || Object.keys(gitlabTokens).length > 0;
}
