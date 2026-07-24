import { DEP_TYPES, type DependencyEntry, type DependencyGroup, type PackageJsonFile, type RepoConfig } from './types';

export interface RepoFiles {
  repo: RepoConfig;
  files: PackageJsonFile[];
}

/** Flatten every dep declaration across repos, preserving full lineage (RN-08.5). */
export function flattenDependencies(perRepo: RepoFiles[]): DependencyEntry[] {
  const entries: DependencyEntry[] = [];
  for (const { repo, files } of perRepo) {
    for (const file of files) {
      for (const depType of DEP_TYPES) {
        for (const [depName, versionRange] of Object.entries(file.deps[depType])) {
          entries.push({
            depName,
            versionRange,
            depType,
            repoId: repo.id,
            repoName: repo.displayName,
            packagePath: file.path,
            packageName: file.packageName,
          });
        }
      }
    }
  }
  return entries;
}

/** Drift = more than one distinct version range string for the dependency (RN-08.4). */
export function hasDrift(group: DependencyGroup): boolean {
  return group.versions.length > 1;
}

/**
 * Group dependency -> versionRange -> projects (RN-08.3). Projects are keyed
 * by (repoId, packagePath), so a monorepo's packages count individually.
 * Ranges are compared as raw strings — deliberate literal divergence (§4.1).
 * Groups are sorted drift-first (RF-09.1 business priority), with total
 * project count descending as the tiebreak (§4.5).
 */
export function groupDependencies(entries: DependencyEntry[]): DependencyGroup[] {
  const byDep = new Map<
    string,
    Map<string, { depTypes: Set<DependencyEntry['depType']>; projects: DependencyGroup['versions'][number]['projects'] }>
  >();

  for (const entry of entries) {
    let byVersion = byDep.get(entry.depName);
    if (!byVersion) {
      byVersion = new Map();
      byDep.set(entry.depName, byVersion);
    }
    let bucket = byVersion.get(entry.versionRange);
    if (!bucket) {
      bucket = { depTypes: new Set(), projects: [] };
      byVersion.set(entry.versionRange, bucket);
    }
    bucket.depTypes.add(entry.depType);
    if (!bucket.projects.some((p) => p.repoId === entry.repoId && p.packagePath === entry.packagePath)) {
      bucket.projects.push({
        repoId: entry.repoId,
        repoName: entry.repoName,
        packagePath: entry.packagePath,
        packageName: entry.packageName,
      });
    }
  }

  const groups: DependencyGroup[] = [...byDep.entries()].map(([depName, byVersion]) => ({
    depName,
    versions: [...byVersion.entries()]
      .map(([versionRange, bucket]) => ({
        versionRange,
        depTypes: [...bucket.depTypes],
        projects: bucket.projects,
      }))
      .sort((a, b) => b.projects.length - a.projects.length),
  }));

  const projectCount = (g: DependencyGroup) => g.versions.reduce((n, v) => n + v.projects.length, 0);
  groups.sort((a, b) => Number(hasDrift(b)) - Number(hasDrift(a)) || projectCount(b) - projectCount(a));
  return groups;
}

export interface VisibilityFilter {
  hideUnique: boolean;
  hideShared: boolean;
}

/** Total project count of a group (distinct repo+package pairs across all versions). */
export function totalProjects(group: DependencyGroup): number {
  return group.versions.reduce((n, v) => n + v.projects.length, 0);
}

/**
 * Visibility filtering for the analysis view: unique = exactly 1 project,
 * shared = more than 1. Both flags compose; both on hides everything.
 */
export function filterGroupsByVisibility(
  groups: DependencyGroup[],
  filter: VisibilityFilter,
): DependencyGroup[] {
  return groups.filter((group) => {
    const count = totalProjects(group);
    if (filter.hideUnique && count === 1) return false;
    if (filter.hideShared && count > 1) return false;
    return true;
  });
}
