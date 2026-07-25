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
const LINK_DISTANCE = 160;
const REPULSION = 60_000;
const CENTROID_GRAVITY = 0.06;
const REPO_CENTER_GRAVITY = 0.004;
const SPRING = 0.015;
const DAMPING = 0.85;
const MAX_STEP = 12;

function radiusOf(type?: 'repo' | 'package'): number {
  return type === 'repo' ? 90 : 120;
}

/**
 * In-house force-directed layout with neighbor-centroid clustering:
 * - repos repel each other (clusters separate) with a mild pull to the
 *   canvas center so the whole graph stays framed;
 * - packages are pulled toward the centroid of their linked repos, so a
 *   shared package settles BETWEEN the repos that use it and a unique one
 *   hugs its repo — instead of everything collapsing to the canvas center.
 * Runs synchronously and deterministically (no RNG); links referencing
 * unknown nodes are ignored.
 */
export function computeLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  width = 1200,
  height = 800,
): Map<string, { x: number; y: number }> {
  const cx = width / 2;
  const cy = height / 2;

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

  // Neighbors of each node (packages care about their repos; repos about theirs).
  const neighbors = new Map<string, SimNode[]>();
  for (const link of simLinks) {
    const source = byId.get(link.source)!;
    const target = byId.get(link.target)!;
    (neighbors.get(target.id) ?? neighbors.set(target.id, []).get(target.id)!).push(source);
    (neighbors.get(source.id) ?? neighbors.set(source.id, []).get(source.id)!).push(target);
  }

  for (let tick = 0; tick < TICKS; tick += 1) {
    // Many-body repulsion (every pair) + collision radii.
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

    for (const node of simNodes) {
      if (node.type === 'package') {
        // Pull toward the centroid of linked repos — shared packages land
        // between their repos, unique ones next to theirs.
        const linked = neighbors.get(node.id) ?? [];
        if (linked.length > 0) {
          const tx = linked.reduce((sum, n) => sum + n.x, 0) / linked.length;
          const ty = linked.reduce((sum, n) => sum + n.y, 0) / linked.length;
          node.vx += (tx - node.x) * CENTROID_GRAVITY;
          node.vy += (ty - node.y) * CENTROID_GRAVITY;
        }
      } else {
        // Repos only get a mild pull to the canvas center to keep the frame.
        node.vx += (cx - node.x) * REPO_CENTER_GRAVITY;
        node.vy += (cy - node.y) * REPO_CENTER_GRAVITY;
      }

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
