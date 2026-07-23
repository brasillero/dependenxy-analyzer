import type { PackageJsonFile } from './types';

/** Path segments whose package.json files are generated artifacts, not sources. */
export const EXCLUDED_SEGMENTS = [
  'node_modules',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  'vendor',
] as const;

/** True when any path segment is a generated/artifact directory. Segment-exact match. */
export function isExcludedPath(path: string): boolean {
  const excluded: readonly string[] = EXCLUDED_SEGMENTS;
  return path.split('/').some((segment) => excluded.includes(segment));
}

/**
 * Coerce an unknown dep block into Record<string, string>: non-plain objects
 * (strings, arrays, null) become {}, and non-string values are dropped so
 * malformed content never silently corrupts downstream analysis.
 */
function sanitizeDeps(block: unknown): Record<string, string> {
  if (typeof block !== 'object' || block === null || Array.isArray(block)) return {};
  return Object.fromEntries(
    Object.entries(block).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;
}

/**
 * Parse raw package.json content into a PackageJsonFile with all three dep
 * blocks guaranteed present. Throws on malformed JSON — callers must isolate
 * per-file failures (a bad file never aborts the batch).
 */
export function parsePackageJson(path: string, content: string): PackageJsonFile {
  const json = JSON.parse(content) as {
    name?: unknown;
    dependencies?: unknown;
    devDependencies?: unknown;
    peerDependencies?: unknown;
  };
  return {
    path,
    packageName: typeof json.name === 'string' && json.name.length > 0 ? json.name : path,
    deps: {
      dependencies: sanitizeDeps(json.dependencies),
      devDependencies: sanitizeDeps(json.devDependencies),
      peerDependencies: sanitizeDeps(json.peerDependencies),
    },
  };
}

/**
 * Decode GitHub's base64 file content (which contains line breaks) in a
 * unicode-safe way — plain atob corrupts multibyte UTF-8.
 */
export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
