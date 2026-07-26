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

  it('settles a shared package near the centroid of its linked repos', () => {
    const positions = computeLayout(nodes, links, WIDTH, HEIGHT);
    const repoA = positions.get('repo_a')!;
    const repoB = positions.get('repo_b')!;
    const shared = positions.get('pkg_shared')!;
    const centroid = { x: (repoA.x + repoB.x) / 2, y: (repoA.y + repoB.y) / 2 };
    const sharedToCentroid = Math.hypot(shared.x - centroid.x, shared.y - centroid.y);
    const unique = positions.get('pkg_unique')!;
    const uniqueToItsRepo = Math.hypot(unique.x - repoA.x, unique.y - repoA.y);
    // The shared package hugs the midpoint of its repos at least as tightly
    // as the unique one hugs its single repo.
    expect(sharedToCentroid).toBeLessThanOrEqual(uniqueToItsRepo + 1);
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

  it('keeps two package nodes on the same repo well separated (per-type collide radius)', () => {
    const typedNodes = [
      { id: 'repo_a', type: 'repo' as const },
      { id: 'pkg_1', type: 'package' as const },
      { id: 'pkg_2', type: 'package' as const },
    ];
    const typedLinks = [
      { source: 'repo_a', target: 'pkg_1' },
      { source: 'repo_a', target: 'pkg_2' },
    ];
    const positions = computeLayout(typedNodes, typedLinks, WIDTH, HEIGHT);
    const a = positions.get('pkg_1')!;
    const b = positions.get('pkg_2')!;
    // Observed: exactly 240px (120 + 120 radii fully satisfied); 200 leaves margin.
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(200);
  });

  it('keeps repos separated when only shared packages remain ("Only shared" mode)', () => {
    const onlySharedNodes = [
      { id: 'repo_a', type: 'repo' as const },
      { id: 'repo_b', type: 'repo' as const },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `pkg_${i}`, type: 'package' as const })),
    ];
    const onlySharedLinks = onlySharedNodes
      .filter((node) => node.type === 'package')
      .flatMap((pkg) => [
        { source: 'repo_a', target: pkg.id },
        { source: 'repo_b', target: pkg.id },
      ]);
    const positions = computeLayout(onlySharedNodes, onlySharedLinks, WIDTH, HEIGHT);
    const repoA = positions.get('repo_a')!;
    const repoB = positions.get('repo_b')!;
    // With the old uniform charge the repos collapsed onto each other (~180px,
    // exactly the two collide radii). The per-type charge must keep nuclei apart.
    expect(Math.hypot(repoA.x - repoB.x, repoA.y - repoB.y)).toBeGreaterThan(300);
  });

  it('is deterministic: same input yields identical positions', () => {
    const first = computeLayout(nodes, links, WIDTH, HEIGHT);
    const second = computeLayout(nodes, links, WIDTH, HEIGHT);
    expect(first).toEqual(second);
  });

  it('ignores links referencing unknown node ids instead of throwing', () => {
    const positions = computeLayout(
      [{ id: 'a' }, { id: 'b' }],
      [{ source: 'a', target: 'b' }, { source: 'a', target: 'ghost' }],
      WIDTH,
      HEIGHT,
    );
    expect(positions.size).toBe(2);
    for (const [, pos] of positions) {
      expect(Number.isFinite(pos.x)).toBe(true);
    }
  });
});
