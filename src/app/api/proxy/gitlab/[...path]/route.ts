import { NextRequest, NextResponse } from 'next/server';
import { validateGitLabHost } from '@/lib/ssrf';

const DEFAULT_HOST = 'https://gitlab.com';
const ROUTE_PREFIX = '/api/proxy/gitlab/';

/** Response headers worth forwarding to the browser (GitLab pagination). */
const FORWARD_HEADERS = [
  'content-type',
  'x-next-page',
  'x-page',
  'x-per-page',
  'x-total',
  'x-total-pages',
  'retry-after',
];

export async function GET(
  req: NextRequest,
  _ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  // The target host is client-controlled — validate before dispatching or
  // this route is an open proxy into the internal network (SSRF).
  const rawHost = req.headers.get('x-gitlab-host') ?? DEFAULT_HOST;
  const validation = validateGitLabHost(rawHost);
  if (!validation.ok) {
    return NextResponse.json(
      { error: `Rejected GitLab host: ${validation.reason}` },
      { status: 400 },
    );
  }

  // Use the RAW percent-encoded path from the request URL — Next.js catch-all
  // params are decoded, which would turn project ids like 'group%2Fsub%2Fproj'
  // into separate segments and break every GitLab lookup.
  const requestUrl = new URL(req.url);
  const rawPath = requestUrl.pathname.startsWith(ROUTE_PREFIX)
    ? requestUrl.pathname.slice(ROUTE_PREFIX.length)
    : requestUrl.pathname;
  const upstreamUrl = `${validation.url.origin}/api/v4/${rawPath}${requestUrl.search}`;

  const headers: Record<string, string> = {};
  const token = req.headers.get('x-access-token');
  if (token) {
    headers['PRIVATE-TOKEN'] = token;
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers,
      cache: 'no-store',
      // Host is client-controlled: never follow redirects, or a validated host
      // could 302 into the internal network and bypass the SSRF guard.
      redirect: 'manual',
    });
  } catch {
    return NextResponse.json(
      { message: 'Upstream request failed — host unreachable or network error.' },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  // Client-side TanStack Query owns caching; a second server cache would
  // create incoherent invalidation (spec §3.2).
  responseHeaders.set('cache-control', 'no-store');

  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}
