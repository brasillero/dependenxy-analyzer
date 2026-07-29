import ky, { HTTPError } from 'ky';
import type { RepoConfig } from '@/lib/types';
import type { ProxyClient, PagedResponse } from '@/lib/providers/provider';
import type { StatusError } from '@/lib/errors';
import { useTokenStore } from '@/stores/token-store';

/**
 * Browser-side client. NEVER talks to api.github.com or a GitLab instance
 * directly — everything goes through the same-origin Route Handlers, which
 * inject the upstream auth headers. Tokens are read from the in-memory store
 * at request time; they are never persisted or put in URLs.
 */
const kyInstance = ky.create({
  prefix: '/api/proxy',
  retry: 1,
  timeout: 30_000,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        // The route segment after /api/proxy determines the provider. Requests
        // outside our proxy routes get no token attached at all.
        const provider = request.url.includes('/api/proxy/github/')
          ? 'github'
          : request.url.includes('/api/proxy/gitlab/')
            ? 'gitlab'
            : null;
        if (provider === null) {
          return;
        }
        // x-gitlab-host carries a full URL (the SSRF guard parses it with new URL);
        // the token store is keyed by bare host.
        let host = 'github.com';
        if (provider === 'gitlab') {
          const hostHeader = request.headers.get('x-gitlab-host') ?? 'https://gitlab.com';
          host = new URL(hostHeader).host;
        }
        const token = useTokenStore.getState().tokenFor({ provider, host });
        if (token) {
          request.headers.set('x-access-token', token);
        }
      },
    ],
  },
  throwHttpErrors: true,
});

async function toStatusError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof HTTPError) {
      // Keep the upstream body in the message: describeError detects 403 rate
      // limits (GitHub's primary rate-limit shape) via the body text. ky v2
      // consumes the response body itself, so use its pre-parsed error.data
      // (object for JSON bodies, string otherwise) — response.text() is dead.
      const body =
        typeof error.data === 'string' ? error.data : error.data ? JSON.stringify(error.data) : '';
      const statusError = new Error(
        `Request failed with status ${error.response.status}${body ? `: ${body}` : ''}`,
      ) as StatusError;
      statusError.status = error.response.status;
      throw statusError;
    }
    throw error;
  }
}

/**
 * Build a ProxyClient bound to one repository. For GitLab the target host is
 * attached as the x-gitlab-host header (a full URL — the proxy route parses
 * and validates it); for GitHub the host is fixed.
 */
export function createProxyClient(repo: RepoConfig): ProxyClient {
  const base =
    repo.provider === 'github'
      ? kyInstance.extend({ prefix: '/api/proxy/github' })
      : kyInstance.extend({
          prefix: '/api/proxy/gitlab',
          headers: { 'x-gitlab-host': `https://${repo.host}` },
        });

  return {
    async getJson<T>(path: string, searchParams?: Record<string, string>): Promise<T> {
      return toStatusError(base.get(path, { searchParams }).json<T>());
    },
    async getText(path: string, searchParams?: Record<string, string>): Promise<string> {
      return toStatusError(base.get(path, { searchParams }).text());
    },
  };
}

/** POST JSON through the app proxy and parse the JSON response. */
export async function postGraphql<T>(
  repo: RepoConfig,
  payload: { query: string; variables?: Record<string, unknown> },
): Promise<T> {
  const base = kyInstance.extend({
    prefix: '/api/proxy/gitlab',
    headers: { 'x-gitlab-host': `https://${repo.host}` },
  });
  return toStatusError(base.post('graphql', { json: payload }).json<T>());
}

export type { PagedResponse, PagedGet } from '@/lib/providers/provider';

/** GET JSON and expose upstream response headers (needed for Link / x-next-page pagination). */
export async function getJsonWithHeaders<T>(
  repo: RepoConfig,
  path: string,
  searchParams?: Record<string, string>,
): Promise<PagedResponse<T>> {
  const base =
    repo.provider === 'github'
      ? kyInstance.extend({ prefix: '/api/proxy/github' })
      : kyInstance.extend({
          prefix: '/api/proxy/gitlab',
          headers: { 'x-gitlab-host': `https://${repo.host}` },
        });
  const response = await toStatusError(base.get(path, { searchParams }));
  return { data: await response.json<T>(), headers: response.headers };
}
