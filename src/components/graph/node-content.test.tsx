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
  it('renders the package name and one version badge per repo, colored by repo', () => {
    render(<PackageNodeContent data={packageData} />);
    expect(screen.getByText('react')).toBeInTheDocument();
    const v18 = screen.getByText('^18.2.0');
    const v17 = screen.getByText('^17.0.2');
    expect(v18).toHaveStyle({ color: '#2563eb' });
    expect(v17).toHaveStyle({ color: '#d97706' });
  });

  it('shows the drift indicator only when drifted', () => {
    const { rerender } = render(<PackageNodeContent data={packageData} />);
    expect(screen.getByText(/drift/i)).toBeInTheDocument();
    rerender(<PackageNodeContent data={{ ...packageData, hasVersionDrift: false }} />);
    expect(screen.queryByText(/drift/i)).not.toBeInTheDocument();
  });
});
