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

describe('gitlab proxy route', () => {
  it('defaults to https://gitlab.com and uses PRIVATE-TOKEN', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));
    await GET(req('/api/proxy/gitlab/projects/x', { 'x-access-token': 'glpat' }), params(['projects', 'x']));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gitlab.com/api/v4/projects/x');
    expect(init.headers['PRIVATE-TOKEN']).toBe('glpat');
    expect(init.redirect).toBe('manual');
  });

  it('targets the self-hosted host from x-gitlab-host', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));
    await GET(
      req('/api/proxy/gitlab/x?per_page=100', {
        'x-access-token': 'glpat',
        'x-gitlab-host': 'https://gitlab.acme.com',
      }),
      params(['x']),
    );
    expect(fetchMock.mock.calls[0][0]).toBe('https://gitlab.acme.com/api/v4/x?per_page=100');
  });

  it('preserves %2F-encoded segments (project id) in the upstream URL', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await GET(
      req('/api/proxy/gitlab/projects/group%2Fsub%2Fproject', { 'x-access-token': 't' }),
      // Next.js catch-all params arrive DECODED — the route must not rely on them:
      params(['projects', 'group/sub/project']),
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://gitlab.com/api/v4/projects/group%2Fsub%2Fproject',
    );
  });

  it('rejects SSRF targets before dispatching (no upstream call)', async () => {
    const res = await GET(
      req('/api/proxy/gitlab/x', { 'x-gitlab-host': 'http://169.254.169.254' }),
      params(['x']),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-http schemes', async () => {
    const res = await GET(
      req('/api/proxy/gitlab/x', { 'x-gitlab-host': 'file:///etc/passwd' }),
      params(['x']),
    );
    expect(res.status).toBe(400);
  });

  it('forwards x-next-page for pagination and marks no-store', async () => {
    fetchMock.mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'x-next-page': '2' } }),
    );
    const res = await GET(req('/api/proxy/gitlab/p', { 'x-access-token': 't' }), params(['p']));
    expect(res.headers.get('x-next-page')).toBe('2');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('passes upstream errors through untouched', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"401 Unauthorized"}', { status: 401 }));
    const res = await GET(req('/api/proxy/gitlab/p', { 'x-access-token': 'bad' }), params(['p']));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('{"message":"401 Unauthorized"}');
  });

  it('returns 502 json when the upstream fetch itself fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const res = await GET(req('/api/proxy/gitlab/p', { 'x-access-token': 't' }), params(['p']));
    expect(res.status).toBe(502);
    expect((await res.json()).message).toBeTruthy();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
