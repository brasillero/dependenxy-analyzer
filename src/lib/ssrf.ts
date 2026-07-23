const PRIVATE_IPV4_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // RFC1918
  /^192\.168\./, // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918 172.16.0.0/12
  /^169\.254\./, // link-local / cloud metadata
  /^0\./, // "this" network
];

export type HostValidation = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Validate the client-supplied GitLab host before the proxy dispatches to it.
 * Without this guard the GitLab proxy route would be an open proxy (SSRF).
 * Hostname-based checks only — DNS resolution is intentionally out of scope (spec §6.4).
 */
export function validateGitLabHost(raw: string): HostValidation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'malformed URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `scheme '${url.protocol}' is not allowed` };
  }

  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'credentials in URL are not allowed' };
  }

  const hostname = url.hostname.toLowerCase();

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { ok: false, reason: 'localhost is not allowed' };
  }

  if (hostname === '[::1]' || hostname === '::1') {
    return { ok: false, reason: 'loopback address is not allowed' };
  }

  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return { ok: false, reason: 'private/reserved IP ranges are not allowed' };
  }

  return { ok: true, url };
}
