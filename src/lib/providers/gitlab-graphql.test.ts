import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchBranchNamesGraphql,
  fetchDefaultBranchGraphql,
  fetchPackageJsonsBatched,
} from './gitlab-graphql';
import type { RepoConfig } from '@/lib/types';

vi.mock('@/lib/proxy-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/proxy-client')>()),
  postGraphql: vi.fn(),
}));

import { postGraphql } from '@/lib/proxy-client';
const graphqlMock = vi.mocked(postGraphql);

const repo: RepoConfig = {
  id: 'r2',
  provider: 'gitlab',
  host: 'gitlab.acme.com',
  path: 'group/sub/project',
  displayName: 'group/sub/project',
  defaultBranch: 'main',
};

beforeEach(() => {
  graphqlMock.mockReset();
});

describe('fetchDefaultBranchGraphql', () => {
  it('returns repository.rootRef', async () => {
    graphqlMock.mockResolvedValueOnce({
      data: { project: { repository: { rootRef: 'develop' } } },
    });
    await expect(fetchDefaultBranchGraphql(repo)).resolves.toBe('develop');
  });

  it('throws when rootRef is missing (fallback trigger)', async () => {
    graphqlMock.mockResolvedValueOnce({ data: { project: { repository: null } } });
    await expect(fetchDefaultBranchGraphql(repo)).rejects.toThrow(/rootRef/i);
  });

  it('throws on GraphQL errors', async () => {
    graphqlMock.mockResolvedValueOnce({ errors: [{ message: 'no field' }] });
    await expect(fetchDefaultBranchGraphql(repo)).rejects.toThrow(/no field/i);
  });
});

describe('fetchBranchNamesGraphql', () => {
  it('collects a single page of branch names', async () => {
    graphqlMock.mockResolvedValueOnce({
      data: { project: { repository: { branchNames: ['develop', 'main'] } } },
    });
    await expect(fetchBranchNamesGraphql(repo)).resolves.toEqual(['develop', 'main']);
    expect(graphqlMock).toHaveBeenCalledTimes(1);
  });

  it('pages with offset until a short page arrives', async () => {
    const full = Array.from({ length: 100 }, (_, i) => `b${i}`);
    graphqlMock
      .mockResolvedValueOnce({ data: { project: { repository: { branchNames: full } } } })
      .mockResolvedValueOnce({ data: { project: { repository: { branchNames: ['last'] } } } });
    const names = await fetchBranchNamesGraphql(repo);
    expect(names).toHaveLength(101);
    const offsets = graphqlMock.mock.calls.map(
      (call) => (call[1].variables as { offset: number }).offset,
    );
    expect(offsets).toEqual([0, 100]);
  });

  it('throws on GraphQL errors (fallback trigger)', async () => {
    graphqlMock.mockResolvedValueOnce({ errors: [{ message: 'unsupported' }] });
    await expect(fetchBranchNamesGraphql(repo)).rejects.toThrow(/unsupported/i);
  });
});

describe('fetchPackageJsonsBatched', () => {
  const pkgJson = (name: string) => JSON.stringify({ name, dependencies: { react: '^18.0.0' } });

  it('fetches all paths in a single GraphQL request when under the chunk size', async () => {
    graphqlMock.mockResolvedValueOnce({
      data: {
        project: {
          repository: {
            blobs: {
              nodes: [
                { path: 'package.json', rawTextBlob: pkgJson('root') },
                { path: 'packages/a/package.json', rawTextBlob: pkgJson('a') },
              ],
            },
          },
        },
      },
    });
    const result = await fetchPackageJsonsBatched(repo, 'develop', [
      'package.json',
      'packages/a/package.json',
    ]);
    expect(graphqlMock).toHaveBeenCalledTimes(1);
    const variables = graphqlMock.mock.calls[0][1].variables as { fullPath: string; ref: string; paths: string[] };
    expect(variables.fullPath).toBe('group/sub/project');
    expect(variables.ref).toBe('develop');
    expect(result.failedCount).toBe(0);
    expect(result.files.map((f) => f.packageName)).toEqual(['root', 'a']);
  });

  it('chunks paths into groups of 50', async () => {
    const paths = Array.from({ length: 120 }, (_, i) => `packages/p${i}/package.json`);
    graphqlMock.mockImplementation(async (_repo, payload) => {
      const { paths: chunk } = payload.variables as { paths: string[] };
      return {
        data: {
          project: {
            repository: {
              blobs: {
                nodes: chunk.map((path) => ({ path, rawTextBlob: pkgJson(path) })),
              },
            },
          },
        },
      };
    });
    const result = await fetchPackageJsonsBatched(repo, 'main', paths);
    expect(graphqlMock).toHaveBeenCalledTimes(3); // 50 + 50 + 20
    expect(result.files).toHaveLength(120);
    expect(result.failedCount).toBe(0);
  });

  it('counts missing blobs and unparsable files as failures, keeps the rest', async () => {
    graphqlMock.mockResolvedValueOnce({
      data: {
        project: {
          repository: {
            blobs: {
              nodes: [
                { path: 'package.json', rawTextBlob: pkgJson('root') },
                { path: 'bad/package.json', rawTextBlob: 'not json{{' },
              ],
            },
          },
        },
      },
    });
    const result = await fetchPackageJsonsBatched(repo, 'main', [
      'package.json',
      'gone/package.json', // absent from nodes
      'bad/package.json', // invalid JSON
    ]);
    expect(result.files).toHaveLength(1);
    expect(result.failedCount).toBe(2);
  });

  it('throws on GraphQL errors so the caller can fall back to REST', async () => {
    graphqlMock.mockResolvedValueOnce({ errors: [{ message: 'Field blobs doesn\'t exist' }] });
    await expect(fetchPackageJsonsBatched(repo, 'main', ['package.json'])).rejects.toThrow(
      /blobs/i,
    );
  });
});
