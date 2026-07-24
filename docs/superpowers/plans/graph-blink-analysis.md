# Graph Node Blinking — Root Cause Analysis

## 1. Hover-driven full rebuild (primary)
`src/components/graph/dependency-graph.tsx:29` holds `hoveredPackageId` state, and the
nodes/edges `useMemo` at `src/components/graph/dependency-graph.tsx:47-88` depends on it
(plus `onNodeMouseEnter`/`onNodeMouseLeave` at lines 109-112). Every mouse enter/leave
rebuilds ALL node and edge objects, so rapid pointer movement flashes dim/undim across
the whole graph.

## 2. List/Graph remount (secondary)
`src/components/analysis-view.tsx:172-179` conditionally renders `<DependencyGraph>` only
when `mode === 'graph'`. Every List ↔ Graph switch unmounts/remounts ReactFlow, re-running
`fitView` and re-measuring every node — a visible flash of the whole canvas.

## 3. Position resets on memo invalidation (tertiary)
The positions memo at `src/components/graph/dependency-graph.tsx:39-45` is keyed on
`graphData`. Any graphData identity change (filter toggle, new analysis) recomputes the
layout from scratch, snapping nodes back to simulated positions — combined with sources
1-2 this reads as blinking/jumping.

## Fixes applied
- Click-driven selection replaces hover dimming (this change) — source 1 gone.
- List view removed (Task 4) — source 2 gone.
- Layout stays memoized; dragged positions preserved via dragOverrides — source 3 mitigated.
