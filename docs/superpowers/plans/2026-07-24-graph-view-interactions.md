# Graph View Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the analysis graph view: fix node blinking, make the graph the ONLY analysis view (remove the list), click-to-highlight in both directions (dimming unrelated nodes/edges), double-click to open detail sheets (repo deps + package drift), and draggable nodes.

**Architecture:** Selection-driven highlighting replaces hover-driven dimming (a pure `computeHighlight` helper + click handlers), which also removes the main blink source — the full nodes/edges rebuild on every mouse enter/leave. Dragging is enabled via a `dragOverrides` position map merged in a memo (lint-safe, no `useNodesState`/set-state-in-effect conflicts). Repo nodes gain `repoId` in their data so a new repo-dependencies drawer can filter the graph's packages. The analysis view drops the list mode entirely.

**Tech Stack:** Existing — `@xyflow/react` v12 ([API reference](https://reactflow.dev/api-reference)), d3-force, shadcn Sheet/Table, Vitest + RTL.

**Current state (from previous features):**
- `src/components/graph/dependency-graph.tsx` — canvas: `positions` memo (layout), nodes/edges memo keyed `[graphData, positions, hoveredPackageId]`, hover dimming (20%), click → drift drawer, `nodesDraggable={false}`, `type: 'straight'` edges, centered handles, stale-hover guard.
- `src/components/analysis-view.tsx` — List/Graph mode toggle (default list), search + hide unique/shared checkboxes (list-only), `DependencyGroupCard` list, failure banner, counts header, `analyzedRepos` memo.
- `src/lib/graph/graph-data.ts` — `RepoNodeData {label, branch, color}`, `PackageNodeData {packageName, isShared, hasVersionDrift, versions: PackageVersionInfo[]}`, `buildGraphData`, `filterSharedOnly`.
- `src/lib/grouping.ts` — `filterGroupsByVisibility`, `totalProjects` (list-only helpers; kept after this plan as tested utilities, unused by UI).
- Lint: `react-hooks/set-state-in-effect` rule errors on synchronous setState in effects (drove the dragOverrides design).
- Commit convention: on `main`, `feat:`/`fix:` prefixes. Push uses `git -c credential.helper= -c credential.helper="!gh auth git-credential" push origin main`.

---

## Task 1: Blink investigation + canvas restructure with dragging

**Files:**
- Modify: `src/components/graph/dependency-graph.tsx`
- Create: `docs/superpowers/plans/graph-blink-analysis.md` (short findings note)

**Blink analysis (hypothesis to verify and document):** three compounding sources —
1. **Hover-driven rebuild**: `setHoveredPackageId` on every `onNodeMouseEnter`/`onNodeMouseLeave` rebuilds the entire `nodes` and `edges` arrays (new object identities). Moving the pointer across node boundaries fires rapid enter/leave pairs → the whole graph flashes dim/undim — perceived as blinking.
2. **List↔Graph remount**: the mode toggle unmounts/remounts `<ReactFlow>` on every switch, re-running `fitView` and re-measuring every node — a visible flash. (Eliminated by Task 4's list removal.)
3. **Position resets**: any `graphData` memo invalidation re-runs the layout and jumps all nodes to new coordinates.

Verification steps for the implementer: read `dependency-graph.tsx` and confirm each mechanism in code (memo dependency arrays, hover handlers, conditional render in `analysis-view.tsx`); write findings into `docs/superpowers/plans/graph-blink-analysis.md` (5–10 lines per source, citing file:line), including which sources this plan eliminates and how.

- [ ] **Step 1: Write the blink analysis note**

Read the current canvas code, confirm the three mechanisms above (correct or refine them if the code says otherwise), and write `docs/superpowers/plans/graph-blink-analysis.md`:

```markdown
# Graph Node Blinking — Root Cause Analysis

## 1. Hover-driven full rebuild (primary)
<finding with file:line — the hoveredPackageId state and the nodes/edges memo that depends on it>

## 2. List/Graph remount (secondary)
<finding with file:line — conditional render of DependencyGraph in analysis-view.tsx>

## 3. Position resets on memo invalidation (tertiary)
<finding with file:line — positions memo keyed on graphData>

## Fixes applied
- Click-driven selection replaces hover dimming (Task 2) — source 1 gone.
- List view removed (Task 4) — source 2 gone.
- Layout stays memoized; dragged positions preserved via dragOverrides (Task 1) — source 3 mitigated.
```

- [ ] **Step 2: Restructure the canvas — remove hover dimming, add dragging**

Rewrite `src/components/graph/dependency-graph.tsx` as follows. Key changes: hover state and hover handlers are gone; a `dragOverrides` map preserves dragged positions across layout recomputes; `onNodesChange` applies drag deltas; selection state is introduced (wired fully in Task 2); double-click handlers are stubs wired in Task 3 — include them now to avoid a second rewrite.

```tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Checkbox } from '@/components/ui/checkbox';
import {
  buildGraphData,
  filterSharedOnly,
  type PackageNodeData,
  type RepoNodeData,
} from '@/lib/graph/graph-data';
import { computeHighlight } from '@/lib/graph/highlight';
import { computeLayout } from '@/lib/graph/layout';
import type { DependencyGroup, RepoConfig } from '@/lib/types';
import { PackageDetailsDrawer } from './package-details-drawer';
import { PackageNode } from './package-node';
import { RepoDetailsDrawer } from './repo-details-drawer';
import { RepoNode } from './repo-node';

const nodeTypes = { repo: RepoNode, package: PackageNode };

const DIMMED_OPACITY = 0.2;

interface Props {
  groups: DependencyGroup[];
  repos: RepoConfig[];
}

export function DependencyGraph({ groups, repos }: Props) {
  const [sharedOnly, setSharedOnly] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageNodeData | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoNodeData | null>(null);
  // Positions moved by the user, keyed by node id — win over the computed layout.
  const [dragOverrides, setDragOverrides] = useState<ReadonlyMap<string, { x: number; y: number }>>(
    new Map(),
  );

  const graphData = useMemo(() => {
    const full = buildGraphData(groups, repos);
    return sharedOnly ? filterSharedOnly(full) : full;
  }, [groups, repos, sharedOnly]);

  // Layout recomputes only when the graph's data changes (filter toggle, new analysis).
  const positions = useMemo(
    () =>
      computeLayout(
        [...graphData.repoNodes, ...graphData.packageNodes].map((node) => ({
          id: node.id,
          type: node.type,
        })),
        graphData.edges.map((edge) => ({ source: edge.source, target: edge.target })),
      ),
    [graphData],
  );

  // Click-selection highlight (Task 2 helper). Invalid/stale selections are null.
  const highlight = useMemo(
    () => computeHighlight(graphData, selectedNodeId),
    [graphData, selectedNodeId],
  );

  const nodes: Node[] = useMemo(
    () =>
      [...graphData.repoNodes, ...graphData.packageNodes].map((node) => ({
        id: node.id,
        type: node.type,
        position: dragOverrides.get(node.id) ?? positions.get(node.id) ?? { x: 0, y: 0 },
        data: node.data,
        style: highlight && !highlight.nodeIds.has(node.id) ? { opacity: DIMMED_OPACITY } : undefined,
      })),
    [graphData, positions, dragOverrides, highlight],
  );

  const edges: Edge[] = useMemo(
    () =>
      graphData.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'straight',
        style: {
          stroke: edge.stroke,
          strokeWidth: highlight && highlight.edgeIds.has(edge.id) ? 2.5 : 1.5,
          opacity: highlight && !highlight.edgeIds.has(edge.id) ? DIMMED_OPACITY : 1,
        },
      })),
    [graphData, highlight],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setDragOverrides((prev) => {
      let next: Map<string, { x: number; y: number }> | null = null;
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          next ??= new Map(prev);
          next.set(change.id, change.position);
        }
      }
      return next ?? prev;
    });
  }, []);

  const handleNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === 'repo' || node.type === 'package') {
      setSelectedNodeId((current) => (current === node.id ? null : node.id));
    }
  }, []);

  const handleNodeDoubleClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === 'package') {
      setSelectedPackage(node.data as PackageNodeData);
    } else if (node.type === 'repo') {
      setSelectedRepo(node.data as RepoNodeData);
    }
  }, []);

  const handlePaneClick = useCallback(() => setSelectedNodeId(null), []);

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
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={handlePaneClick}
      >
        <Background />
        <Controls />
      </ReactFlow>
      <PackageDetailsDrawer
        packageData={selectedPackage}
        onClose={() => setSelectedPackage(null)}
      />
      <RepoDetailsDrawer
        graphData={graphData}
        repo={selectedRepo}
        onClose={() => setSelectedRepo(null)}
      />
    </div>
  );
}
```

Notes for the implementer:
- `RepoDetailsDrawer` and `computeHighlight` don't exist yet — Tasks 2 and 3 create them. To keep THIS task independently buildable, create minimal placeholder exports now (`src/lib/graph/highlight.ts` with the final `computeHighlight` from Task 2 — implement it fully now with its tests; and `src/components/graph/repo-details-drawer.tsx` with the final component from Task 3). Read Tasks 2 and 3 before writing this file and implement all three files together; the split exists for review granularity.
- `RepoNodeData` must carry `repoId` (Task 3, Step 1 adds it to graph-data.ts) — do that change in this task too so the double-click handler compiles.
- `nodesDraggable` is React Flow's default (`true`) — no prop needed; `onNodesChange` makes dragging actually work.
- The stale-hover guard is gone; stale SELECTIONS are handled inside `computeHighlight` (returns null for ids not in the current graphData).

- [ ] **Step 3: Verify**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`
Expected: all green (existing graph-data/layout/node/drawer tests unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/components/graph/dependency-graph.tsx src/lib/graph/highlight.ts src/lib/graph/graph-data.ts src/components/graph/repo-details-drawer.tsx docs/superpowers/plans/graph-blink-analysis.md
git commit -m "fix: stop node blinking via selection highlight; enable node dragging"
```

---

## Task 2: Selection highlight helper (TDD)

**Files:**
- Create: `src/lib/graph/highlight.ts`
- Test: `src/lib/graph/highlight.test.ts`

(If Task 1 already created these, this task is the review checkpoint for them — the content below is the required final state.)

- [ ] **Step 1: Write the failing test**

Create `src/lib/graph/highlight.test.ts`:

```ts
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
    expect(computeHighlight(data, null)).toBeNull();
  });

  it('returns null for a node id not present in the graph (stale selection)', () => {
    expect(computeHighlight(data, 'pkg_ghost')).toBeNull();
    expect(computeHighlight(data, 'repo_ghost')).toBeNull();
  });

  it('selecting a repo highlights its packages and connecting edges', () => {
    const highlight = computeHighlight(data, 'repo_r1')!;
    expect(highlight.nodeIds).toEqual(new Set(['repo_r1', 'pkg_react', 'pkg_lodash']));
    expect(highlight.edgeIds).toEqual(new Set(['e_r1_react', 'e_r1_lodash']));
  });

  it('selecting a package highlights its parent repos and connecting edges', () => {
    const highlight = computeHighlight(data, 'pkg_react')!;
    expect(highlight.nodeIds).toEqual(new Set(['pkg_react', 'repo_r1', 'repo_r2']));
    expect(highlight.edgeIds).toEqual(new Set(['e_r1_react', 'e_r2_react']));
  });

  it('selecting a unique package highlights only itself, its repo and one edge', () => {
    const highlight = computeHighlight(data, 'pkg_lodash')!;
    expect(highlight.nodeIds).toEqual(new Set(['pkg_lodash', 'repo_r1']));
    expect(highlight.edgeIds).toEqual(new Set(['e_r1_lodash']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/graph/highlight.test.ts`
Expected: FAIL (module not found, or implementation missing).

- [ ] **Step 3: Create `src/lib/graph/highlight.ts`**

```ts
import type { GraphData } from './graph-data';

export interface HighlightSets {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/**
 * Click-selection highlight: the selected node plus its direct neighbors and
 * the connecting edges; the caller dims everything not in these sets.
 * Returns null when the selection is empty or stale (nothing dimmed).
 */
export function computeHighlight(data: GraphData, selectedNodeId: string | null): HighlightSets | null {
  if (!selectedNodeId) return null;
  const exists =
    data.repoNodes.some((node) => node.id === selectedNodeId) ||
    data.packageNodes.some((node) => node.id === selectedNodeId);
  if (!exists) return null;

  const nodeIds = new Set<string>([selectedNodeId]);
  const edgeIds = new Set<string>();
  for (const edge of data.edges) {
    if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
    }
  }
  return { nodeIds, edgeIds };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/graph/highlight.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit** (skip if included in Task 1's commit)

```bash
git add src/lib/graph/highlight.ts src/lib/graph/highlight.test.ts
git commit -m "feat: selection highlight helper for dependency graph"
```

---

## Task 3: Double-click sheets (package drift + repo dependencies)

**Files:**
- Modify: `src/lib/graph/graph-data.ts` (add `repoId` to `RepoNodeData` + `repoDependencies`)
- Modify: `src/lib/graph/graph-data.test.ts`
- Create: `src/components/graph/repo-details-drawer.tsx`
- Test: `src/components/graph/repo-details-drawer.test.tsx`

Behavior: package drawer now opens on DOUBLE-click (wired in Task 1's `handleNodeDoubleClick` — no more single-click open). Repo node double-click opens the new repo-dependencies sheet.

- [ ] **Step 1: Add `repoId` to repo node data**

In `src/lib/graph/graph-data.ts`:

1. Extend `RepoNodeData`:

```ts
export interface RepoNodeData extends Record<string, unknown> {
  repoId: string;
  label: string;
  branch: string;
  color: string;
}
```

2. In `buildGraphData`'s repoNodes map, add `repoId: repo.id` to `data`.

3. Append `repoDependencies` to the same file:

```ts
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
```

- [ ] **Step 2: Extend the graph-data tests**

Append to `src/lib/graph/graph-data.test.ts` (fixtures `repos`/`groups` already exist there):

```ts
describe('repoDependencies', () => {
  it('lists every declaration of the given repo with drift flags, sorted', () => {
    const data = buildGraphData(groups, repos);
    const rows = repoDependencies(data, 'r2');
    expect(rows.map((r) => r.packageName)).toEqual(['react']);
    // r2 declares react in two packages (two version entries):
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.hasVersionDrift)).toBe(true);
    const legacy = rows.find((r) => r.packagePath === 'packages/legacy/package.json')!;
    expect(legacy.version).toBe('^17.0.2');
  });

  it('returns an empty list for an unknown repo id', () => {
    expect(repoDependencies(buildGraphData(groups, repos), 'ghost')).toEqual([]);
  });
});
```

Also add `repoId` assertions to the existing repo-node test:

```ts
expect(repoNodes[0].data).toMatchObject({ repoId: 'r1', label: 'acme/a', branch: 'main' });
expect(repoNodes[1].data).toMatchObject({ repoId: 'r2', label: 'acme/b', branch: 'develop' });
```

- [ ] **Step 3: Run graph-data tests to verify they fail, then pass**

Run: `pnpm test -- src/lib/graph/graph-data.test.ts`
Expected: FAIL on the new tests before Step 1–2, PASS after.

- [ ] **Step 4: Create `src/components/graph/repo-details-drawer.tsx`**

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { repoDependencies, type GraphData, type RepoNodeData } from '@/lib/graph/graph-data';
import { pluralize } from '@/lib/utils';

interface Props {
  graphData: GraphData;
  repo: RepoNodeData | null;
  onClose: () => void;
}

/** Side drawer listing every dependency declared by one repository. */
export function RepoDetailsDrawer({ graphData, repo, onClose }: Props) {
  const rows = repo ? repoDependencies(graphData, repo.repoId) : [];

  return (
    <Sheet open={repo !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-[440px]">
        {repo && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 font-mono">
                {repo.label}
                <Badge variant="secondary" className="font-mono font-normal">
                  {pluralize(rows.length, 'package', 'packages')}
                </Badge>
              </SheetTitle>
              <SheetDescription>Dependencies declared on {repo.branch}.</SheetDescription>
            </SheetHeader>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.packageName}:${row.packagePath}`}>
                    <TableCell className="font-mono text-xs">
                      {row.packageName}
                      {row.packagePath !== 'package.json' && (
                        <span className="block text-[10px] text-muted-foreground">
                          {row.packagePath}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.version}</TableCell>
                    <TableCell>
                      {row.hasVersionDrift ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        >
                          drift
                        </Badge>
                      ) : (
                        <Badge variant="outline">aligned</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 5: Write the drawer test**

Create `src/components/graph/repo-details-drawer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RepoDetailsDrawer } from './repo-details-drawer';
import { buildGraphData, type RepoNodeData } from '@/lib/graph/graph-data';
import type { DependencyGroup, RepoConfig } from '@/lib/types';

const repos: RepoConfig[] = [
  { id: 'r1', provider: 'github', host: 'github.com', path: 'acme/a', displayName: 'acme/a', defaultBranch: 'main' },
  { id: 'r2', provider: 'github', host: 'github.com', path: 'acme/b', displayName: 'acme/b', defaultBranch: 'main', selectedBranch: 'develop' },
];

const groups: DependencyGroup[] = [
  {
    depName: 'react',
    versions: [
      { versionRange: '^18.2.0', depTypes: ['dependencies'], projects: [
        { repoId: 'r1', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
        { repoId: 'r2', repoName: 'acme/b', packagePath: 'package.json', packageName: 'b' },
      ] },
      { versionRange: '^17.0.2', depTypes: ['dependencies'], projects: [
        { repoId: 'r2', repoName: 'acme/b', packagePath: 'packages/legacy/package.json', packageName: 'legacy' },
      ] },
    ],
  },
];

const graphData = buildGraphData(groups, repos);
const repoData: RepoNodeData = graphData.repoNodes[1].data; // acme/b

describe('RepoDetailsDrawer', () => {
  it('lists the repo\'s declarations with count, versions, paths and drift badges', () => {
    render(<RepoDetailsDrawer graphData={graphData} repo={repoData} onClose={() => {}} />);
    expect(screen.getByText('acme/b')).toBeInTheDocument();
    expect(screen.getByText('2 packages')).toBeInTheDocument();
    expect(screen.getByText(/develop/)).toBeInTheDocument();
    expect(screen.getByText('^18.2.0')).toBeInTheDocument();
    expect(screen.getByText('^17.0.2')).toBeInTheDocument();
    expect(screen.getByText('packages/legacy/package.json')).toBeInTheDocument();
    expect(screen.getAllByText('drift')).toHaveLength(2);
  });

  it('renders nothing when repo is null', () => {
    render(<RepoDetailsDrawer graphData={graphData} repo={null} onClose={() => {}} />);
    expect(screen.queryByText('acme/b')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all suites). Also `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.

- [ ] **Step 7: Commit** (skip if included in Task 1's commit)

```bash
git add src/lib/graph/graph-data.ts src/lib/graph/graph-data.test.ts src/components/graph/repo-details-drawer.tsx src/components/graph/repo-details-drawer.test.tsx
git commit -m "feat: repo dependencies drawer on double-click"
```

---

## Task 4: Remove the list view (graph is the only analysis view)

**Files:**
- Modify: `src/components/analysis-view.tsx`
- Delete: `src/components/dependency-group-card.tsx`, `src/components/dependency-group-card.test.tsx`
- Delete: `src/components/analysis-view.test.tsx` (list-specific), replaced by a slim new version

- [ ] **Step 1: Rewrite `src/components/analysis-view.tsx`**

Remove: the `mode` state and List/Graph toggle, the search input, the hide-unique/hide-shared checkboxes, the `filtered` memo, `DependencyGroupCard` usage, and the `filterGroupsByVisibility` import. Keep: counts header, Back button, failure banner (with the render-time re-arm pattern), `analyzedRepos`, the null-analysis state, and the graph render guard. Final content:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DependencyGraph } from '@/components/graph/dependency-graph';
import { pluralize } from '@/lib/utils';
import { useRepoStore } from '@/stores/repo-store';
import { useViewStore } from '@/stores/view-store';

export function AnalysisView() {
  const analysis = useViewStore((s) => s.analysis);
  const analysisFailed = useViewStore((s) => s.analysisFailed);
  const analysisTotalFailed = useViewStore((s) => s.analysisTotalFailed);
  const setView = useViewStore((s) => s.setView);
  const repos = useRepoStore((s) => s.repos);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // A new analysis run (new analysisFailed array identity) re-arms the banner.
  const [prevFailed, setPrevFailed] = useState(analysisFailed);
  if (prevFailed !== analysisFailed) {
    setPrevFailed(analysisFailed);
    setBannerDismissed(false);
  }

  // "M projects" = distinct (repoId, packagePath) pairs across the result.
  const projectCount = useMemo(() => {
    const keys = new Set<string>();
    for (const group of analysis ?? []) {
      for (const version of group.versions) {
        for (const project of version.projects) {
          keys.add(`${project.repoId}:${project.packagePath}`);
        }
      }
    }
    return keys.size;
  }, [analysis]);

  const analyzedRepos = useMemo(() => {
    const failedNames = new Set(analysisFailed.map((failure) => failure.repoName));
    return repos.filter((repo) => !failedNames.has(repo.displayName));
  }, [repos, analysisFailed]);

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Run Analyze to see cross-repo results.
      </div>
    );
  }

  const showBanner = analysisFailed.length > 0 && !bannerDismissed;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">
          Analysis — {pluralize(analysis.length, 'dependency', 'dependencies')} across{' '}
          {pluralize(projectCount, 'project', 'projects')}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setView('repo')}>
          Back to repository view
        </Button>
      </div>

      {showBanner && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {analysisTotalFailed
                  ? 'Analysis failed — no repository could be analyzed.'
                  : `Partial analysis — ${analysisFailed.length} ${
                      analysisFailed.length === 1 ? 'repository' : 'repositories'
                    } failed`}
              </p>
              <ul className="space-y-0.5 text-sm text-amber-700 dark:text-amber-400">
                {analysisFailed.map((failure, index) => (
                  <li key={`${failure.repoName}:${index}`}>
                    <span className="font-mono">{failure.repoName}</span> — {failure.error}
                  </li>
                ))}
              </ul>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label="Dismiss"
              onClick={() => setBannerDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {analyzedRepos.length >= 1 && analysis.length > 0 ? (
        <DependencyGraph groups={analysis} repos={analyzedRepos} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing to graph — run an analysis with at least one accessible repository.
        </p>
      )}
    </div>
  );
}
```

Note: keep the exact current behavior of the header counts and banner (the snippet above preserves them — verify against the current file before replacing; if the current file differs in wording, keep the current wording).

- [ ] **Step 2: Delete the list-only files**

```bash
git rm src/components/dependency-group-card.tsx src/components/dependency-group-card.test.tsx src/components/analysis-view.test.tsx
```

`filterGroupsByVisibility`/`totalProjects` in `src/lib/grouping.ts` stay (tested helpers, now unused by the UI — retained for future graph filters).

- [ ] **Step 3: Replace the analysis-view test with a slim graph-era version**

Create `src/components/analysis-view.test.tsx` (mocking the canvas, which jsdom can't render):

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalysisView } from './analysis-view';
import { useViewStore } from '@/stores/view-store';
import { useRepoStore } from '@/stores/repo-store';
import type { DependencyGroup, RepoConfig } from '@/lib/types';

vi.mock('@/components/graph/dependency-graph', () => ({
  DependencyGraph: ({ groups, repos }: { groups: DependencyGroup[]; repos: RepoConfig[] }) => (
    <div data-testid="graph" data-groups={groups.length} data-repos={repos.map((r) => r.id).join(',')} />
  ),
}));

const group: DependencyGroup = {
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
};

function repo(id: string, displayName: string): RepoConfig {
  return {
    id,
    provider: 'github',
    host: 'github.com',
    path: displayName,
    displayName,
    defaultBranch: 'main',
  };
}

beforeEach(() => {
  localStorage.clear();
  useViewStore.setState({
    view: 'analysis',
    analysis: [group],
    analysisFailed: [],
    analysisTotalFailed: false,
  });
  useRepoStore.setState({
    repos: [repo('r1', 'acme/a'), repo('r2', 'acme/b')],
    selectedRepoId: null,
  });
});

describe('AnalysisView', () => {
  it('renders the graph with analyzed repos and the counts header', () => {
    render(<AnalysisView />);
    expect(screen.getByText(/1 dependency across 2 projects/)).toBeInTheDocument();
    const graph = screen.getByTestId('graph');
    expect(graph.dataset.groups).toBe('1');
    expect(graph.dataset.repos).toBe('r1,r2');
  });

  it('excludes failed repos from the graph and shows the banner', () => {
    useViewStore.setState({
      view: 'analysis',
      analysis: [group],
      analysisFailed: [{ repoName: 'acme/b', error: 'boom' }],
      analysisTotalFailed: false,
    });
    render(<AnalysisView />);
    expect(screen.getByText(/Partial analysis/)).toBeInTheDocument();
    expect(screen.getByTestId('graph').dataset.repos).toBe('r1');
  });

  it('shows the nothing-to-graph message when the analysis is empty', () => {
    useViewStore.setState({
      view: 'analysis',
      analysis: [],
      analysisFailed: [],
      analysisTotalFailed: false,
    });
    render(<AnalysisView />);
    expect(screen.getByText(/Nothing to graph/)).toBeInTheDocument();
    expect(screen.queryByTestId('graph')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Verify**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`
