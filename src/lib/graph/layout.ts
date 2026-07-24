import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';

export interface LayoutNode {
  id: string;
  /** Drives the collide radius: repo cards are ~150px wide, package pills up to ~224px. */
  type?: 'repo' | 'package';
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
 * Pre-computed force-directed layout: many-body repulsion + center gravity +
 * link attraction. Shared packages accumulate links from multiple repos and
 * are pulled toward the middle; unique ones dangle near their repo. Runs
 * synchronously to completion (no animation loop) and returns positions keyed
 * by node id.
 *
 * Links whose source or target is not present in `nodes` are ignored —
 * forceLink would otherwise throw "node not found". (buildGraphData already
 * guarantees all edge endpoints exist; the filter keeps this function total.)
 */
export function computeLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  width = 1200,
  height = 800,
): Map<string, { x: number; y: number }> {
  // Deterministic initial scatter around the center so results are stable.
  const simNodes: SimNode[] = nodes.map((node, index) => ({
    id: node.id,
    type: node.type,
    x: width / 2 + ((index * 37) % 200) - 100,
    y: height / 2 + ((index * 53) % 200) - 100,
  }));
  const nodeIds = new Set(simNodes.map((node) => node.id));
  const simLinks = links
    .filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target))
    .map((link) => ({ ...link }));

  const simulation = forceSimulation(simNodes)
    .force('charge', forceManyBody().strength(-500))
    .force('center', forceCenter(width / 2, height / 2))
    .force(
      'link',
      forceLink<SimNode, { source: string; target: string }>(simLinks)
        .id((node) => node.id)
        .distance(180),
    )
    .force('collide', forceCollide<SimNode>((node) => (node.type === 'repo' ? 90 : 120)))
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i += 1) {
    simulation.tick();
  }

  return new Map(simNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
}
