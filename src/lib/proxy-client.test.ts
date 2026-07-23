import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createProxyClient } from './proxy-client';
import { describeError } from './errors';
import { useTokenStore } from '@/stores/token-store';
import type { RepoConfig } from '@/lib/types';

const repo: RepoConfig = {
  id: 'r1',
  provider: 'github',
  host: 'github.com',
  path: 'owner/repo',
  displayName: 'owner/repo',
};

// ky v2 builds Request objects from relative URLs; Node/undici rejects those,
// so give Request a base URL for resolution (jsdom's location origin).
class PatchedRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(new URL(input instanceof Request ? input.url : input, 'http://localhost:3000'), init);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createProxyClient (integration through ky)', () => {
  let capturedRequest: Request | null;

  beforeEach(() => {
    capturedRequest = null;
    useTokenStore.getState().clearAll();
    vi.stubGlobal('Request', PatchedRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useTokenStore.getState().clearAll();
  });

  function stubFetch(response: Response | (() => Response)) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedRequest = input instanceof Request ? input : new Request(input, init);
        return typeof response === 'function' ? response() : response;
      }),
    );
  }

  it('maps a GitHub 403 rate-limit body to rate-limit guidance', async () => {
    stubFetch(() =>
      jsonResponse({ message: 'API rate limit exceeded for user ID 1.' }, 403),
    );

    const client = createProxyClient(repo);
    const error = await client.getJson('repos/owner/repo').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(403);
    expect(describeError(error)).toMatch(/rate limit/i);
  });

  it('attaches no x-access-token header when the store is empty (fail-closed)', async () => {
    stubFetch(jsonResponse({ ok: true }));

    const client = createProxyClient(repo);
    await client.getJson('repos/owner/repo');

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.headers.get('x-access-token')).toBeNull();
  });

  it('attaches x-access-token when a GitHub token is set', async () => {
    useTokenStore.getState().setGithubToken('ghp_secret');
    stubFetch(jsonResponse({ ok: true }));

    const client = createProxyClient(repo);
    await client.getJson('repos/owner/repo');

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.headers.get('x-access-token')).toBe('ghp_secret');
  });
});
