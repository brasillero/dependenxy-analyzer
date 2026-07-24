import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisView } from './analysis-view';
import { useViewStore } from '@/stores/view-store';
import type { DependencyGroup } from '@/lib/types';

const uniqueDep: DependencyGroup = {
  depName: 'unique-dep',
  versions: [
    {
      versionRange: '^1.0.0',
      depTypes: ['dependencies'],
      projects: [
        { repoId: 'a', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
      ],
    },
  ],
};

const sharedDep: DependencyGroup = {
  depName: 'shared-dep',
  versions: [
    {
      versionRange: '^2.0.0',
      depTypes: ['dependencies'],
      projects: [
        { repoId: 'a', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
        { repoId: 'b', repoName: 'acme/b', packagePath: 'package.json', packageName: 'b' },
      ],
    },
  ],
};

const driftedDep: DependencyGroup = {
  depName: 'drifted-dep',
  versions: [
    {
      versionRange: '^3.0.0',
      depTypes: ['dependencies'],
      projects: [
        { repoId: 'a', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
        { repoId: 'b', repoName: 'acme/b', packagePath: 'package.json', packageName: 'b' },
      ],
    },
    {
      versionRange: '^2.5.0',
      depTypes: ['dependencies'],
      projects: [
        { repoId: 'c', repoName: 'acme/c', packagePath: 'package.json', packageName: 'c' },
      ],
    },
  ],
};

describe('AnalysisView', () => {
  beforeEach(() => {
    useViewStore.setState({
      view: 'analysis',
      analysis: [uniqueDep, sharedDep, driftedDep],
      analysisFailed: [],
      analysisTotalFailed: false,
    });
  });

  it('shows all dependency groups by default', () => {
    render(<AnalysisView />);
    expect(screen.getByText('unique-dep')).toBeInTheDocument();
    expect(screen.getByText('shared-dep')).toBeInTheDocument();
    expect(screen.getByText('drifted-dep')).toBeInTheDocument();
  });

  it('hides unique dependencies when "Hide unique" is checked', async () => {
    const user = userEvent.setup();
    render(<AnalysisView />);
    await user.click(screen.getByLabelText('Hide unique'));
    expect(screen.queryByText('unique-dep')).not.toBeInTheDocument();
    expect(screen.getByText('shared-dep')).toBeInTheDocument();
    expect(screen.getByText('drifted-dep')).toBeInTheDocument();
  });

  it('hides shared dependencies when "Hide shared" is checked', async () => {
    const user = userEvent.setup();
    render(<AnalysisView />);
    await user.click(screen.getByLabelText('Hide shared'));
    expect(screen.getByText('unique-dep')).toBeInTheDocument();
    expect(screen.queryByText('shared-dep')).not.toBeInTheDocument();
    expect(screen.queryByText('drifted-dep')).not.toBeInTheDocument();
  });

  it('hides everything when both toggles are checked', async () => {
    const user = userEvent.setup();
    render(<AnalysisView />);
    await user.click(screen.getByLabelText('Hide unique'));
    await user.click(screen.getByLabelText('Hide shared'));
    expect(screen.queryByText('unique-dep')).not.toBeInTheDocument();
    expect(screen.queryByText('shared-dep')).not.toBeInTheDocument();
    expect(screen.queryByText('drifted-dep')).not.toBeInTheDocument();
    expect(
      screen.getByText('All dependencies are hidden by the current filters.')
    ).toBeInTheDocument();
  });

  it('composes the toggles with the search filter', async () => {
    const user = userEvent.setup();
    render(<AnalysisView />);
    await user.click(screen.getByLabelText('Hide shared'));
    await user.type(screen.getByLabelText('Search dependency'), 'drift');
    // drifted-dep matches the search term but is shared, so it stays hidden.
    expect(screen.queryByText('drifted-dep')).not.toBeInTheDocument();
    expect(screen.getByText('No dependencies match your search.')).toBeInTheDocument();
  });
});
