import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  gitlabProvider,
  listPackageJsonPathsPaginated,
  listPackageJsonPathsViaSearch,
} from './gitlab';
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

beforeEach(() => {
  graphqlMock.mockReset();
});

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
  it('prefers GraphQL rootRef when available', async () => {
    graphqlMock.mockResolvedValueOnce({ data: { project: { repository: { rootRef: 'develop' } } } });
    const client = clientWith({});
    await expect(gitlabProvider.getDefaultBranch(client, repo)).resolves.toBe('develop');
  });

  it('falls back to the REST project payload when GraphQL fails', async () => {
    graphqlMock.mockRejectedValueOnce(new Error('no graphql'));
    const client = clientWith({ 'projects/group%2Fsub%2Fproject': { default_branch: 'develop' } });
    await expect(gitlabProvider.getDefaultBranch(client, repo)).resolves.toBe('develop');
  });
});

describe('listBranches', () => {
  it('prefers GraphQL branchNames when available', async () => {
    graphqlMock.mockResolvedValueOnce({
      data: { project: { repository: { branchNames: ['develop', 'main'] } } },
    });
    const pagedGet = vi.fn() as unknown as PagedGet;
    const names = await gitlabProvider.listBranches(pagedGet, repo);
    expect(names).toEqual(['develop', 'main']);
    expect(pagedGet).not.toHaveBeenCalled();
  });

  it('falls back to REST pagination when GraphQL fails', async () => {
    graphqlMock.mockRejectedValueOnce(new Error('no graphql'));
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
    graphqlMock.mockRejectedValueOnce(new Error('no graphql'));
    const page = Array.from({ length: 100 }, (_, i) => ({ name: `b${i}` }));
    // Self-perpetuating next page: pagination never terminates on its own.
    const headers = new Headers({ 'x-next-page': '2' });
    const pagedGet = vi.fn(async () => ({ data: page, headers })) as PagedGet;
    const names = await gitlabProvider.listBranches(pagedGet, repo);
    expect(names).toHaveLength(500);
    expect(pagedGet).toHaveBeenCalledTimes(5);
  });
});

describe('listPackageJsonPaths', () => {
  it('throws — a single page would silently truncate; use the facade', async () => {
    const client = clientWith({});
    await expect(gitlabProvider.listPackageJsonPaths(client, repo, 'main')).rejects.toThrow(
      'Use the listPackageJsonPaths facade in providers/index.ts for GitLab repos.',
    );
  });
});

describe('listPackageJsonPathsViaSearch', () => {
  it('hits the project search endpoint with the blobs scope and ref, deduped', async () => {
    const pagedGet = vi.fn(async (path: string, searchParams?: Record<string, string>) => {
      expect(path).toBe('projects/group%2Fsub%2Fproject/search');
      expect(searchParams).toMatchObject({
        scope: 'blobs',
        search: 'filename:package.json',
        ref: 'develop',
        per_page: '100',
      });
      return {
        data: [
          { path: 'package.json' },
          { path: 'packages/ui/package.json' },
          { path: 'packages/ui/package.json' }, // duplicate match — deduped
          { path: 'packages/ui/package-lock.json' }, // not a package.json
          { path: 'node_modules/x/package.json' }, // excluded
        ],
        headers: new Headers({ 'x-next-page': '' }),
      };
    }) as PagedGet;
    const paths = await listPackageJsonPathsViaSearch(pagedGet, repo, 'develop');
    expect(paths).toEqual(['package.json', 'packages/ui/package.json']);
    expect(pagedGet).toHaveBeenCalledTimes(1);
  });

  it('follows x-next-page for repos with many matches', async () => {
    const pagedGet = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ path: 'a/package.json' }],
        headers: new Headers({ 'x-next-page': '2' }),
      })
      .mockResolvedValueOnce({
        data: [{ path: 'b/package.json' }],
        headers: new Headers({ 'x-next-page': '' }),
      }) as PagedGet;
    const paths = await listPackageJsonPathsViaSearch(pagedGet, repo, 'main');
    expect(paths).toEqual(['a/package.json', 'b/package.json']);
    expect(pagedGet).toHaveBeenCalledTimes(2);
  });

  it('throws on request failure so the facade falls back to the tree', async () => {
    const pagedGet = vi.fn(async () => {
      throw new Error('search unavailable');
    }) as PagedGet;
    await expect(listPackageJsonPathsViaSearch(pagedGet, repo, 'main')).rejects.toThrow(
      /search unavailable/i,
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
