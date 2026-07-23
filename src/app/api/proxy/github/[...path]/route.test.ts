import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function req(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), { headers });
}

const params = (path: string[]) => ({ params: Promise.resolve({ path }) });

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('github proxy route', () => {
  it('forwards path and query string to api.github.com', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await GET(req('/api/proxy/github/repos/acme/web/branches?per_page=100', { 'x-access-token': 'tok' }), params(['repos', 'acme', 'web', 'branches']));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/web/branches?per_page=100');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers.Accept).toBe('application/vnd.github+json');
    expect(init.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('omits Authorization when no token header is present', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await GET(req('/api/proxy/github/repos/a/b'), params(['repos', 'a', 'b']));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('passes upstream status and body through untouched, marked no-store', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"message":"Not Found"}', { status: 404, headers: { 'content-type': 'application/json' } }),
    );
    const res = await GET(req('/api/proxy/github/repos/a/b', { 'x-access-token': 't' }), params(['repos', 'a', 'b']));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('{"message":"Not Found"}');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('forwards the upstream link header for pagination', async () => {
    fetchMock.mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: { link: '<https://api.github.com/x?page=2>; rel="next"' },
      }),
    );
    const res = await GET(req('/api/proxy/github/repos/a/b/branches'), params(['repos', 'a', 'b', 'branches']));
    expect(res.headers.get('link')).toContain('rel="next"');
  });

  it('forwards rate-limit headers (x-ratelimit-remaining, retry-after) when present', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"message":"API rate limit exceeded"}', {
        status: 429,
        headers: { 'x-ratelimit-remaining': '0', 'retry-after': '60' },
      }),
    );
    const res = await GET(req('/api/proxy/github/repos/a/b'), params(['repos', 'a', 'b']));
    expect(res.status).toBe(429);
    expect(res.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('returns 502 json when the upstream fetch throws', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const res = await GET(req('/api/proxy/github/repos/a/b'), params(['repos', 'a', 'b']));
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.message).toBeTruthy();
  });
});
