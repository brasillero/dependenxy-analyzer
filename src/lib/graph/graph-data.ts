import type { DependencyGroup, RepoConfig } from '@/lib/types';
import { effectiveBranch } from '@/lib/package-files';

/**
 * Deterministic accent color per repo, with no palette cap: the repo id is
 * hashed (FNV-1a) and spread across the hue wheel; saturation/lightness are
 * fixed for readability on the card background. Same id → same color,
 * different ids → well-separated hues.
 */
export function repoColorFor(repoId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < repoId.length; i += 1) {
    hash ^= repoId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hue = ((hash >>> 0) * 137.508) % 360; // golden-angle spread
  return `hsl(${Math.round(hue)} 65% 45%)`;
}

export interface RepoNodeData extends Record<string, unknown> {
  repoId: string;
  label: string;
  branch: string;
  color: string;
}

export interface PackageVersionInfo {
  repoId: string;
  repoName: string;
  packagePath: string;
  packageName: string;
  repoColor: string;
  branch: string;
  version: string;
  /** 'aligned' when no drift; otherwise the version group with most projects is 'majority'. */
  status: 'aligned' | 'majority' | 'divergent';
}

export interface PackageNodeData extends Record<string, unknown> {
  packageName: string;
  isShared: boolean;
  hasVersionDrift: boolean;
  versions: PackageVersionInfo[];
  /** Border accent applied when the owning repo node is selected (unique packages only). */
  accentColor?: string;
}

export interface GraphRepoNode {
  id: string;
  type: 'repo';
  data: RepoNodeData;
}

export interface GraphPackageNode {
  id: string;
  type: 'package';
  data: PackageNodeData;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  stroke: string;
}

export interface GraphData {
  repoNodes: GraphRepoNode[];
  packageNodes: GraphPackageNode[];
  edges: GraphEdge[];
}

/**
 * Transform the analysis result into graph primitives.
 * IDs: `repo_<repoId>` / `pkg_<depName>` (never bare names — collision safety).
 * Edges go repo -> package, stroke = repo accent color, deduped per repo-dep pair.
 */
export function buildGraphData(groups: DependencyGroup[], repos: RepoConfig[]): GraphData {
  const colorByRepoId = new Map(repos.map((repo) => [repo.id, repoColorFor(repo.id)]));
  const branchByRepoId = new Map(repos.map((repo) => [repo.id, effectiveBranch(repo) ?? '']));
  const knownRepoIds = new Set(repos.map((repo) => repo.id));

  const repoNodes: GraphRepoNode[] = repos.map((repo) => ({
    id: `repo_${repo.id}`,
    type: 'repo',
    data: {
      repoId: repo.id,
      label: repo.displayName,
      branch: effectiveBranch(repo) ?? '',
      color: repoColorFor(repo.id),
    },
  }));

  const packageNodes: GraphPackageNode[] = [];
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  for (const group of groups) {
    // Skip projects whose repoId is not in the repos array (stale analysis
    // data, e.g. a repo removed after the analysis ran): their repo node does
    // not exist, and an edge referencing a missing node makes d3-force's
    // forceLink throw "node not found", crashing the whole graph view.
    const survivingGroups = group.versions.filter((version) =>
      version.projects.some((project) => knownRepoIds.has(project.repoId)),
    );
    const hasVersionDrift = survivingGroups.length > 1;
    const versions: PackageVersionInfo[] = [];

    // group.versions is sorted by project count desc (groupDependencies), so
    // index 0 is the majority range when drifted.
    survivingGroups.forEach((version, versionIndex) => {
      for (const project of version.projects) {
        // Unknown repoIds were already excluded from survivingGroups, so the
        // color lookup doubles as the guard and cannot miss.
        const color = colorByRepoId.get(project.repoId);
        if (color === undefined) continue;
        versions.push({
          repoId: project.repoId,
          repoName: project.repoName,
          packagePath: project.packagePath,
          packageName: project.packageName,
          repoColor: color,
          branch: branchByRepoId.get(project.repoId) ?? '',
          version: version.versionRange,
          status: hasVersionDrift ? (versionIndex === 0 ? 'majority' : 'divergent') : 'aligned',
        });
        const edgeKey = `${project.repoId}->${group.depName}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          edges.push({
            id: `e_${project.repoId}_${group.depName}`,
            source: `repo_${project.repoId}`,
            target: `pkg_${group.depName}`,
            stroke: color,
          });
        }
      }
    });

    // A package whose every project was filtered out (all ghost repos) has no
    // surviving versions — emitting it would leave an orphan node.
    if (versions.length > 0) {
      packageNodes.push({
        id: `pkg_${group.depName}`,
        type: 'package',
        data: {
          packageName: group.depName,
          isShared: versions.length > 1,
          hasVersionDrift,
          versions,
        },
      });
    }
  }

  return { repoNodes, packageNodes, edges };
}

/** Hide packages connected to a single project; repo nodes always stay. */
export function filterSharedOnly(data: GraphData): GraphData {
  const packageNodes = data.packageNodes.filter((node) => node.data.isShared);
  const keep = new Set(packageNodes.map((node) => node.id));
  return {
    repoNodes: data.repoNodes,
    packageNodes,
    edges: data.edges.filter((edge) => keep.has(edge.target)),
  };
}

export interface RepoDependencyRow {
  packageName: string;
  packagePath: string;
  version: string;
  hasVersionDrift: boolean;
}

/** All dependency declarations of one repo, sorted by package name then path. */
export function repoDependencies(data: GraphData, repoId: string): RepoDependencyRow[] {
  const rows: RepoDependencyRow[] = [];
  for (const node of data.packageNodes) {
    for (const version of node.data.versions) {
      if (version.repoId === repoId) {
        rows.push({
          packageName: node.data.packageName,
          packagePath: version.packagePath,
          version: version.version,
          hasVersionDrift: node.data.hasVersionDrift,
        });
      }
    }
  }
  return rows.sort(
    (a, b) => a.packageName.localeCompare(b.packageName) || a.packagePath.localeCompare(b.packagePath),
  );
}
