'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
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
import { executeAnalysis } from '@/lib/execute-analysis';
import { useHasCredentials } from '@/stores/token-store';
import type { DependencyGroup } from '@/lib/types';
import { useRepoStore } from '@/stores/repo-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useViewStore } from '@/stores/view-store';
import { SidePanel } from '@/components/panels/side-panel';
import { OnboardingCard } from '@/components/onboarding-card';
import { RefreshButton } from '@/components/panels/utility-panel';
import { AnalysisBanner } from '@/components/analysis-banner';
import { PackageDetailsDrawer } from './package-details-drawer';
import { PackageNode } from './package-node';
import { RepoDetailsDrawer } from './repo-details-drawer';
import { RepoNode } from './repo-node';

const nodeTypes = { repo: RepoNode, package: PackageNode };

const DIMMED_OPACITY = 0.25;

/** Re-fits the viewport whenever the analysis or a forced re-layout lands. */
function FitOnDataChange() {
  const { fitView } = useReactFlow();
  const analysis = useViewStore((s) => s.analysis);
  const layoutVersion = useViewStore((s) => s.layoutVersion);
  useEffect(() => {
    if (!analysis) return;
    const timer = setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
    return () => clearTimeout(timer);
  }, [analysis, layoutVersion, fitView]);
  return null;
}

/** Re-fits the viewport onto the selection and its connected nodes when the setting is on. */
function FitOnSelection({ nodeIds }: { nodeIds: ReadonlySet<string> | null }) {
  const { fitView } = useReactFlow();
  const autoFitSelection = useSettingsStore((s) => s.autoFitSelection);
  useEffect(() => {
    if (!autoFitSelection || !nodeIds || nodeIds.size === 0) return;
    const nodes = [...nodeIds].map((id) => ({ id }));
    const timer = setTimeout(
      () => fitView({ nodes, padding: 0.4, duration: 300, maxZoom: 1.5 }),
      50,
    );
    return () => clearTimeout(timer);
  }, [nodeIds, autoFitSelection, fitView]);
  return null;
}

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
  const hasCredentials = useHasCredentials();
  const queryClient = useQueryClient();

  const [sharedOnly, setSharedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedPackage, setSelectedPackage] = useState<PackageNodeData | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<RepoNodeData | null>(null);

  const analyzedRepos = useMemo(() => repos, [repos]);

  // Analysis is automatic: it (re)runs whenever the repo list or credentials
  // change. The button in the utility panel is only a manual refresh.
  useEffect(() => {
    if (repos.length === 0 || !hasCredentials) return;
    void executeAnalysis(repos, queryClient);
  }, [repos, hasCredentials, queryClient]);

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

  // Derived "base" nodes from layout + data + highlight. Stable during a
  // drag (none of these inputs change mid-gesture). Openable nodes (repos and
  // shared packages) get an onOpenDetails handler for their link-styled name.
  const baseNodes: Node[] = useMemo(
    () =>
      [...graphData.repoNodes, ...graphData.packageNodes].map((node) => {
        const isHighlighted = !highlight || highlight.nodeIds.has(node.id);
        // Unique packages linked to a selected repo pick up that repo's
        // accent color on their border (their single version entry carries it).
        const accentColor =
          node.type === 'package' &&
          !(node.data as PackageNodeData).isShared &&
          highlight &&
          isHighlighted
            ? (node.data as PackageNodeData).versions[0]?.repoColor
            : undefined;
        return {
          id: node.id,
          type: node.type,
          position: positions.get(node.id) ?? { x: 0, y: 0 },
          data:
            node.type === 'repo'
              ? { ...node.data, onOpenDetails: () => setSelectedRepo(node.data as RepoNodeData) }
              : (node.data as PackageNodeData).isShared
                ? { ...node.data, onOpenDetails: () => setSelectedPackage(node.data as PackageNodeData) }
                : { ...node.data, accentColor },
          style: isHighlighted ? undefined : { opacity: DIMMED_OPACITY },
        };
      }),
    [graphData, positions, highlight],
  );

  // Canonical controlled pattern: node state owned by useNodesState, changes
  // (including drags) applied via applyNodeChanges, which recreates only the
  // affected node objects per frame — every other node keeps its identity and
  // measured state, so live dragging doesn't blank or flicker the canvas.
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);

  // Re-sync from the derived nodes only when the inputs change (new analysis,
  // filter toggle, highlight change) — preserving dragged positions and
  // selection of surviving nodes. Render-time adjustment (no effect needed).
  // A layoutVersion bump (manual refresh) instead resets everything to the
  // freshly computed layout, dropping dragged positions.
  const layoutVersion = useViewStore((s) => s.layoutVersion);
  const [prevLayoutVersion, setPrevLayoutVersion] = useState(layoutVersion);
  const [prevBaseNodes, setPrevBaseNodes] = useState(baseNodes);
  if (prevLayoutVersion !== layoutVersion) {
    setPrevLayoutVersion(layoutVersion);
    setPrevBaseNodes(baseNodes);
    setNodes(baseNodes);
  } else if (prevBaseNodes !== baseNodes) {
    setPrevBaseNodes(baseNodes);
    setNodes((current) => {
      const positionsById = new Map(current.map((node) => [node.id, node.position]));
      const selectedById = new Set(current.filter((node) => node.selected).map((node) => node.id));
      return baseNodes.map((node) => {
        const position = positionsById.get(node.id);
        if (!position) return node;
        return { ...node, position, selected: selectedById.has(node.id) };
      });
    });
  }

  // Selection is driven by React Flow's native model: the library emits
  // select changes (click, shift-click, selection box, pane click, Escape)
  // and we mirror them into state — multi-select stays native behavior.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
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
      onNodesChangeBase(changes);
    },
    [onNodesChangeBase],
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

  const handlePanelSelect = useCallback(
    (nodeId: string | null) => {
      setSelectedIds(nodeId ? new Set([nodeId]) : new Set());
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          selected: nodeId === null ? false : node.id === nodeId,
        })),
      );
    },
    [setNodes],
  );

  const listSelectedNodeId = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const [only] = selectedIds;
    return only.startsWith('repo_') ? only : null;
  }, [selectedIds]);

  // Double-click opens the detail sheet. Unique (non-shared) packages have no
  // sheet — there's nothing more to show than the single declaration.
  const handleNodeDoubleClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === 'repo') {
      setSelectedRepo(node.data as RepoNodeData);
    } else if (node.type === 'package' && (node.data as PackageNodeData).isShared) {
      setSelectedPackage(node.data as PackageNodeData);
    }
  }, []);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        key={analysis ? 'analysis' : 'idle'}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        onNodesChange={onNodesChange}
        onNodeDoubleClick={handleNodeDoubleClick}
      >
        <Background />
        <Controls />
        <FitOnDataChange />
        <FitOnSelection nodeIds={highlight ? highlight.nodeIds : null} />
        <Panel position="top-right">
          <div className="flex w-64 flex-col gap-2">
            <RefreshButton />
            <SidePanel
              selectedNodeId={listSelectedNodeId}
              onSelect={handlePanelSelect}
              sharedOnly={sharedOnly}
              onSharedOnlyChange={setSharedOnly}
            />
          </div>
        </Panel>
        <AnalysisBanner />
      </ReactFlow>
      {!analysis && (
        <div className="absolute inset-0 flex items-center justify-center">
          <OnboardingCard />
        </div>
      )}
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
