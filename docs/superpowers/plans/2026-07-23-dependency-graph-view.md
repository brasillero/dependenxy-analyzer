# Interactive Dependency Web Graph View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive force-directed graph view of repositories and their packages (shared center / unique per repo, hover highlighting, shared-only filter, version-drift details drawer) to the analysis view.

**Architecture:** Pure data transform (`buildGraphData`) and d3-force layout (`computeLayout`) in `src/lib/graph/`, thin custom node components and a details drawer in `src/components/graph/`, one canvas component (`DependencyGraph`) wrapping React Flow, and a List/Graph mode toggle inside the existing analysis view. All logic lives in testable pure functions; React Flow stays a thin render layer (no jsdom render tests for the canvas itself).

**Tech Stack:** `@xyflow/react` (React Flow v12 — https://reactflow.dev/, https://github.com/xyflow/xyflow) · `d3-force` (https://d3js.org/d3-force, https://github.com/d3/d3-force) · `lucide-react` (already installed) · shadcn `sheet` (added in Task 1)

**Source spec:** user's `dependency_graph_view.feature` BDD (4 scenarios: render nodes, hover highlight, shared-only filter, click → drift details drawer).

**Existing code this builds on:**
- `src/lib/types.ts` — `DependencyGroup` { depName, versions: [{ versionRange, depTypes, projects: [{ repoId, repoName, packagePath, packageName }] }] }
- `src/stores/view-store.ts` — `analysis: DependencyGroup[] | null`, `analysisFailed: { repoName, error }[]`
- `src/stores/repo-store.ts` — `repos: RepoConfig[]`
- `src/lib/package-files.ts` — `effectiveBranch(repo)` = `selectedBranch ?? defaultBranch`
- `src/components/analysis-view.tsx` — where the List/Graph toggle lands
- Styling rule: shadcn components as shipped; compose via `className`; amber warnings `border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400`. Graph accent colors are hex values in `REPO_COLORS` (graph nodes are custom renderers, not theme tokens).

---

## Task 1: Install deps + graph data transform (TDD)

**Files:**
- Create: `src/lib/graph/graph-data.ts`
- Test: `src/lib/graph/graph-data.test.ts`
- Modify: `package.json` (deps), `src/components/ui/sheet.tsx` (via shadcn CLI)

- [ ] **Step 1: Install packages**

```bash
pnpm add @xyflow/react d3-force
pnpm add -D @types/d3-force
pnpm dlx shadcn@3.8.5 add sheet
```

(Fallback for shadcn: `npx shadcn@3.8.5 add sheet`. The project pins the shadcn CLI to 3.8.5 — do NOT use `@latest`, which generates incompatible base-nova components.)

- [ ] **Step 2: Write the failing test**

Create `src/lib/graph/graph-data.test.ts`:

```ts
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
});

describe('filterSharedOnly', () => {
  it('keeps only shared package nodes and their edges; repo nodes stay', () => {
    const filtered = filterSharedOnly(buildGraphData(groups, repos));
    expect(filtered.packageNodes.map((n) => n.id)).toEqual(['pkg_react']);
    expect(filtered.repoNodes).toHaveLength(2);
    expect(filtered.edges.every((e) => e.target === 'pkg_react')).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- src/lib/graph/graph-data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/lib/graph/graph-data.ts`**

```ts
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
 * IDs: `repo_<repoId>` / `pkg_<depName>` (spec §2 — never bare names).
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

/** Hide packages connected to a single project; repo nodes always stay (BDD scenario 3). */
export function filterSharedOnly(data: GraphData): GraphData {
  const packageNodes = data.packageNodes.filter((node) => node.data.isShared);
  const keep = new Set(packageNodes.map((node) => node.id));
  return {
    repoNodes: data.repoNodes,
    packageNodes,
    edges: data.edges.filter((edge) => keep.has(edge.target)),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/lib/graph/graph-data.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/sheet.tsx src/lib/graph
git commit -m "feat: graph data transform with repo colors and drift status"
```

---

## Task 2: d3-force layout (TDD)

**Files:**
- Create: `src/lib/graph/layout.ts`
- Test: `src/lib/graph/layout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/graph/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeLayout } from './layout';

const WIDTH = 1200;
const HEIGHT = 800;

describe('computeLayout', () => {
  const nodes = [
    { id: 'repo_a' },
    { id: 'repo_b' },
    { id: 'pkg_shared' },
    { id: 'pkg_unique' },
  ];
  const links = [
    { source: 'repo_a', target: 'pkg_shared' },
    { source: 'repo_b', target: 'pkg_shared' },
    { source: 'repo_a', target: 'pkg_unique' },
  ];

  it('assigns a finite position to every node', () => {
    const positions = computeLayout(nodes, links, WIDTH, HEIGHT);
    expect(positions.size).toBe(4);
    for (const [, pos] of positions) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it('pulls shared packages closer to the center than unique ones (spec §3.3)', () => {
    const positions = computeLayout(nodes, links, WIDTH, HEIGHT);
    const center = { x: WIDTH / 2, y: HEIGHT / 2 };
    const dist = (id: string) => {
      const pos = positions.get(id)!;
      return Math.hypot(pos.x - center.x, pos.y - center.y);
    };
    expect(dist('pkg_shared')).toBeLessThan(dist('pkg_unique'));
  });

  it('handles an empty graph', () => {
    expect(computeLayout([], [], WIDTH, HEIGHT).size).toBe(0);
  });

  it('handles isolated nodes (no links)', () => {
    const positions = computeLayout([{ id: 'a' }, { id: 'b' }], [], WIDTH, HEIGHT);
    expect(positions.size).toBe(2);
    for (const [, pos] of positions) {
      expect(Number.isFinite(pos.x)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/graph/layout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/graph/layout.ts`**

```ts
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';

export interface LayoutNode {
  id: string;
}

export interface LayoutLink {
  source: string;
  target: string;
}

interface SimNode extends LayoutNode {
  x?: number;
  y?: number;
}

const SIMULATION_TICKS = 300;

/**
 * Pre-computed force-directed layout (spec §3): many-body repulsion + center
 * gravity + link attraction. Shared packages accumulate links from multiple
 * repos and are pulled toward the middle; unique ones dangle near their repo.
 * Runs synchronously to completion (no animation loop) and returns positions
 * keyed by node id.
 */
export function computeLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  width = 1200,
  height = 800,
): Map<string, { x: number; y: number }> {
  // Deterministic-ish initial scatter around the center so results are stable.
  const simNodes: SimNode[] = nodes.map((node, index) => ({
    id: node.id,
    x: width / 2 + ((index * 37) % 200) - 100,
    y: height / 2 + ((index * 53) % 200) - 100,
  }));
  const simLinks = links.map((link) => ({ ...link }));

  const simulation = forceSimulation(simNodes)
    .force('charge', forceManyBody().strength(-500))
    .force('center', forceCenter(width / 2, height / 2))
    .force(
      'link',
      forceLink<SimNode, { source: string; target: string }>(simLinks)
        .id((node) => node.id)
        .distance(180),
    )
    .force('collide', forceCollide(70))
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i += 1) {
    simulation.tick();
  }

  return new Map(simNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/graph/layout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph/layout.ts src/lib/graph/layout.test.ts
git commit -m "feat: d3-force layout for dependency graph"
```

---

## Task 3: Custom node components + details drawer

**Files:**
- Create: `src/components/graph/repo-node.tsx`
- Create: `src/components/graph/package-node.tsx`
- Create: `src/components/graph/package-details-drawer.tsx`
- Test: `src/components/graph/node-content.test.tsx`
- Test: `src/components/graph/package-details-drawer.test.tsx`

Design note: each node file exports a pure `*Content` presentational component (directly testable in jsdom) plus a thin React Flow wrapper that adds the invisible `Handle`s (Handles need React Flow context, so the wrappers themselves are not unit-tested — they carry no logic).

- [ ] **Step 1: Write the failing tests**

Create `src/components/graph/node-content.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RepoNodeContent } from './repo-node';
import { PackageNodeContent } from './package-node';
import type { PackageNodeData } from '@/lib/graph/graph-data';

const packageData: PackageNodeData = {
  packageName: 'react',
  isShared: true,
  hasVersionDrift: true,
  versions: [
    {
      repoId: 'r1',
      repoName: 'acme/a',
      packagePath: 'package.json',
      packageName: 'a',
      repoColor: '#2563eb',
      branch: 'main',
      version: '^18.2.0',
      status: 'majority',
    },
    {
      repoId: 'r2',
      repoName: 'acme/b',
      packagePath: 'package.json',
      packageName: 'b',
      repoColor: '#d97706',
      branch: 'develop',
      version: '^17.0.2',
      status: 'divergent',
    },
  ],
};

describe('RepoNodeContent', () => {
  it('renders label and branch with the accent border color', () => {
    const { container } = render(
      <RepoNodeContent data={{ label: 'acme/a', branch: 'main', color: '#2563eb' }} />,
    );
    expect(screen.getByText('acme/a')).toBeInTheDocument();
    expect(screen.getByText(/main/)).toBeInTheDocument();
    expect(container.firstChild).toHaveStyle({ borderColor: '#2563eb' });
  });
});

describe('PackageNodeContent', () => {
  it('renders the package name and one version badge per repo, colored by repo', () => {
    render(<PackageNodeContent data={packageData} />);
    expect(screen.getByText('react')).toBeInTheDocument();
    const v18 = screen.getByText('^18.2.0');
    const v17 = screen.getByText('^17.0.2');
    expect(v18).toHaveStyle({ color: '#2563eb' });
    expect(v17).toHaveStyle({ color: '#d97706' });
  });

  it('shows the drift indicator only when drifted', () => {
    const { rerender } = render(<PackageNodeContent data={packageData} />);
    expect(screen.getByText(/drift/i)).toBeInTheDocument();
    rerender(<PackageNodeContent data={{ ...packageData, hasVersionDrift: false }} />);
    expect(screen.queryByText(/drift/i)).not.toBeInTheDocument();
  });
});
```

Create `src/components/graph/package-details-drawer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PackageDetailsDrawer } from './package-details-drawer';
import type { PackageNodeData } from '@/lib/graph/graph-data';

const drifted: PackageNodeData = {
  packageName: 'react',
  isShared: true,
  hasVersionDrift: true,
  versions: [
    {
      repoId: 'r1',
      repoName: 'acme/a',
      packagePath: 'package.json',
      packageName: 'a',
      repoColor: '#2563eb',
      branch: 'main',
      version: '^18.2.0',
      status: 'majority',
    },
    {
      repoId: 'r2',
      repoName: 'acme/b',
      packagePath: 'package.json',
      packageName: 'b',
      repoColor: '#d97706',
      branch: 'develop',
      version: '^17.0.2',
      status: 'divergent',
    },
  ],
};

describe('PackageDetailsDrawer', () => {
  it('renders a row per project with repo, branch, version and status', () => {
    render(<PackageDetailsDrawer packageData={drifted} onClose={() => {}} />);
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText(/acme\/a/)).toBeInTheDocument();
    expect(screen.getByText(/acme\/b/)).toBeInTheDocument();
    expect(screen.getByText('develop')).toBeInTheDocument();
    expect(screen.getByText('^17.0.2')).toBeInTheDocument();
    expect(screen.getByText('most common')).toBeInTheDocument();
    expect(screen.getByText('divergent')).toBeInTheDocument();
  });

  it('shows aligned status when there is no drift', () => {
    const aligned: PackageNodeData = {
      ...drifted,
      hasVersionDrift: false,
      versions: [{ ...drifted.versions[0], status: 'aligned' }],
    };
    render(<PackageDetailsDrawer packageData={aligned} onClose={() => {}} />);
    expect(screen.getByText('aligned')).toBeInTheDocument();
    expect(screen.getByText(/same version range/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/components/graph`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/components/graph/repo-node.tsx`**

```tsx
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { RepoNodeData } from '@/lib/graph/graph-data';

type RepoFlowNode = Node<RepoNodeData, 'repo'>;

/** Pure presentational content (unit-tested directly). */
export function RepoNodeContent({ data }: { data: RepoNodeData }) {
  return (
    <div
      className="rounded-md border-2 bg-card px-4 py-2 shadow-sm"
      style={{ borderColor: data.color }}
    >
      <p className="font-mono text-sm font-medium">{data.label}</p>
      <p className="text-xs text-muted-foreground">on {data.branch}</p>
    </div>
  );
}

/** React Flow wrapper — adds the invisible edge handle. */
export function RepoNode({ data }: NodeProps<RepoFlowNode>) {
  return (
    <>
      <Handle type="source" position={Position.Right} className="opacity-0" />
      <RepoNodeContent data={data} />
    </>
  );
}
```

- [ ] **Step 4: Create `src/components/graph/package-node.tsx`**

```tsx
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { PackageNodeData } from '@/lib/graph/graph-data';

type PackageFlowNode = Node<PackageNodeData, 'package'>;

/** Pure presentational content (unit-tested directly). */
export function PackageNodeContent({ data }: { data: PackageNodeData }) {
  return (
    <div className="rounded-full border bg-card px-3 py-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-bold">{data.packageName}</span>
        {data.hasVersionDrift && (
          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-400">
            drift
          </span>
        )}
      </div>
      <div className="mt-1 flex max-w-56 flex-wrap gap-1">
        {data.versions.map((version) => (
          <span
            key={`${version.repoId}:${version.packagePath}`}
            className="rounded-full border px-1.5 font-mono text-[10px]"
            style={{ borderColor: version.repoColor, color: version.repoColor }}
            title={`${version.repoName} / ${version.packageName}`}
          >
            {version.version}
          </span>
        ))}
      </div>
    </div>
  );
}

/** React Flow wrapper — adds the invisible edge handle. */
export function PackageNode({ data }: NodeProps<PackageFlowNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <PackageNodeContent data={data} />
    </>
  );
}
```

- [ ] **Step 5: Create `src/components/graph/package-details-drawer.tsx`**

```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { PackageNodeData } from '@/lib/graph/graph-data';

