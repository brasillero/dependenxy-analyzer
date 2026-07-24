import { describe, it, expect } from 'vitest';
import { computeLayout } from './layout';

const WIDTH = 1200;
const HEIGHT = 800;

describe('computeLayout', () => {
  const nodes = [
    { id: 'repo_a' },
    { id: 'repo_b' },
    { id: 'pkg_shared' },
    { id: 'pkg_unique' },
  ];
  const links = [
    { source: 'repo_a', target: 'pkg_shared' },
    { source: 'repo_b', target: 'pkg_shared' },
    { source: 'repo_a', target: 'pkg_unique' },
  ];

  it('assigns a finite position to every node', () => {
    const positions = computeLayout(nodes, links, WIDTH, HEIGHT);
    expect(positions.size).toBe(4);
    for (const [, pos] of positions) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it('pulls shared packages closer to the center than unique ones', () => {
    const positions = computeLayout(nodes, links, WIDTH, HEIGHT);
    const center = { x: WIDTH / 2, y: HEIGHT / 2 };
    const dist = (id: string) => {
      const pos = positions.get(id)!;
      return Math.hypot(pos.x - center.x, pos.y - center.y);
    };
    expect(dist('pkg_shared')).toBeLessThan(dist('pkg_unique'));
  });

  it('handles an empty graph', () => {
    expect(computeLayout([], [], WIDTH, HEIGHT).size).toBe(0);
  });

  it('handles isolated nodes (no links)', () => {
    const positions = computeLayout([{ id: 'a' }, { id: 'b' }], [], WIDTH, HEIGHT);
    expect(positions.size).toBe(2);
    for (const [, pos] of positions) {
      expect(Number.isFinite(pos.x)).toBe(true);
    }
  });
});
