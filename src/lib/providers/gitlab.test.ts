import { describe, it, expect, vi } from 'vitest';
import { gitlabProvider } from './gitlab';
import type { PagedGet, ProxyClient } from './provider';
import type { RepoConfig } from '@/lib/types';

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
  it('filters blobs named package.json with exclusion segments', async () => {
    const client = clientWith({
      'projects/group%2Fsub%2Fproject/repository/tree': [
        { type: 'blob', path: 'package.json' },
        { type: 'blob', path: 'packages/api/package.json' },
        { type: 'blob', path: 'packages/api/coverage/package.json' },
        { type: 'tree', path: 'packages' },
      ],
    });
    const paths = await gitlabProvider.listPackageJsonPaths(client, repo, 'main');
    expect(paths).toEqual(['package.json', 'packages/api/package.json']);
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
