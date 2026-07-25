import type { GraphData } from './graph-data';

export interface HighlightSets {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/**
 * Selection highlight driven by React Flow's native selection: every selected
 * node plus its direct neighbors and the connecting edges; the caller dims
 * everything not in these sets. Returns null when nothing valid is selected
 * (nothing dimmed). Multiple selected nodes union their neighborhoods.
 */
export function computeHighlight(
  data: GraphData,
  selectedNodeIds: readonly string[],
): HighlightSets | null {
  const knownIds = new Set([
    ...data.repoNodes.map((node) => node.id),
    ...data.packageNodes.map((node) => node.id),
  ]);
  const valid = selectedNodeIds.filter((id) => knownIds.has(id));
  if (valid.length === 0) return null;

  const nodeIds = new Set<string>(valid);
  const edgeIds = new Set<string>();
  const selected = new Set(valid);
  for (const edge of data.edges) {
    if (selected.has(edge.source) || selected.has(edge.target)) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
    }
  }
  return { nodeIds, edgeIds };
}
