import { describe, it, expect, vi } from 'vitest';
import { collectFiles } from './package-files';
import type { PackageJsonFile } from './types';

function file(path: string): PackageJsonFile {
  return {
    path,
    packageName: path,
    deps: { dependencies: {}, devDependencies: {}, peerDependencies: {} },
  };
}

describe('collectFiles', () => {
  it('fetches every path and returns files in order', async () => {
    const fetchOne = vi.fn(async (path: string) => file(path));
    const result = await collectFiles(['a/package.json', 'b/package.json'], fetchOne);
    expect(result.files.map((f) => f.path)).toEqual(['a/package.json', 'b/package.json']);
    expect(result.failedCount).toBe(0);
  });

  it('skips and counts individually failing files without aborting (RN RF-05.6)', async () => {
    const fetchOne = vi.fn(async (path: string) => {
      if (path === 'bad/package.json') throw new Error('malformed JSON');
      return file(path);
    });
    const result = await collectFiles(
      ['ok1/package.json', 'bad/package.json', 'ok2/package.json'],
      fetchOne,
    );
    expect(result.files).toHaveLength(2);
    expect(result.failedCount).toBe(1);
  });

  it('never exceeds the concurrency limit of 8', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchOne = vi.fn(async (path: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return file(path);
    });
    const paths = Array.from({ length: 30 }, (_, i) => `pkg${i}/package.json`);
    await collectFiles(paths, fetchOne);
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(fetchOne).toHaveBeenCalledTimes(30);
  });
});
