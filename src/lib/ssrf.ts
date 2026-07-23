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

  // Strip trailing dots: 'localhost.' resolves to loopback via DNS but would
  // otherwise pass the hostname checks below. Bracketed IPv6 contains no dots.
  const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { ok: false, reason: 'localhost is not allowed' };
  }

  if (hostname === '[::1]' || hostname === '::1') {
    return { ok: false, reason: 'loopback address is not allowed' };
  }

  // IPv4-mapped IPv6 ([::ffff:127.0.0.1], or hex-quad form [::ffff:7f00:1]
  // after URL normalization) is an in-scope IPv4 rejection wearing IPv6
  // syntax. A legit GitLab host would never be addressed this way — reject outright.
  if (hostname.startsWith('[::ffff:')) {
    return { ok: false, reason: 'IPv4-mapped IPv6 addresses are not allowed' };
  }

  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return { ok: false, reason: 'private/reserved IP ranges are not allowed' };
  }

  return { ok: true, url };
}
