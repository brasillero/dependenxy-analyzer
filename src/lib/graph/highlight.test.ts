import { describe, it, expect } from 'vitest';
import { computeHighlight } from './highlight';
import { buildGraphData } from './graph-data';
import type { DependencyGroup, RepoConfig } from '@/lib/types';

const repos: RepoConfig[] = [
  { id: 'r1', provider: 'github', host: 'github.com', path: 'acme/a', displayName: 'acme/a', defaultBranch: 'main' },
  { id: 'r2', provider: 'github', host: 'github.com', path: 'acme/b', displayName: 'acme/b', defaultBranch: 'main' },
];

const groups: DependencyGroup[] = [
  {
    depName: 'react',
    versions: [
      {
        versionRange: '^18.2.0',
        depTypes: ['dependencies'],
        projects: [
          { repoId: 'r1', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
          { repoId: 'r2', repoName: 'acme/b', packagePath: 'package.json', packageName: 'b' },
        ],
      },
    ],
  },
  {
    depName: 'lodash',
    versions: [
      {
        versionRange: '^4.17.21',
        depTypes: ['dependencies'],
        projects: [{ repoId: 'r1', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' }],
      },
    ],
  },
];

const data = buildGraphData(groups, repos);

describe('computeHighlight', () => {
  it('returns null without a selection', () => {
    expect(computeHighlight(data, [])).toBeNull();
  });

  it('returns null for node ids not present in the graph (stale selection)', () => {
    expect(computeHighlight(data, ['pkg_ghost'])).toBeNull();
    expect(computeHighlight(data, ['repo_ghost'])).toBeNull();
  });

  it('selecting a repo highlights its packages and connecting edges', () => {
    const highlight = computeHighlight(data, ['repo_r1'])!;
    expect(highlight.nodeIds).toEqual(new Set(['repo_r1', 'pkg_react', 'pkg_lodash']));
    expect(highlight.edgeIds).toEqual(new Set(['e_r1_react', 'e_r1_lodash']));
  });

  it('selecting a package highlights its parent repos and connecting edges', () => {
    const highlight = computeHighlight(data, ['pkg_react'])!;
    expect(highlight.nodeIds).toEqual(new Set(['pkg_react', 'repo_r1', 'repo_r2']));
    expect(highlight.edgeIds).toEqual(new Set(['e_r1_react', 'e_r2_react']));
  });

  it('selecting a unique package highlights only itself, its repo and one edge', () => {
    const highlight = computeHighlight(data, ['pkg_lodash'])!;
    expect(highlight.nodeIds).toEqual(new Set(['pkg_lodash', 'repo_r1']));
    expect(highlight.edgeIds).toEqual(new Set(['e_r1_lodash']));
  });

  it('unions neighborhoods for multi-selection', () => {
    const highlight = computeHighlight(data, ['pkg_lodash', 'repo_r2'])!;
    expect(highlight.nodeIds).toEqual(new Set(['pkg_lodash', 'repo_r1', 'repo_r2', 'pkg_react']));
    expect(highlight.edgeIds).toEqual(new Set(['e_r1_lodash', 'e_r2_react']));
  });
});
