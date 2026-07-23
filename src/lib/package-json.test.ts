import { describe, it, expect } from 'vitest';
import {
  isExcludedPath,
  parsePackageJson,
  decodeBase64Utf8,
  EXCLUDED_SEGMENTS,
} from './package-json';

describe('isExcludedPath', () => {
  it('excludes generated directories at any depth', () => {
    expect(isExcludedPath('node_modules/foo/package.json')).toBe(true);
    expect(isExcludedPath('packages/app/dist/package.json')).toBe(true);
    expect(isExcludedPath('apps/web/.next/package.json')).toBe(true);
    expect(isExcludedPath('a/build/package.json')).toBe(true);
    expect(isExcludedPath('a/out/package.json')).toBe(true);
    expect(isExcludedPath('a/coverage/package.json')).toBe(true);
    expect(isExcludedPath('a/vendor/package.json')).toBe(true);
  });

  it('keeps legitimate package.json paths', () => {
    expect(isExcludedPath('package.json')).toBe(false);
    expect(isExcludedPath('packages/app/package.json')).toBe(false);
    expect(isExcludedPath('packages/disto/package.json')).toBe(false); // segment match, not substring
  });

  it('lists exactly the spec segments', () => {
    expect([...EXCLUDED_SEGMENTS].sort()).toEqual(
      ['.next', 'build', 'coverage', 'dist', 'node_modules', 'out', 'vendor'].sort(),
    );
  });
});

describe('parsePackageJson', () => {
  it('splits the three dependency blocks and fills missing blocks with {}', () => {
    const file = parsePackageJson(
      'packages/app/package.json',
      JSON.stringify({
        name: '@org/app',
        dependencies: { react: '^18.2.0' },
        peerDependencies: { 'react-dom': '^18.2.0' },
      }),
    );
    expect(file).toEqual({
      path: 'packages/app/package.json',
      packageName: '@org/app',
      deps: {
        dependencies: { react: '^18.2.0' },
        devDependencies: {},
        peerDependencies: { 'react-dom': '^18.2.0' },
      },
    });
  });

  it('falls back to the file path when name is missing', () => {
    const file = parsePackageJson('package.json', JSON.stringify({ dependencies: {} }));
    expect(file.packageName).toBe('package.json');
  });

  it('throws on malformed JSON (caller isolates the failure)', () => {
    expect(() => parsePackageJson('bad/package.json', '{not json')).toThrow();
  });
});

describe('decodeBase64Utf8', () => {
  it('decodes multibyte UTF-8 content with embedded newlines', () => {
    const original = '{ "name": "pação-ümlaut" }';
    const b64 = Buffer.from(original, 'utf-8').toString('base64');
    const withNewlines = `${b64.slice(0, 8)}\n${b64.slice(8)}\n`;
    expect(decodeBase64Utf8(withNewlines)).toBe(original);
  });
});
