import type { DependencyGroup, RepoConfig } from '@/lib/types';
import { effectiveBranch } from '@/lib/package-files';

/** Distinct accent colors assigned to repos by index (graph-only; not theme tokens). */
export const REPO_COLORS = [
  '#2563eb',
  '#d97706',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
];

export function repoColorFor(index: number): string {
  return REPO_COLORS[index % REPO_COLORS.length];
}

export interface RepoNodeData extends Record<string, unknown> {
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

const FALLBACK_COLOR = '#6b7280';

/**
 * Transform the analysis result into graph primitives.
 * IDs: `repo_<repoId>` / `pkg_<depName>` (never bare names — collision safety).
 * Edges go repo -> package, stroke = repo accent color, deduped per repo-dep pair.
 */
export function buildGraphData(groups: DependencyGroup[], repos: RepoConfig[]): GraphData {
  const colorByRepoId = new Map(repos.map((repo, index) => [repo.id, repoColorFor(index)]));
  const branchByRepoId = new Map(repos.map((repo) => [repo.id, effectiveBranch(repo) ?? '']));

  const repoNodes: GraphRepoNode[] = repos.map((repo, index) => ({
    id: `repo_${repo.id}`,
    type: 'repo',
    data: {
      label: repo.displayName,
      branch: effectiveBranch(repo) ?? '',
      color: repoColorFor(index),
    },
  }));

  const packageNodes: GraphPackageNode[] = [];
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  for (const group of groups) {
    const totalProjects = group.versions.reduce((n, v) => n + v.projects.length, 0);
    const hasVersionDrift = group.versions.length > 1;
    const versions: PackageVersionInfo[] = [];

    // group.versions is sorted by project count desc (groupDependencies), so
    // index 0 is the majority range when drifted.
    group.versions.forEach((version, versionIndex) => {
      for (const project of version.projects) {
        const color = colorByRepoId.get(project.repoId) ?? FALLBACK_COLOR;
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

    packageNodes.push({
      id: `pkg_${group.depName}`,
      type: 'package',
      data: {
        packageName: group.depName,
        isShared: totalProjects > 1,
        hasVersionDrift,
        versions,
      },
    });
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
