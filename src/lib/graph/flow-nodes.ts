import type { Node } from '@xyflow/react';
import type { GraphData } from './graph-data';
import type { HighlightSets } from './highlight';

const DIMMED_OPACITY = 0.2;

/**
 * Build React Flow node objects with identity preservation: a node whose
 * position, data reference and dimmed style did not change reuses the cached
 * object from the previous call. React Flow's `adoptUserNodes` keeps an
 * internal node's measured dimensions only when the user node is `===`-identical
 * — recreating every object on every rebuild (e.g. on each drag drop or
 * highlight toggle) resets all measurements and blanks the graph.
 * The caller owns the cache map and passes it on every call.
 */
export function buildFlowNodes(
  graphData: GraphData,
  positions: ReadonlyMap<string, { x: number; y: number }>,
  dragOverrides: ReadonlyMap<string, { x: number; y: number }>,
  highlight: HighlightSets | null,
  cache: Map<string, Node>,
): Node[] {
  const next = new Map<string, Node>();
  const nodes = [...graphData.repoNodes, ...graphData.packageNodes].map((node) => {
    const position = dragOverrides.get(node.id) ?? positions.get(node.id) ?? { x: 0, y: 0 };
    const style =
      highlight && !highlight.nodeIds.has(node.id) ? { opacity: DIMMED_OPACITY } : undefined;

    const cached = cache.get(node.id);
    if (
      cached &&
      cached.type === node.type &&
      cached.position.x === position.x &&
      cached.position.y === position.y &&
      cached.data === node.data &&
      cached.style?.opacity === style?.opacity
    ) {
      next.set(node.id, cached);
      return cached;
    }

    const fresh: Node = { id: node.id, type: node.type, position, data: node.data, style };
    next.set(node.id, fresh);
    return fresh;
  });

  cache.clear();
  for (const [id, node] of next) {
    cache.set(id, node);
  }
  return nodes;
}
