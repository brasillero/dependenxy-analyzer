import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PackageDetailsDrawer } from './package-details-drawer';
import type { PackageNodeData } from '@/lib/graph/graph-data';

const drifted: PackageNodeData = {
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

describe('PackageDetailsDrawer', () => {
  it('renders a row per project with short repo name, branch badge and version — no status column', () => {
    render(<PackageDetailsDrawer packageData={drifted} onClose={() => {}} />);
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('a / a')).toBeInTheDocument();
    expect(screen.getByText('b / b')).toBeInTheDocument();
    expect(screen.getByText('develop')).toBeInTheDocument();
    expect(screen.getByText('^17.0.2')).toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('most common')).not.toBeInTheDocument();
    expect(screen.queryByText('divergent')).not.toBeInTheDocument();
  });

  it('shows the count of distinct versions in the header', () => {
    render(<PackageDetailsDrawer packageData={drifted} onClose={() => {}} />);
    expect(screen.getByText('2 versions')).toBeInTheDocument();
  });

  it('shows the aligned description when there is no drift', () => {
    const aligned: PackageNodeData = {
      ...drifted,
      hasVersionDrift: false,
      versions: [{ ...drifted.versions[0], status: 'aligned' }],
    };
    render(<PackageDetailsDrawer packageData={aligned} onClose={() => {}} />);
    expect(screen.getByText(/same version range/i)).toBeInTheDocument();
    expect(screen.getByText('1 version')).toBeInTheDocument();
  });
});
