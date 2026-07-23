import { describe, it, expect, vi } from 'vitest';
import { githubProvider } from './github';
import type { PagedGet, ProxyClient } from './provider';
import type { RepoConfig } from '@/lib/types';

const repo: RepoConfig = {
  id: 'r1',
  provider: 'github',
  host: 'github.com',
  path: 'acme/web',
  displayName: 'acme/web',
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
    getText: vi.fn(async () => ''),
  };
}

describe('parseUrl', () => {
  it('parses plain repo URLs', () => {
    expect(githubProvider.parseUrl('https://github.com/acme/web')).toEqual({
      provider: 'github',
      host: 'github.com',
      path: 'acme/web',
    });
  });

  it('strips .git suffix and /tree/<branch> prefixes', () => {
    expect(githubProvider.parseUrl('https://github.com/acme/web.git').path).toBe('acme/web');
    expect(githubProvider.parseUrl('https://github.com/acme/web/tree/main').path).toBe('acme/web');
  });

  it('strips .git even with a trailing slash', () => {
    expect(githubProvider.parseUrl('https://github.com/acme/web.git/').path).toBe('acme/web');
  });

  it('rejects non-GitHub and malformed URLs', () => {
    expect(() => githubProvider.parseUrl('https://gitlab.com/acme/web')).toThrow();
    expect(() => githubProvider.parseUrl('https://github.com/acme')).toThrow();
    expect(() => githubProvider.parseUrl('not a url')).toThrow();
  });
});

describe('getDefaultBranch', () => {
  it('reads default_branch from the repo payload', async () => {
    const client = clientWith({ 'repos/acme/web': { default_branch: 'main' } });
    await expect(githubProvider.getDefaultBranch(client, repo)).resolves.toBe('main');
  });
});

describe('listPackageJsonPaths', () => {
  it('filters blobs ending in package.json and applies exclusion segments', async () => {
    const client = clientWith({
      'repos/acme/web/git/trees/main': {
        truncated: false,
        tree: [
          { type: 'blob', path: 'package.json' },
          { type: 'blob', path: 'packages/app/package.json' },
          { type: 'blob', path: 'node_modules/x/package.json' },
          { type: 'blob', path: 'packages/lib/dist/package.json' },
          { type: 'tree', path: 'packages' },
          { type: 'blob', path: 'README.md' },
        ],
      },
    });
    const paths = await githubProvider.listPackageJsonPaths(client, repo, 'main');
    expect(paths).toEqual(['package.json', 'packages/app/package.json']);
  });

  it('tolerates truncated trees (uses what came)', async () => {
    const client = clientWith({
      'repos/acme/web/git/trees/main': {
        truncated: true,
        tree: [{ type: 'blob', path: 'package.json' }],
      },
    });
    await expect(githubProvider.listPackageJsonPaths(client, repo, 'main')).resolves.toEqual([
      'package.json',
    ]);
  });
});

describe('fetchPackageJson', () => {
  it('decodes base64 content unicode-safe and parses deps', async () => {
    const content = Buffer.from(
      JSON.stringify({ name: 'web', dependencies: { react: '^18.2.0' } }),
      'utf-8',
    ).toString('base64');
    const client = clientWith({
      'repos/acme/web/contents/package.json': { content: `${content}\n`, encoding: 'base64' },
    });
    const file = await githubProvider.fetchPackageJson(client, repo, 'main', 'package.json');
    expect(file.packageName).toBe('web');
    expect(file.deps.dependencies).toEqual({ react: '^18.2.0' });
  });
});

describe('listBranches', () => {
  it('follows Link headers until exhausted and caps at 500', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ name: `b${i}` }));
    const page2 = Array.from({ length: 3 }, (_, i) => ({ name: `c${i}` }));
    const pagedGet = vi
      .fn()
      .mockResolvedValueOnce({
        data: page1,
        headers: new Headers({
          link: '<https://api.github.com/repos/acme/web/branches?per_page=100&page=2>; rel="next"',
        }),
      })
      .mockResolvedValueOnce({ data: page2, headers: new Headers() });
    const names = await githubProvider.listBranches(pagedGet, repo);
    expect(names).toHaveLength(103);
    expect(names[0]).toBe('b0');
    expect(names.at(-1)).toBe('c2');
    expect(pagedGet).toHaveBeenCalledTimes(2);
  });

  it('stops at the 500-branch / 5-page ceiling when next links never exhaust', async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ name: `b${i}` }));
    // Self-referential next link: pagination never terminates on its own.
    const headers = new Headers({
      link: '<https://api.github.com/repos/acme/web/branches?per_page=100&page=2>; rel="next"',
    });
    const pagedGet = vi.fn(async () => ({ data: page, headers })) as PagedGet;
    const names = await githubProvider.listBranches(pagedGet, repo);
    expect(names).toHaveLength(500);
    expect(pagedGet).toHaveBeenCalledTimes(5);
  });
});
