import { describe, it, expect } from 'vitest';
import { describeError } from './errors';

function httpError(status: number): Error {
  const err = new Error(`HTTP ${status}`);
  (err as Error & { status?: number }).status = status;
  return err;
}

describe('describeError', () => {
  it('maps 401 to credential guidance', () => {
    expect(describeError(httpError(401))).toMatch(/token|credential/i);
  });

  it('maps 404 to not-found/no-access', () => {
    expect(describeError(httpError(404))).toMatch(/not found|no access/i);
  });

  it('maps 429 to rate limit', () => {
    expect(describeError(httpError(429))).toMatch(/rate limit/i);
  });

  it('maps 403 with rate-limit message to rate limit', () => {
    const err = new Error('API rate limit exceeded');
    (err as Error & { status?: number }).status = 403;
    expect(describeError(err)).toMatch(/rate limit/i);
  });

  it('passes through unknown error messages', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('handles non-Error values', () => {
    expect(describeError('weird')).toMatch(/unexpected|unknown/i);
  });
});
