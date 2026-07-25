'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  buildGraphData,
  filterSharedOnly,
  type PackageNodeData,
  type RepoNodeData,
} from '@/lib/graph/graph-data';
import { computeHighlight } from '@/lib/graph/highlight';
import { computeLayout } from '@/lib/graph/layout';
import type { DependencyGroup } from '@/lib/types';
import { useRepoStore } from '@/stores/repo-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useViewStore } from '@/stores/view-store';
import { RepoListPanel } from '@/components/panels/repo-list-panel';
import { UtilityPanel } from '@/components/panels/utility-panel';
import { AnalysisBanner } from '@/components/analysis-banner';
import { PackageDetailsDrawer } from './package-details-drawer';
import { PackageNode } from './package-node';
import { RepoDetailsDrawer } from './repo-details-drawer';
import { RepoNode } from './repo-node';

const nodeTypes = { repo: RepoNode, package: PackageNode };

const DIMMED_OPACITY = 0.5;

/** Drop version entries whose dep types are all disabled by the header toggles. */
function filterGroupsByDepTypes(
  groups: DependencyGroup[],
  enabled: Record<DependencyGroup['versions'][number]['depTypes'][number], boolean>,
): DependencyGroup[] {
  return groups
    .map((group) => ({
      ...group,
      versions: group.versions.filter((version) => version.depTypes.some((t) => enabled[t])),
    }))
    .filter((group) => group.versions.length > 0);
}

export function DependencyGraph() {
  const analysis = useViewStore((s) => s.analysis);
  const repos = useRepoStore((s) => s.repos);
  const enabledDepTypes = useSettingsStore((s) => s.enabledDepTypes);

  const [sharedOnly, setSharedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedPackage, setSelectedPackage] = useState<PackageNodeData | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoNodeData | null>(null);

  const analyzedRepos = useMemo(() => repos, [repos]);

  const graphData = useMemo(() => {
    if (!analysis) return buildGraphData([], []);
    const filtered = filterGroupsByDepTypes(analysis, enabledDepTypes);
    const full = buildGraphData(filtered, analyzedRepos);
    return sharedOnly ? filterSharedOnly(full) : full;
  }, [analysis, analyzedRepos, enabledDepTypes, sharedOnly]);

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
    () => computeHighlight(graphData, [...selectedIds]),
    [graphData, selectedIds],
  );

  // Selection is driven by React Flow's native model: the library emits
  // select changes (click, shift-click, selection box, pane click, Escape)
  // and we mirror them into state — multi-select stays native behavior.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setSelectedIds((prev) => {
      let next: Set<string> | null = null;
      for (const change of changes) {
        if (change.type === 'select') {
          next ??= new Set(prev);
          if (change.selected) {
            next.add(change.id);
          } else {
            next.delete(change.id);
          }
        }
      }
      return next ?? prev;
    });
  }, []);

  const nodes: Node[] = useMemo(
    () =>
      [...graphData.repoNodes, ...graphData.packageNodes].map((node) => ({
        id: node.id,
        type: node.type,
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        selected: selectedIds.has(node.id),
        data:
          node.type === 'repo'
            ? { ...node.data, onOpenDetails: () => setSelectedRepo(node.data as RepoNodeData) }
            : { ...node.data, onOpenDetails: () => setSelectedPackage(node.data as PackageNodeData) },
        style: highlight && !highlight.nodeIds.has(node.id) ? { opacity: DIMMED_OPACITY } : undefined,
      })),
    [graphData, positions, selectedIds, highlight],
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

  const handlePanelSelect = useCallback((nodeId: string | null) => {
    setSelectedIds(nodeId ? new Set([nodeId]) : new Set());
  }, []);

  const listSelectedNodeId = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const [only] = selectedIds;
    return only.startsWith('repo_') ? only : null;
  }, [selectedIds]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        key={analysis ? 'analysis' : 'idle'}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        onNodesChange={onNodesChange}
      >
        <Background />
        <Controls />
        <Panel position="top-right">
          <RepoListPanel selectedNodeId={listSelectedNodeId} onSelect={handlePanelSelect} />
        </Panel>
        <Panel position="bottom-center">
          <UtilityPanel sharedOnly={sharedOnly} onSharedOnlyChange={setSharedOnly} />
        </Panel>
        {!analysis && (
          <Panel position="top-center" className="mt-24">
            <div className="max-w-sm rounded-md border bg-card p-4 text-center text-sm text-muted-foreground shadow-sm">
              <p className="font-medium text-foreground">No analysis yet</p>
              <p className="mt-1">
                Add your access tokens, register repositories, then click{' '}
                <span className="font-medium">Analyze</span> to explore dependencies on this canvas.
              </p>
            </div>
          </Panel>
        )}
        <AnalysisBanner />
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
