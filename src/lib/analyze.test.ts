import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { runAnalysis } from './analyze';
import { useTokenStore } from '@/stores/token-store';
import type { PackageJsonFile, RepoConfig } from './types';

vi.mock('./package-files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./package-files')>()),
  fetchPackageJsonFiles: vi.fn(),
}));

import { fetchPackageJsonFiles } from './package-files';
const fetchMock = vi.mocked(fetchPackageJsonFiles);

function repo(id: string, overrides: Partial<RepoConfig> = {}): RepoConfig {
  return {
    id,
    provider: 'github',
    host: 'github.com',
    path: `acme/${id}`,
    displayName: `acme/${id}`,
    defaultBranch: 'main',
    ...overrides,
  };
}

function files(deps: Record<string, string>): { files: PackageJsonFile[]; failedCount: number } {
  return {
    files: [
      {
        path: 'package.json',
        packageName: 'root',
        deps: { dependencies: deps, devDependencies: {}, peerDependencies: {} },
      },
    ],
    failedCount: 0,
  };
}

function freshQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  useTokenStore.getState().clearAll();
  fetchMock.mockReset();
  useTokenStore.getState().setGithubToken('tok');
});

describe('runAnalysis', () => {
  it('aggregates deps across repos using each repo\'s selected branch', async () => {
    fetchMock.mockResolvedValueOnce(files({ axios: '^1.6.0' }));
    fetchMock.mockResolvedValueOnce(files({ axios: '^0.27.0' }));
    const repos = [repo('a'), repo('b', { selectedBranch: 'develop' })];
    const { groups, failed } = await runAnalysis(repos, freshQueryClient());
    expect(failed).toEqual([]);
    expect(groups[0].depName).toBe('axios');
    expect(groups[0].versions).toHaveLength(2);
    // Second repo fetched with its selected branch:
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'b' }), 'develop');
  });

  it('reports repos without token as failures and continues (RN-08.7)', async () => {
    useTokenStore.getState().clearAll();
    useTokenStore.getState().setGitlabToken('gitlab.com', 'glpat');
    fetchMock.mockResolvedValueOnce(files({ x: '^1.0.0' }));
    const repos = [
      repo('gh'), // github — no token now
      repo('gl', { provider: 'gitlab', host: 'gitlab.com', path: 'g/p' }),
    ];
    const { groups, failed } = await runAnalysis(repos, freshQueryClient());
    expect(failed).toHaveLength(1);
    expect(failed[0].repoName).toBe('acme/gh');
    expect(failed[0].error).toMatch(/token/i);
    expect(groups.some((g) => g.depName === 'x')).toBe(true);
  });

  it('collects per-repo fetch errors in the banner without aborting (RN-08.6)', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 404 }));
    fetchMock.mockResolvedValueOnce(files({ react: '^18.2.0' }));
    const { groups, failed } = await runAnalysis([repo('a'), repo('b')], freshQueryClient());
    expect(failed).toEqual([{ repoName: 'acme/a', error: expect.stringMatching(/not found/i) }]);
    expect(groups[0].depName).toBe('react');
  });

  it('reports repos with no branch as failures without fetching', async () => {
    fetchMock.mockResolvedValueOnce(files({ x: '^1.0.0' }));
    const repos = [repo('nob', { defaultBranch: undefined }), repo('ok')];
    const { groups, failed } = await runAnalysis(repos, freshQueryClient());
    expect(failed).toEqual([{ repoName: 'acme/nob', error: expect.stringMatching(/branch/i) }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'ok' }), 'main');
    expect(groups.some((g) => g.depName === 'x')).toBe(true);
  });

  it('reuses warm cache: second run does not refetch', async () => {
    const queryClient = freshQueryClient();
    fetchMock.mockResolvedValue(files({ x: '^1.0.0' }));
    await runAnalysis([repo('a')], queryClient);
    await runAnalysis([repo('a')], queryClient);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
