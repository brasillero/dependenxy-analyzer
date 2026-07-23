/** Errors shaped by our proxy client carry the upstream HTTP status. */
export interface StatusError extends Error {
  status?: number;
}

/**
 * Map any fetch/proxy error to a user-facing message, following the spec's
 * error convention: 401 = credential problem, 404 = missing repo or no
 * permission, 429/403-with-rate-limit = provider throttling.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as StatusError).status;
    if (status === 401) {
      return 'Invalid or expired credential — review your access token.';
    }
    if (status === 404) {
      return 'Repository not found, or the token has no access to it.';
    }
    if (status === 429 || (status === 403 && /rate limit/i.test(error.message))) {
      return 'Provider rate limit reached — wait a moment and try again.';
    }
    return error.message;
  }
  return 'Unexpected error.';
}
