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
