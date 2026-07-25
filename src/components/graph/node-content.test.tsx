import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RepoNodeContent } from './repo-node';
import { PackageNodeContent } from './package-node';
import type { PackageNodeData } from '@/lib/graph/graph-data';

const packageData: PackageNodeData = {
  packageName: 'react',
  isShared: true,
  hasVersionDrift: true,
  versions: [
    {
      repoId: 'r1',
      repoName: 'acme/a',
      packagePath: 'package.json',
      packageName: 'a',
      repoColor: '#2563eb',
      branch: 'main',
      version: '^18.2.0',
      status: 'majority',
    },
    {
      repoId: 'r2',
      repoName: 'acme/b',
      packagePath: 'package.json',
      packageName: 'b',
      repoColor: '#d97706',
      branch: 'develop',
      version: '^17.0.2',
      status: 'divergent',
    },
  ],
};

describe('RepoNodeContent', () => {
  it('renders label and branch with the accent border color', () => {
    const { container } = render(
      <RepoNodeContent data={{ repoId: 'r1', label: 'acme/a', branch: 'main', color: '#2563eb' }} />,
    );
    expect(screen.getByText('acme/a')).toBeInTheDocument();
    expect(screen.getByText(/main/)).toBeInTheDocument();
    expect(container.firstChild).toHaveStyle({ borderColor: '#2563eb' });
  });
});

describe('PackageNodeContent', () => {
  it('shows an amber versions-count badge when drifted, without per-repo badges', () => {
    render(<PackageNodeContent data={packageData} />);
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('2 versions')).toBeInTheDocument();
    // no per-repo version badges on the canvas node:
    expect(screen.queryByText('^18.2.0')).not.toBeInTheDocument();
    expect(screen.queryByText('^17.0.2')).not.toBeInTheDocument();
    expect(screen.queryByText(/drift/i)).not.toBeInTheDocument();
  });

  it('shows the single version badge when converged', () => {
    const converged: PackageNodeData = {
      ...packageData,
      hasVersionDrift: false,
      versions: [packageData.versions[0]],
    };
    render(<PackageNodeContent data={converged} />);
    expect(screen.getByText('^18.2.0')).toBeInTheDocument();
    expect(screen.queryByText(/versions/)).not.toBeInTheDocument();
  });
});
