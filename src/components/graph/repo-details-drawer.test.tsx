import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RepoDetailsDrawer } from './repo-details-drawer';
import { buildGraphData, type RepoNodeData } from '@/lib/graph/graph-data';
import type { DependencyGroup, RepoConfig } from '@/lib/types';

const repos: RepoConfig[] = [
  { id: 'r1', provider: 'github', host: 'github.com', path: 'acme/a', displayName: 'acme/a', defaultBranch: 'main' },
  { id: 'r2', provider: 'github', host: 'github.com', path: 'acme/b', displayName: 'acme/b', defaultBranch: 'main', selectedBranch: 'develop' },
];

const groups: DependencyGroup[] = [
  {
    depName: 'react',
    versions: [
      { versionRange: '^18.2.0', depTypes: ['dependencies'], projects: [
        { repoId: 'r1', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
        { repoId: 'r2', repoName: 'acme/b', packagePath: 'package.json', packageName: 'b' },
      ] },
      { versionRange: '^17.0.2', depTypes: ['dependencies'], projects: [
        { repoId: 'r2', repoName: 'acme/b', packagePath: 'packages/legacy/package.json', packageName: 'legacy' },
      ] },
    ],
  },
];

const graphData = buildGraphData(groups, repos);
const repoData: RepoNodeData = graphData.repoNodes[1].data; // acme/b

describe('RepoDetailsDrawer', () => {
  it('lists the repo\'s declarations with count, versions, paths and drift badges', () => {
    render(<RepoDetailsDrawer graphData={graphData} repo={repoData} onClose={() => {}} />);
    expect(screen.getByText('acme/b')).toBeInTheDocument();
    expect(screen.getByText('2 packages')).toBeInTheDocument();
    expect(screen.getByText(/develop/)).toBeInTheDocument();
    expect(screen.getByText('^18.2.0')).toBeInTheDocument();
    expect(screen.getByText('^17.0.2')).toBeInTheDocument();
    expect(screen.getByText('packages/legacy/package.json')).toBeInTheDocument();
    expect(screen.getAllByText('drift')).toHaveLength(2);
  });

  it('renders nothing when repo is null', () => {
    render(<RepoDetailsDrawer graphData={graphData} repo={null} onClose={() => {}} />);
    expect(screen.queryByText('acme/b')).not.toBeInTheDocument();
  });
});
