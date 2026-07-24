import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalysisView } from './analysis-view';
import { useViewStore } from '@/stores/view-store';
import { useRepoStore } from '@/stores/repo-store';
import type { DependencyGroup, RepoConfig } from '@/lib/types';

vi.mock('@/components/graph/dependency-graph', () => ({
  DependencyGraph: ({ groups, repos }: { groups: DependencyGroup[]; repos: RepoConfig[] }) => (
    <div data-testid="graph" data-groups={groups.length} data-repos={repos.map((r) => r.id).join(',')} />
  ),
}));

const group: DependencyGroup = {
  depName: 'react',
  versions: [
    {
      versionRange: '^18.2.0',
      depTypes: ['dependencies'],
      projects: [
        { repoId: 'r1', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
        { repoId: 'r2', repoName: 'acme/b', packagePath: 'package.json', packageName: 'b' },
      ],
    },
  ],
};

function repo(id: string, displayName: string): RepoConfig {
  return {
    id,
    provider: 'github',
    host: 'github.com',
    path: displayName,
    displayName,
    defaultBranch: 'main',
  };
}

beforeEach(() => {
  localStorage.clear();
  useViewStore.setState({
    view: 'analysis',
    analysis: [group],
    analysisFailed: [],
    analysisTotalFailed: false,
  });
  useRepoStore.setState({
    repos: [repo('r1', 'acme/a'), repo('r2', 'acme/b')],
    selectedRepoId: null,
  });
});

describe('AnalysisView', () => {
  it('renders the graph with analyzed repos and the counts header', () => {
    render(<AnalysisView />);
    expect(screen.getByText(/1 dependency across 2 projects/)).toBeInTheDocument();
    const graph = screen.getByTestId('graph');
    expect(graph.dataset.groups).toBe('1');
    expect(graph.dataset.repos).toBe('r1,r2');
  });

  it('excludes failed repos from the graph and shows the banner', () => {
    useViewStore.setState({
      view: 'analysis',
      analysis: [group],
      analysisFailed: [{ repoName: 'acme/b', error: 'boom' }],
      analysisTotalFailed: false,
    });
    render(<AnalysisView />);
    expect(screen.getByText(/Partial analysis/)).toBeInTheDocument();
    expect(screen.getByTestId('graph').dataset.repos).toBe('r1');
  });

  it('shows the nothing-to-graph message when the analysis is empty', () => {
    useViewStore.setState({
      view: 'analysis',
      analysis: [],
      analysisFailed: [],
      analysisTotalFailed: false,
    });
    render(<AnalysisView />);
    expect(screen.getByText(/Nothing to graph/)).toBeInTheDocument();
    expect(screen.queryByTestId('graph')).not.toBeInTheDocument();
  });
});
