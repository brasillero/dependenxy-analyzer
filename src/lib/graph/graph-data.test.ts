import { describe, it, expect } from 'vitest';
import { buildGraphData, filterSharedOnly, REPO_COLORS } from './graph-data';
import type { DependencyGroup, RepoConfig } from '@/lib/types';

const repos: RepoConfig[] = [
  { id: 'r1', provider: 'github', host: 'github.com', path: 'acme/a', displayName: 'acme/a', defaultBranch: 'main' },
  { id: 'r2', provider: 'github', host: 'github.com', path: 'acme/b', displayName: 'acme/b', defaultBranch: 'main', selectedBranch: 'develop' },
];

function project(repoId: string, repoName: string, packagePath = 'package.json', packageName = 'root') {
  return { repoId, repoName, packagePath, packageName };
}

const groups: DependencyGroup[] = [
  {
    depName: 'react',
    versions: [
      { versionRange: '^18.2.0', depTypes: ['dependencies'], projects: [project('r1', 'acme/a'), project('r2', 'acme/b')] },
      { versionRange: '^17.0.2', depTypes: ['dependencies'], projects: [project('r2', 'acme/b', 'packages/legacy/package.json', 'legacy')] },
    ],
  },
  {
    depName: 'lodash',
    versions: [
      { versionRange: '^4.17.21', depTypes: ['dependencies'], projects: [project('r1', 'acme/a')] },
    ],
  },
];

describe('buildGraphData', () => {
  it('creates one repo node per repo with repo_ id prefix and distinct colors', () => {
    const { repoNodes } = buildGraphData(groups, repos);
    expect(repoNodes.map((n) => n.id)).toEqual(['repo_r1', 'repo_r2']);
    expect(repoNodes[0].data.color).toBe(REPO_COLORS[0]);
    expect(repoNodes[1].data.color).toBe(REPO_COLORS[1]);
    expect(repoNodes[0].data.color).not.toBe(repoNodes[1].data.color);
  });

  it('repo node data carries label and effective branch', () => {
    const { repoNodes } = buildGraphData(groups, repos);
    expect(repoNodes[0].data).toMatchObject({ label: 'acme/a', branch: 'main' });
    expect(repoNodes[1].data).toMatchObject({ label: 'acme/b', branch: 'develop' });
  });

  it('creates package nodes with pkg_ prefix, isShared and hasVersionDrift flags', () => {
    const { packageNodes } = buildGraphData(groups, repos);
    const react = packageNodes.find((n) => n.id === 'pkg_react')!;
    const lodash = packageNodes.find((n) => n.id === 'pkg_lodash')!;
    expect(react.data.isShared).toBe(true); // 3 projects
    expect(react.data.hasVersionDrift).toBe(true); // 2 ranges
    expect(lodash.data.isShared).toBe(false); // 1 project
    expect(lodash.data.hasVersionDrift).toBe(false);
  });

  it('flattens versions per project with repo color, branch and status', () => {
    const { packageNodes } = buildGraphData(groups, repos);
    const react = packageNodes.find((n) => n.id === 'pkg_react')!;
    expect(react.data.versions).toHaveLength(3);
    const legacy = react.data.versions.find((v) => v.packagePath === 'packages/legacy/package.json')!;
    expect(legacy).toMatchObject({
      repoId: 'r2',
      version: '^17.0.2',
      branch: 'develop',
      status: 'divergent', // second version group (fewer projects) while drifted
    });
    const majority = react.data.versions.find((v) => v.repoId === 'r1')!;
    expect(majority.status).toBe('majority'); // first version group (most projects)
    expect(majority.repoColor).toBe(REPO_COLORS[0]);
    const lodash = packageNodes.find((n) => n.id === 'pkg_lodash')!;
    expect(lodash.data.versions[0].status).toBe('aligned'); // no drift
  });

  it('creates edges repo -> pkg with the repo color, deduped per repo-dep pair', () => {
    const { edges } = buildGraphData(groups, repos);
    // r2 -> react appears twice (two packages), but must be a single edge:
    const reactEdges = edges.filter((e) => e.target === 'pkg_react');
    expect(reactEdges).toHaveLength(2);
    expect(reactEdges.map((e) => e.source).sort()).toEqual(['repo_r1', 'repo_r2']);
    expect(reactEdges.find((e) => e.source === 'repo_r1')!.stroke).toBe(REPO_COLORS[0]);
    expect(reactEdges.find((e) => e.source === 'repo_r2')!.stroke).toBe(REPO_COLORS[1]);
    // ids are unique:
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
  });

  it('skips projects whose repoId is not in the repos array (no dangling edges)', () => {
    const staleGroups: DependencyGroup[] = [
      {
        depName: 'react',
        versions: [
          {
            versionRange: '^18.2.0',
            depTypes: ['dependencies'],
            projects: [project('r1', 'acme/a'), project('ghost', 'acme/gone')],
          },
        ],
      },
    ];
    const { repoNodes, packageNodes, edges } = buildGraphData(staleGroups, repos);
    // no dangling edge to a non-existent repo node:
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('repo_r1');
    // no version entry for the unknown repo either:
    const react = packageNodes.find((n) => n.id === 'pkg_react')!;
    expect(react.data.versions).toHaveLength(1);
    expect(react.data.versions[0].repoId).toBe('r1');
    // the rest of the graph still builds fine:
    expect(repoNodes).toHaveLength(2);
    expect(react.data.isShared).toBe(false); // only one surviving project
  });
});

describe('filterSharedOnly', () => {
  it('keeps only shared package nodes and their edges; repo nodes stay', () => {
    const filtered = filterSharedOnly(buildGraphData(groups, repos));
    expect(filtered.packageNodes.map((n) => n.id)).toEqual(['pkg_react']);
    expect(filtered.repoNodes).toHaveLength(2);
    expect(filtered.edges.every((e) => e.target === 'pkg_react')).toBe(true);
  });
});
