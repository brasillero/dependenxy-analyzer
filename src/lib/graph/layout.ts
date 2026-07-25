export interface LayoutNode {
  id: string;
  type?: 'repo' | 'package';
}

export interface LayoutLink {
  source: string;
  target: string;
}

interface SimNode {
  id: string;
  type?: 'repo' | 'package';
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const TICKS = 300;
const LINK_DISTANCE = 180;
const REPULSION = 90_000;
const CENTER_GRAVITY = 0.015;
const SPRING = 0.02;
const DAMPING = 0.85;
const MAX_STEP = 12;

function radiusOf(type?: 'repo' | 'package'): number {
  return type === 'repo' ? 90 : 120;
}

/**
 * In-house force-directed layout: many-body repulsion + link springs +
 * center gravity + per-type collision radii. Shared packages accumulate
 * links from multiple repos and are pulled toward the middle; unique ones
 * dangle near their repo. Runs synchronously and deterministically (no RNG)
 * and returns positions keyed by node id. Links referencing unknown nodes
 * are ignored.
 */
export function computeLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  width = 1200,
  height = 800,
): Map<string, { x: number; y: number }> {
  const cx = width / 2;
  const cy = height / 2;

  // Deterministic initial scatter around the center.
  const simNodes: SimNode[] = nodes.map((node, index) => ({
    id: node.id,
    type: node.type,
    x: cx + ((index * 37) % 200) - 100,
    y: cy + ((index * 53) % 200) - 100,
    vx: 0,
    vy: 0,
  }));
  if (simNodes.length === 0) return new Map();

  const byId = new Map(simNodes.map((node) => [node.id, node]));
  const simLinks = links.filter((link) => byId.has(link.source) && byId.has(link.target));

  for (let tick = 0; tick < TICKS; tick += 1) {
    // Many-body repulsion (every pair).
    for (let i = 0; i < simNodes.length; i += 1) {
      for (let j = i + 1; j < simNodes.length; j += 1) {
        const a = simNodes[i];
        const b = simNodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          dx = (i % 2 === 0 ? 1 : -1) * 0.5;
          dy = (j % 2 === 0 ? 1 : -1) * 0.5;
          distSq = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;

        // Collision: push apart when radii overlap.
        const minDist = radiusOf(a.type) + radiusOf(b.type);
        if (dist < minDist && dist > 0) {
          const push = ((minDist - dist) / dist) * 0.5;
          const px = dx * push;
          const py = dy * push;
          a.vx -= px;
          a.vy -= py;
          b.vx += px;
          b.vy += py;
        }
      }
    }

    // Link springs toward LINK_DISTANCE.
    for (const link of simLinks) {
      const source = byId.get(link.source)!;
      const target = byId.get(link.target)!;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.hypot(dx, dy) || 1;
      const force = (dist - LINK_DISTANCE) * SPRING;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    // Center gravity + integration with damping and step clamping.
    for (const node of simNodes) {
      node.vx += (cx - node.x) * CENTER_GRAVITY;
      node.vy += (cy - node.y) * CENTER_GRAVITY;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      const stepX = Math.max(-MAX_STEP, Math.min(MAX_STEP, node.vx));
      const stepY = Math.max(-MAX_STEP, Math.min(MAX_STEP, node.vy));
      node.x += stepX;
      node.y += stepY;
    }
  }

  return new Map(simNodes.map((node) => [node.id, { x: node.x, y: node.y }]));
}
