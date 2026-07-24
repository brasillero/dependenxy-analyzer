import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';

export interface LayoutNode {
  id: string;
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
 */
export function computeLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  width = 1200,
  height = 800,
): Map<string, { x: number; y: number }> {
  // Deterministic-ish initial scatter around the center so results are stable.
  const simNodes: SimNode[] = nodes.map((node, index) => ({
    id: node.id,
    x: width / 2 + ((index * 37) % 200) - 100,
    y: height / 2 + ((index * 53) % 200) - 100,
  }));
  const simLinks = links.map((link) => ({ ...link }));

  const simulation = forceSimulation(simNodes)
    .force('charge', forceManyBody().strength(-500))
    .force('center', forceCenter(width / 2, height / 2))
    .force(
      'link',
      forceLink<SimNode, { source: string; target: string }>(simLinks)
        .id((node) => node.id)
        .distance(180),
    )
    .force('collide', forceCollide(70))
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i += 1) {
    simulation.tick();
  }

  return new Map(simNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
}
