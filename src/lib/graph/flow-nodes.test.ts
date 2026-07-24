import { describe, it, expect } from 'vitest';
import { buildFlowNodes } from './flow-nodes';
import { buildGraphData } from './graph-data';
import type { DependencyGroup, RepoConfig } from '@/lib/types';
import type { Node } from '@xyflow/react';

const repos: RepoConfig[] = [
  { id: 'r1', provider: 'github', host: 'github.com', path: 'acme/a', displayName: 'acme/a', defaultBranch: 'main' },
];

const groups: DependencyGroup[] = [
  {
    depName: 'react',
    versions: [
      {
        versionRange: '^18.2.0',
        depTypes: ['dependencies'],
        projects: [{ repoId: 'r1', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' }],
      },
    ],
  },
];

const graphData = buildGraphData(groups, repos);
const positions = new Map([
  ['repo_r1', { x: 0, y: 0 }],
  ['pkg_react', { x: 100, y: 100 }],
]);

function build(cache: Map<string, Node>, overrides: ReadonlyMap<string, { x: number; y: number }> = new Map()) {
  return buildFlowNodes(graphData, positions, overrides, null, cache);
}

describe('buildFlowNodes', () => {
  it('builds nodes with layout positions', () => {
    const nodes = build(new Map());
    expect(nodes.map((n) => n.id).sort()).toEqual(['pkg_react', 'repo_r1']);
    expect(nodes.find((n) => n.id === 'pkg_react')!.position).toEqual({ x: 100, y: 100 });
  });

  it('preserves object identity for unchanged nodes across rebuilds', () => {
    const cache = new Map<string, Node>();
    const first = build(cache);
    const second = build(cache, new Map([['pkg_react', { x: 150, y: 150 }]]));
    // the dragged node changed position → new object:
    expect(second.find((n) => n.id === 'pkg_react')).not.toBe(first.find((n) => n.id === 'pkg_react'));
    // the untouched node keeps its identity (React Flow keeps its measured state):
    expect(second.find((n) => n.id === 'repo_r1')).toBe(first.find((n) => n.id === 'repo_r1'));
  });

  it('creates a new object when highlight style changes', () => {
    const cache = new Map<string, Node>();
    const first = build(cache);
    const withHighlight = buildFlowNodes(
      graphData,
      positions,
      new Map(),
      { nodeIds: new Set(['repo_r1']), edgeIds: new Set() },
      cache,
    );
    expect(withHighlight.find((n) => n.id === 'pkg_react')).not.toBe(
      first.find((n) => n.id === 'pkg_react'),
    );
    expect(withHighlight.find((n) => n.id === 'pkg_react')!.style?.opacity).toBe(0.2);
    // highlighted node unchanged → identity preserved:
    expect(withHighlight.find((n) => n.id === 'repo_r1')).toBe(first.find((n) => n.id === 'repo_r1'));
  });
});
