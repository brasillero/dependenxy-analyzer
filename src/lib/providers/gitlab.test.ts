import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gitlabProvider, listPackageJsonPathsPaginated, fetchPackageJsonsBatched } from './gitlab';
import type { PagedGet, ProxyClient } from './provider';
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

function clientWith(handlers: Record<string, unknown>): ProxyClient {
  return {
    getJson: vi.fn(async (path: string) => {
      const hit = Object.entries(handlers).find(([key]) => path.startsWith(key));
      if (!hit) throw new Error(`unexpected path: ${path}`);
      const value = hit[1];
      if (value instanceof Error) throw value;
      return value;
    }) as ProxyClient['getJson'],
    getText: vi.fn(async (path: string) => {
      const hit = Object.entries(handlers).find(([key]) => path.startsWith(key));
      if (!hit) throw new Error(`unexpected path: ${path}`);
      const value = hit[1];
      if (value instanceof Error) throw value;
      if (typeof value !== 'string') throw new Error(`not text: ${path}`);
      return value;
    }),
  };
}

describe('parseUrl', () => {
  it('parses gitlab.com URLs with nested groups', () => {
    expect(gitlabProvider.parseUrl('https://gitlab.com/group/sub/project')).toEqual({
      provider: 'gitlab',
      host: 'gitlab.com',
      path: 'group/sub/project',
    });
  });

  it('parses self-hosted URLs and strips /-/tree/... and .git', () => {
    expect(gitlabProvider.parseUrl('https://gitlab.acme.com/group/sub/project/-/tree/main')).toEqual({
      provider: 'gitlab',
      host: 'gitlab.acme.com',
      path: 'group/sub/project',
    });
    expect(gitlabProvider.parseUrl('https://gitlab.acme.com/group/project.git').path).toBe(
      'group/project',
    );
  });

  it('strips everything from /-/ onward (blob, merge_requests, ...)', () => {
    expect(
      gitlabProvider.parseUrl('https://gitlab.com/group/proj/-/blob/main/README.md').path,
    ).toBe('group/proj');
  });

  it('strips .git even with a trailing slash', () => {
    expect(gitlabProvider.parseUrl('https://gitlab.com/group/project.git/').path).toBe(
      'group/project',
    );
  });

  it('rejects GitHub URLs and single-segment paths', () => {
    expect(() => gitlabProvider.parseUrl('https://github.com/a/b')).toThrow();
    expect(() => gitlabProvider.parseUrl('https://gitlab.com/onlygroup')).toThrow();
  });
});

describe('getDefaultBranch', () => {
  it('URL-encodes the full project path as one segment', async () => {
    const client = clientWith({ 'projects/group%2Fsub%2Fproject': { default_branch: 'develop' } });
    await expect(gitlabProvider.getDefaultBranch(client, repo)).resolves.toBe('develop');
  });
});

describe('listPackageJsonPaths', () => {
  it('throws — a single page would silently truncate; use the paginated facade', async () => {
    const client = clientWith({});
    await expect(gitlabProvider.listPackageJsonPaths(client, repo, 'main')).rejects.toThrow(
      'Use the listPackageJsonPaths facade in providers/index.ts (paginated) for GitLab repos.',
    );
  });
});

describe('listPackageJsonPathsPaginated', () => {
  it('follows x-next-page until empty and filters exclusions', async () => {
    const pagedGet = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          { type: 'blob', path: 'package.json' },
          { type: 'blob', path: 'packages/api/package.json' },
          { type: 'blob', path: 'packages/api/coverage/package.json' },
        ],
        headers: new Headers({ 'x-next-page': '2' }),
      })
      .mockResolvedValueOnce({
        data: [{ type: 'blob', path: 'packages/web/package.json' }],
        headers: new Headers({ 'x-next-page': '' }),
      });
    const paths = await listPackageJsonPathsPaginated(pagedGet, repo, 'main');
    expect(paths).toEqual([
      'package.json',
      'packages/api/package.json',
      'packages/web/package.json',
    ]);
    expect(pagedGet).toHaveBeenCalledTimes(2);
  });
});

describe('fetchPackageJson', () => {
  it('reads the raw endpoint (plain text, no base64)', async () => {
    const raw = JSON.stringify({ name: 'api', devDependencies: { vitest: '^2.0.0' } });
    // The provider must encode the file path as a single segment:
    const client: ProxyClient = {
      getJson: vi.fn(),
      getText: vi.fn(async (path: string) => {
        expect(path).toBe(
          'projects/group%2Fsub%2Fproject/repository/files/package.json/raw',
        );
        return raw;
      }),
    };
    const file = await gitlabProvider.fetchPackageJson(client, repo, 'main', 'package.json');
    expect(file.packageName).toBe('api');
    expect(file.deps.devDependencies).toEqual({ vitest: '^2.0.0' });
  });

  it('encodes a nested file path as a single segment', async () => {
    const raw = JSON.stringify({ name: 'api' });
    const client: ProxyClient = {
      getJson: vi.fn(),
      getText: vi.fn(async (path: string) => {
        expect(path).toBe(
          'projects/group%2Fsub%2Fproject/repository/files/packages%2Fapi%2Fpackage.json/raw',
        );
        return raw;
      }),
    };
    const file = await gitlabProvider.fetchPackageJson(
      client,
      repo,
      'main',
      'packages/api/package.json',
    );
    expect(file.packageName).toBe('api');
  });
});

describe('listBranches', () => {
  it('follows x-next-page until empty', async () => {
    const pagedGet = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ name: 'main' }, { name: 'dev' }],
        headers: new Headers({ 'x-next-page': '2' }),
      })
      .mockResolvedValueOnce({ data: [{ name: 'release' }], headers: new Headers({ 'x-next-page': '' }) });
    const names = await gitlabProvider.listBranches(pagedGet, repo);
    expect(names).toEqual(['main', 'dev', 'release']);
    expect(pagedGet).toHaveBeenCalledTimes(2);
  });

  it('stops at the 500-branch / 5-page ceiling when x-next-page never exhausts', async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ name: `b${i}` }));
    // Self-perpetuating next page: pagination never terminates on its own.
    const headers = new Headers({ 'x-next-page': '2' });
    const pagedGet = vi.fn(async () => ({ data: page, headers })) as PagedGet;
    const names = await gitlabProvider.listBranches(pagedGet, repo);
    expect(names).toHaveLength(500);
    expect(pagedGet).toHaveBeenCalledTimes(5);
  });
});

describe('fetchPackageJsonsBatched', () => {
  const pkgJson = (name: string) => JSON.stringify({ name, dependencies: { react: '^18.0.0' } });

  beforeEach(() => {
    graphqlMock.mockReset();
  });

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