interface Props {
  packageData: PackageNodeData | null;
  onClose: () => void;
}

const STATUS_LABELS = {
  aligned: { label: 'aligned', className: '' },
  majority: { label: 'most common', className: '' },
  divergent: {
    label: 'divergent',
    className: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
} as const;

/** Side drawer with the version-drift details table (BDD scenario 4). */
export function PackageDetailsDrawer({ packageData, onClose }: Props) {
  return (
    <Sheet open={packageData !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[440px] overflow-y-auto">
        {packageData && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono">{packageData.packageName}</SheetTitle>
              <SheetDescription>
                {packageData.hasVersionDrift
                  ? 'Version drift detected across repositories.'
                  : 'All projects declare the same version range.'}
              </SheetDescription>
            </SheetHeader>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Repository</th>
                  <th className="pb-2 font-medium">Branch</th>
                  <th className="pb-2 font-medium">Version</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {packageData.versions.map((version) => {
                  const status = STATUS_LABELS[version.status];
                  return (
                    <tr key={`${version.repoId}:${version.packagePath}`} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">
                        {version.repoName} / {version.packageName}
                      </td>
                      <td className="py-2 text-xs">{version.branch}</td>
                      <td className="py-2 font-mono text-xs">{version.version}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test -- src/components/graph`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/graph
git commit -m "feat: graph node components and version drift drawer"
```

---

## Task 4: DependencyGraph canvas

**Files:**
- Create: `src/components/graph/dependency-graph.tsx`

No unit tests for this file: React Flow needs browser APIs (ResizeObserver, DOM measurements) that jsdom can't provide meaningfully — all logic (transform, layout, filtering) is already tested in Tasks 1–3. Manual smoke in Task 5 covers the canvas.

- [ ] **Step 1: Create `src/components/graph/dependency-graph.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Checkbox } from '@/components/ui/checkbox';
import {
  buildGraphData,
  filterSharedOnly,
  type PackageNodeData,
} from '@/lib/graph/graph-data';
import { computeLayout } from '@/lib/graph/layout';
import type { DependencyGroup, RepoConfig } from '@/lib/types';
import { PackageDetailsDrawer } from './package-details-drawer';
import { PackageNode } from './package-node';
import { RepoNode } from './repo-node';

const nodeTypes = { repo: RepoNode, package: PackageNode };

const DIMMED_OPACITY = 0.2;

interface Props {
  groups: DependencyGroup[];
  repos: RepoConfig[];
}

export function DependencyGraph({ groups, repos }: Props) {
  const [sharedOnly, setSharedOnly] = useState(false);
  const [hoveredPackageId, setHoveredPackageId] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageNodeData | null>(null);

  const graphData = useMemo(() => {
    const full = buildGraphData(groups, repos);
    return sharedOnly ? filterSharedOnly(full) : full;
  }, [groups, repos, sharedOnly]);

  const { nodes, edges } = useMemo(() => {
    const allNodes = [...graphData.repoNodes, ...graphData.packageNodes];
    // Layout recalculates whenever the filtered graph changes (BDD scenario 3).
    const positions = computeLayout(
      allNodes.map((node) => ({ id: node.id })),
      graphData.edges.map((edge) => ({ source: edge.source, target: edge.target })),
    );

    // Hover: keep the package and its parent repos fully visible, dim the rest.
    const highlighted = new Set<string>();
    if (hoveredPackageId) {
      highlighted.add(hoveredPackageId);
      for (const edge of graphData.edges) {
        if (edge.target === hoveredPackageId) highlighted.add(edge.source);
      }
    }

    const nodes: Node[] = allNodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: node.data,
      style:
        hoveredPackageId && !highlighted.has(node.id) ? { opacity: DIMMED_OPACITY } : undefined,
    }));

    const edges: Edge[] = graphData.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      style: {
        stroke: edge.stroke,
        strokeWidth: hoveredPackageId && edge.target === hoveredPackageId ? 2.5 : 1.5,
        opacity: hoveredPackageId && edge.target !== hoveredPackageId ? DIMMED_OPACITY : 1,
      },
    }));

    return { nodes, edges };
  }, [graphData, hoveredPackageId]);

  return (
    <div className="relative h-[calc(100vh-10rem)] w-full rounded-md border">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5">
        <Checkbox
          id="graph-shared-only"
          checked={sharedOnly}
          onCheckedChange={(value) => setSharedOnly(value === true)}
          aria-label="Show shared only"
        />
        <label htmlFor="graph-shared-only" className="cursor-pointer text-sm">
          Show shared only
        </label>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        onNodeMouseEnter={(_, node) => {
          if (node.type === 'package') setHoveredPackageId(node.id);
        }}
        onNodeMouseLeave={() => setHoveredPackageId(null)}
        onNodeClick={(_, node) => {
          if (node.type === 'package') setSelectedPackage(node.data as PackageNodeData);
        }}
      >
        <Background />
        <Controls />
      </ReactFlow>
      <PackageDetailsDrawer
        packageData={selectedPackage}
        onClose={() => setSelectedPackage(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`
Expected: all clean. (`pnpm test` should stay green too — no new tests in this task.)

- [ ] **Step 3: Commit**

```bash
git add src/components/graph/dependency-graph.tsx
git commit -m "feat: dependency graph canvas with hover dimming and shared filter"
```

---

## Task 5: List/Graph toggle in analysis view + verification

**Files:**
- Modify: `src/components/analysis-view.tsx`

- [ ] **Step 1: Add the mode toggle and graph rendering**

In `src/components/analysis-view.tsx`:

1. Add imports:

```tsx
import { DependencyGraph } from '@/components/graph/dependency-graph';
import { useRepoStore } from '@/stores/repo-store';
```

2. Inside `AnalysisView`, add:

```tsx
const repos = useRepoStore((s) => s.repos);
const [mode, setMode] = useState<'list' | 'graph'>('list');
```

3. Compute the analyzed repos (exclude the ones that failed — they have no data in the result). Place next to the `projectCount` memo:

```tsx
const analyzedRepos = useMemo(() => {
  const failedNames = new Set(analysisFailed.map((failure) => failure.repoName));
  return repos.filter((repo) => !failedNames.has(repo.displayName));
}, [repos, analysisFailed]);
```

4. In the header row, after the "Back to repository view" Button, add the toggle:

```tsx
<div className="flex items-center gap-1 rounded-md border p-0.5">
  <Button
    variant={mode === 'list' ? 'secondary' : 'ghost'}
    size="sm"
    onClick={() => setMode('list')}
  >
    List
  </Button>
  <Button
    variant={mode === 'graph' ? 'secondary' : 'ghost'}
    size="sm"
    onClick={() => setMode('graph')}
  >
    Graph
  </Button>
</div>
```

5. Render conditionally — the search input and group cards only in list mode; the graph in graph mode. Wrap the existing search `Input` and everything after the banner in conditionals:

```tsx
{mode === 'list' && (
  <Input
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Search dependency…"
    aria-label="Search dependency"
    className="ml-auto w-64"
  />
)}
```

and replace the bottom section (`filtered.length === 0` message + cards map) with the following (keeping the "or filters" wording from the visibility-filters feature if it already landed):

```tsx
{mode === 'list' && filtered.length === 0 && (
  <p className="text-sm text-muted-foreground">
    {analysis.length === 0
      ? 'No dependencies found in the analyzed repositories.'
      : 'No dependencies match your search or filters.'}
  </p>
)}

{mode === 'list' &&
  filtered.map((group) => <DependencyGroupCard key={group.depName} group={group} />)}

{mode === 'graph' &&
  (analyzedRepos.length >= 1 && analysis.length > 0 ? (
    <DependencyGraph groups={analysis} repos={analyzedRepos} />
  ) : (
    <p className="text-sm text-muted-foreground">
      Nothing to graph — run an analysis with at least one accessible repository.
    </p>
  ))}
```

Note: the failure banner stays visible in both modes (it sits above this section, untouched).

- [ ] **Step 2: Verify**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`
Expected: all green.

- [ ] **Step 3: Manual smoke**

Run `pnpm dev` and verify in the browser (needs at least one repo with a token; a public repo you own works):

1. Run Analyze → analysis view shows the new List/Graph toggle (List active).
2. Switch to Graph: repo nodes render as colored rectangles with name + branch; package pills show version badges in repo colors; shared packages sit near the center.
3. Hover a package pill: unrelated nodes/edges dim to 20%; its edges stay highlighted.
4. Toggle "Show shared only": single-project packages disappear and the layout recalculates.
5. Click a drifted package: drawer opens with the table (Repository / Branch / Version / Status); "divergent" rows show the amber badge; closing works via X and backdrop.
6. Switch back to List: cards and search behave as before; Back to repository view still works.

- [ ] **Step 4: Commit**

```bash
git add src/components/analysis-view.tsx
git commit -m "feat: list/graph mode toggle in analysis view"
```

---

## Spec Coverage Map (self-review)

| BDD scenario | Task |
| --- | --- |
| Render repo nodes (rectangular, distinct accent color, shared center / unique near parent, version badges in repo colors) | 1 (data), 2 (layout), 3 (nodes), 4 (canvas) |
| Hover: unrelated nodes/edges fade to 20%, own edges stay highlighted | 4 |
| "Show shared only": single-repo packages hidden, layout recalculates | 1 (`filterSharedOnly`), 4 (toggle + memo recalc) |
| Click package → drawer with Repository / Target Branch / Installed Version / Status | 3 (drawer), 4 (click wiring) |
| Data contract (RepoNodeData, PackageNodeData, PackageVersionMap) | 1 (adapted per spec's flexibility note: adds packagePath/packageName for monorepo fidelity) |
| ID safety (`repo_`/`pkg_` prefixes, edge stroke = repo color) | 1 |
| d3-force strategy (manyBody/center/link, shared pulled to center) | 2 |
