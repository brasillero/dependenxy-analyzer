import { NextRequest, NextResponse } from 'next/server';

const UPSTREAM_BASE = 'https://api.github.com';

/** Response headers worth forwarding to the browser (pagination + rate limits). */
const FORWARD_HEADERS = ['content-type', 'link', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const search = new URL(req.url).search;
  const upstreamUrl = `${UPSTREAM_BASE}/${path.join('/')}${search}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = req.headers.get('x-access-token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // redirect: 'follow' is deliberate here — the host is fixed and undici strips
  // Authorization on cross-origin redirects. The GitLab route uses 'manual'
  // instead because its host is client-controlled.
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers,
      cache: 'no-store',
      redirect: 'follow',
      // A hung or dribbling upstream must not hold the route open forever.
      // The timeout aborts the fetch, which throws and lands in the 502 below.
      signal: AbortSignal.timeout(30_000),
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