Expected: all green. Confirm no remaining imports of `DependencyGroupCard` or `filterGroupsByVisibility` in components (`rg`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: make the graph the only analysis view"
```

---

## Task 5: Final verification + smoke

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`
Expected: all green (~150 tests).

- [ ] **Step 2: Manual smoke checklist**

Run `pnpm dev` and verify in a browser (needs a token + 2 repos with a drifted shared dep):

1. Analyze → analysis view shows the graph directly (no List/Graph toggle, no search/checkboxes, no cards).
2. Nodes do NOT blink when moving the mouse across the graph (hover does nothing now).
3. Single-click a repo node → its packages and connecting edges stay bright, everything else dims to 20%; clicking it again (or the empty pane) clears.
4. Single-click a package pill → its parent repos and edges highlighted, rest dimmed.
5. Double-click a package pill → drift drawer opens (shadcn Table, version count badge).
6. Double-click a repo node → repo dependencies drawer (package count badge, per-declaration rows, drift badges).
7. Drag a node → it stays where dropped; toggling "Show shared only" keeps the dragged position for surviving nodes.
8. The failure banner (if any) shows in the graph view and dismisses.

- [ ] **Step 3: Push**

```bash
git -c credential.helper= -c credential.helper="!gh auth git-credential" push origin main
```

---

## Self-review

**Requirement coverage:**
| Requirement | Task |
| --- | --- |
| Investigate blinking | 1 (analysis note + restructure removes hover rebuild; Task 4 removes remount) |
| Graph is the only analysis view | 4 |
| Double-click repo → deps sheet | 1 (handler) + 3 (drawer) |
| Package sheet on double-click, not click | 1 (moved to `onNodeDoubleClick`) |
| Click repo → highlight its packages (dim rest) | 1 (wiring) + 2 (helper) |
| Click package → highlight its repos (dim rest) | 1 (wiring) + 2 (helper) |
| Draggable nodes | 1 (`onNodesChange` + dragOverrides) |

**Type consistency:** `computeHighlight` returns `{nodeIds, edgeIds}` — consumed identically in the canvas memo. `RepoNodeData.repoId` added in Task 3 Step 1, consumed by `repoDependencies` and the drawer prop. `RepoDependencyRow` fields match the drawer table. `NodeMouseHandler` / `NodeChange` come from `@xyflow/react` v12 exports.

**Notes:** Task 1 depends on Tasks 2–3's files (by design — implement together, commit granularity as noted). The `set-state-in-effect` lint rule is avoided via the dragOverrides-in-memo design (no node state in effects).
