import { describe, it, expect } from 'vitest';
import { flattenDependencies, groupDependencies, hasDrift, totalProjects, filterGroupsByVisibility } from './grouping';
import type { PackageJsonFile, RepoConfig } from '@/lib/types';

function repo(id: string): RepoConfig {
  return {
    id,
    provider: 'github',
    host: 'github.com',
    path: `acme/${id}`,
    displayName: `acme/${id}`,
    defaultBranch: 'main',
  };
}

function pkg(path: string, deps: Partial<PackageJsonFile['deps']>): PackageJsonFile {
  return {
    path,
    packageName: path.replace(/\/package\.json$/, '') || 'root',
    deps: {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      ...deps,
    },
  };
}

describe('flattenDependencies', () => {
  it('flattens all three dep types with full lineage', () => {
    const entries = flattenDependencies([
      {
        repo: repo('a'),
        files: [
          pkg('package.json', {
            dependencies: { react: '^18.2.0' },
            devDependencies: { vitest: '^2.0.0' },
          }),
          pkg('packages/lib/package.json', { peerDependencies: { react: '^18.2.0' } }),
        ],
      },
    ]);
    expect(entries).toHaveLength(3);
    const peer = entries.find((e) => e.depType === 'peerDependencies');
    expect(peer).toMatchObject({
      depName: 'react',
      versionRange: '^18.2.0',
      repoId: 'a',
      repoName: 'acme/a',
      packagePath: 'packages/lib/package.json',
    });
  });
});

describe('groupDependencies', () => {
  it('groups dep -> versionRange -> projects and flags drift on >1 distinct range', () => {
    const entries = flattenDependencies([
      { repo: repo('a'), files: [pkg('package.json', { dependencies: { axios: '^1.6.0' } })] },
      { repo: repo('b'), files: [pkg('package.json', { dependencies: { axios: '^1.6.0' } })] },
      { repo: repo('c'), files: [pkg('package.json', { dependencies: { axios: '^0.27.0' } })] },
    ]);
    const groups = groupDependencies(entries);
    expect(groups).toHaveLength(1);
    const axios = groups[0];
    expect(axios.depName).toBe('axios');
    expect(axios.versions).toHaveLength(2);
    expect(hasDrift(axios)).toBe(true);
    const v16 = axios.versions.find((v) => v.versionRange === '^1.6.0');
    expect(v16?.projects.map((p) => p.repoName).sort()).toEqual(['acme/a', 'acme/b']);
  });

  it('treats ^1.2.3 and 1.2.3 as distinct ranges (literal manifest divergence)', () => {
    const entries = flattenDependencies([
      { repo: repo('a'), files: [pkg('package.json', { dependencies: { x: '^1.2.3' } })] },
      { repo: repo('b'), files: [pkg('package.json', { dependencies: { x: '1.2.3' } })] },
    ]);
    const [group] = groupDependencies(entries);
    expect(group.versions).toHaveLength(2);
    expect(hasDrift(group)).toBe(true);
  });

  it('counts monorepo packages as separate projects on the same version', () => {
    const entries = flattenDependencies([
      {
        repo: repo('mono'),
        files: [
          pkg('packages/a/package.json', { dependencies: { lodash: '^4.17.21' } }),
          pkg('packages/b/package.json', { dependencies: { lodash: '^4.17.21' } }),
        ],
      },
    ]);
    const [group] = groupDependencies(entries);
    expect(group.versions[0].projects).toHaveLength(2);
    expect(hasDrift(group)).toBe(false);
  });

  it('records the dep types a version appears in, deduped per project', () => {
    const entries = flattenDependencies([
      {
        repo: repo('a'),
        files: [
          pkg('package.json', {
            dependencies: { ts: '^5.0.0' },
            devDependencies: { ts: '^5.0.0' },
          }),
        ],
      },
    ]);
    const [group] = groupDependencies(entries);
    expect(group.versions[0].depTypes.sort()).toEqual(['dependencies', 'devDependencies']);
    expect(group.versions[0].projects).toHaveLength(1);
  });

  it('sorts groups by total project count descending', () => {
    const entries = flattenDependencies([
      { repo: repo('a'), files: [pkg('package.json', { dependencies: { rare: '^1.0.0', common: '^2.0.0' } })] },
      { repo: repo('b'), files: [pkg('package.json', { dependencies: { common: '^2.0.0' } })] },
    ]);
    const groups = groupDependencies(entries);
    expect(groups[0].depName).toBe('common');
  });

  it('sorts drifted groups first even with fewer projects, count as tiebreak (RF-09.1 + §4.5)', () => {
    const entries = flattenDependencies([
      { repo: repo('a'), files: [pkg('package.json', { dependencies: { drifted: '^1.0.0', common: '^2.0.0' } })] },
      { repo: repo('b'), files: [pkg('package.json', { dependencies: { drifted: '^2.0.0', common: '^2.0.0' } })] },
      { repo: repo('c'), files: [pkg('package.json', { dependencies: { common: '^2.0.0' } })] },
    ]);
    const groups = groupDependencies(entries);
    expect(groups[0].depName).toBe('drifted');
    expect(groups[1].depName).toBe('common');
  });
});

describe('totalProjects', () => {
  it('sums projects across all versions of a group', () => {
    const entries = flattenDependencies([
      { repo: repo('a'), files: [pkg('package.json', { dependencies: { x: '^1.0.0' } })] },
      { repo: repo('b'), files: [pkg('package.json', { dependencies: { x: '^2.0.0' } })] },
    ]);
    const [group] = groupDependencies(entries);
    expect(totalProjects(group)).toBe(2);
  });
});

describe('filterGroupsByVisibility', () => {
  function groupsFixture() {
    return groupDependencies(
      flattenDependencies([
        { repo: repo('a'), files: [pkg('package.json', { dependencies: { shared: '^1.0.0', unique: '^1.0.0' } })] },
        { repo: repo('b'), files: [pkg('package.json', { dependencies: { shared: '^1.0.0' } })] },
      ]),
    );
  }

  it('returns everything when both filters are off', () => {
    const groups = groupsFixture();
    expect(filterGroupsByVisibility(groups, { hideUnique: false, hideShared: false })).toHaveLength(2);
  });

  it('hideUnique drops groups used by exactly one project', () => {
    const result = filterGroupsByVisibility(groupsFixture(), { hideUnique: true, hideShared: false });
    expect(result.map((g) => g.depName)).toEqual(['shared']);
  });

  it('hideShared drops groups used by more than one project', () => {
    const result = filterGroupsByVisibility(groupsFixture(), { hideUnique: false, hideShared: true });
    expect(result.map((g) => g.depName)).toEqual(['unique']);
  });

  it('both on hides everything', () => {
    const result = filterGroupsByVisibility(groupsFixture(), { hideUnique: true, hideShared: true });
    expect(result).toEqual([]);
  });

  it('counts monorepo packages individually: a dep in 2 packages of one repo is shared', () => {
    const groups = groupDependencies(
      flattenDependencies([
        {
          repo: repo('mono'),
          files: [
            pkg('packages/a/package.json', { dependencies: { x: '^1.0.0' } }),
            pkg('packages/b/package.json', { dependencies: { x: '^1.0.0' } }),
          ],
        },
      ]),
    );
    expect(filterGroupsByVisibility(groups, { hideUnique: false, hideShared: true })).toEqual([]);
    expect(filterGroupsByVisibility(groups, { hideUnique: true, hideShared: false })).toHaveLength(1);
  });
});
