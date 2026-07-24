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

  const highlight = useMemo(
    () => computeHighlight(graphData, selectedNodeId),
    [graphData, selectedNodeId],
  );

  const nodes: Node[] = useMemo(() => {
    // Prune stale overrides: a node dragged in a previous graph (filter toggle,
    // new analysis) must not pin a same-id node off-viewport.
    const currentIds = new Set(
      [...graphData.repoNodes, ...graphData.packageNodes].map((node) => node.id),
    );
    const activeOverrides = new Map([...dragOverrides].filter(([id]) => currentIds.has(id)));
    return [...graphData.repoNodes, ...graphData.packageNodes].map((node) => ({
      id: node.id,
      type: node.type,
      position: activeOverrides.get(node.id) ?? positions.get(node.id) ?? { x: 0, y: 0 },
      data: node.data,
      style: highlight && !highlight.nodeIds.has(node.id) ? { opacity: DIMMED_OPACITY } : undefined,
    }));
  }, [graphData, positions, dragOverrides, highlight]);

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
        // Non-position changes (dimensions, select) are intentionally ignored:
        // selection is managed externally and React Flow keeps its own measurements.
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
    if (node.type === 'package' || node.type === 'repo') {
      // Deterministic end state: a double click fires onNodeClick twice first
      // (select → deselect); pin the selection so the highlight always matches
      // what the open drawer is showing.
      setSelectedNodeId(node.id);
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
