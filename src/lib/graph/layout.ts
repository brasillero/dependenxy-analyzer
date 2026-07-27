import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';

export interface LayoutNode {
  id: string;
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
 * Force-directed layout using d3-force (the React Flow docs' default approach
 * for non-tree graphs): many-body repulsion keeps nodes apart, link springs
 * keep each package orbiting its repo, and shared packages — pulled by every
 * repo that uses them — settle in the intersection between those repos.
 * Deterministic given input order (fixed initial scatter, no RNG).
 * Links referencing unknown nodes are ignored.
 */
export function computeLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  width = 1200,
  height = 800,
): Map<string, { x: number; y: number }> {
  const simNodes: SimNode[] = nodes.map((node, index) => ({
    id: node.id,
    type: node.type,
    x: width / 2 + ((index * 37) % 200) - 100,
    y: height / 2 + ((index * 53) % 200) - 100,
  }));
  const knownIds = new Set(nodes.map((node) => node.id));
  const simLinks = links
    .filter((link) => knownIds.has(link.source) && knownIds.has(link.target))
    .map((link) => ({ ...link }));

  const simulation = forceSimulation(simNodes)
    // Per-type charge: repos repel hard so nuclei never clump (critical when
    // 'Only shared' removes the unique packages that otherwise push repos
    // apart); packages repel gently so they keep orbiting their repo.
    .force(
      'charge',
      forceManyBody<SimNode>().strength((node) => (node.type === 'repo' ? -1500 : -300)),
    )
    .force('center', forceCenter(width / 2, height / 2))
    .force(
      'link',
      forceLink<SimNode, { source: string; target: string }>(simLinks)
        .id((node) => node.id)
        .distance(120),
    )
    .force('collide', forceCollide<SimNode>((node) => (node.type === 'repo' ? 120 : 100)))
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i += 1) {
    simulation.tick();
  }

  return new Map(simNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
}
