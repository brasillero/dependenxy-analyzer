import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DependencyGroupCard } from './dependency-group-card';
import type { DependencyGroup } from '@/lib/types';

const drifted: DependencyGroup = {
  depName: 'react',
  versions: [
    {
      versionRange: '^18.2.0',
      depTypes: ['dependencies'],
      projects: [
        { repoId: 'a', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
        { repoId: 'b', repoName: 'acme/b', packagePath: 'package.json', packageName: 'b' },
        { repoId: 'c', repoName: 'acme/c', packagePath: 'package.json', packageName: 'c' },
      ],
    },
    {
      versionRange: '^17.0.2',
      depTypes: ['dependencies'],
      projects: [
        { repoId: 'd', repoName: 'acme/d', packagePath: 'package.json', packageName: 'd' },
      ],
    },
  ],
};

const converged: DependencyGroup = {
  depName: 'lodash',
  versions: [
    {
      versionRange: '^4.17.21',
      depTypes: ['dependencies', 'devDependencies'],
      projects: [
        { repoId: 'a', repoName: 'acme/a', packagePath: 'package.json', packageName: 'a' },
      ],
    },
  ],
};

describe('DependencyGroupCard', () => {
  it('shows the drift badge only when more than one range exists (RN RF-09.3)', () => {
    const { rerender } = render(<DependencyGroupCard group={drifted} />);
    expect(screen.getByText(/version drift/i)).toBeInTheDocument();
    rerender(<DependencyGroupCard group={converged} />);
    expect(screen.queryByText(/version drift/i)).not.toBeInTheDocument();
  });

  it('lists every project nominally under its version group', () => {
    render(<DependencyGroupCard group={drifted} />);
    expect(screen.getByText('^18.2.0')).toBeInTheDocument();
    expect(screen.getByText('^17.0.2')).toBeInTheDocument();
    for (const name of ['acme/a', 'acme/b', 'acme/c', 'acme/d']) {
      expect(screen.getByText(new RegExp(name))).toBeInTheDocument();
    }
  });

  it('shows project and version counts', () => {
    render(<DependencyGroupCard group={drifted} />);
    expect(screen.getByText(/4 projects/)).toBeInTheDocument();
    expect(screen.getByText(/2 versions/)).toBeInTheDocument();
  });

  it('shows short dep-type labels per version group (RF-09.5)', () => {
    const { rerender } = render(<DependencyGroupCard group={drifted} />);
    expect(screen.getAllByText('deps').length).toBeGreaterThan(0);
    rerender(<DependencyGroupCard group={converged} />);
    expect(screen.getByText('deps')).toBeInTheDocument();
    expect(screen.getByText('dev')).toBeInTheDocument();
  });
});
