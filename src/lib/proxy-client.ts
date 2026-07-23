import ky, { HTTPError } from 'ky';
import type { RepoConfig } from '@/lib/types';
import type { ProxyClient } from '@/lib/providers/provider';
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
        // The route segment after /api/proxy determines the provider.
        const provider = request.url.includes('/api/proxy/github/') ? 'github' : 'gitlab';
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
      const statusError = new Error(`Request failed with status ${error.response.status}`) as StatusError;
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

export interface PagedResponse<T> {
  data: T;
  headers: Headers;
}

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
