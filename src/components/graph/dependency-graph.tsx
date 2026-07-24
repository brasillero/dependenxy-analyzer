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

  // Layout recalculates only when the filtered graph changes (BDD scenario 3) —
  // keyed on graphData alone so hover restyling doesn't re-run the simulation.
  const positions = useMemo(() => {
    const allNodes = [...graphData.repoNodes, ...graphData.packageNodes];
    return computeLayout(
      allNodes.map((node) => ({ id: node.id, type: node.type })),
      graphData.edges.map((edge) => ({ source: edge.source, target: edge.target })),
    );
  }, [graphData]);

  const { nodes, edges } = useMemo(() => {
    const allNodes = [...graphData.repoNodes, ...graphData.packageNodes];

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
  }, [graphData, positions, hoveredPackageId]);

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
