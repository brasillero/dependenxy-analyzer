import { describe, it, expect } from 'vitest';
import { validateGitLabHost } from './ssrf';

describe('validateGitLabHost', () => {
  it('accepts public http/https hosts', () => {
    expect(validateGitLabHost('https://gitlab.com').ok).toBe(true);
    expect(validateGitLabHost('https://gitlab.acme.com').ok).toBe(true);
    expect(validateGitLabHost('http://gitlab.acme.internal:8080').ok).toBe(true);
  });

  it('rejects non-http(s) schemes', () => {
    expect(validateGitLabHost('file:///etc/passwd').ok).toBe(false);
    expect(validateGitLabHost('ftp://gitlab.com').ok).toBe(false);
    expect(validateGitLabHost('gopher://evil').ok).toBe(false);
  });

  it('rejects loopback and localhost', () => {
    expect(validateGitLabHost('http://localhost').ok).toBe(false);
    expect(validateGitLabHost('http://foo.localhost').ok).toBe(false);
    expect(validateGitLabHost('http://127.0.0.1').ok).toBe(false);
    expect(validateGitLabHost('http://127.5.5.5').ok).toBe(false);
    expect(validateGitLabHost('http://[::1]').ok).toBe(false);
  });

  it('rejects private and link-local ranges', () => {
    expect(validateGitLabHost('http://10.0.0.4').ok).toBe(false);
    expect(validateGitLabHost('http://192.168.1.10').ok).toBe(false);
    expect(validateGitLabHost('http://172.16.0.1').ok).toBe(false);
    expect(validateGitLabHost('http://172.31.255.255').ok).toBe(false);
    expect(validateGitLabHost('http://169.254.169.254').ok).toBe(false); // cloud metadata
  });

  it('accepts public IPs adjacent to private ranges', () => {
    expect(validateGitLabHost('http://172.15.0.1').ok).toBe(true);
    expect(validateGitLabHost('http://172.32.0.1').ok).toBe(true);
    expect(validateGitLabHost('http://11.0.0.1').ok).toBe(true);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(validateGitLabHost('https://user:pass@gitlab.acme.com').ok).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(validateGitLabHost('not a url').ok).toBe(false);
    expect(validateGitLabHost('').ok).toBe(false);
  });
});
