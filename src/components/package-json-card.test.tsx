import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PackageJsonCard } from './package-json-card';
import type { PackageJsonFile } from '@/lib/types';

const file: PackageJsonFile = {
  path: 'packages/app/package.json',
  packageName: '@acme/app',
  deps: {
    dependencies: { react: '^18.2.0' },
    devDependencies: { vitest: '^2.0.0' },
    peerDependencies: { 'react-dom': '^18.2.0' },
  },
};

const allOn = { dependencies: true, devDependencies: true, peerDependencies: true };

describe('PackageJsonCard', () => {
  it('renders all three sections when all types are enabled', () => {
    render(<PackageJsonCard file={file} enabledTypes={allOn} />);
    expect(screen.getByText('@acme/app')).toBeInTheDocument();
    expect(screen.getByText('packages/app/package.json')).toBeInTheDocument();
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('vitest')).toBeInTheDocument();
    expect(screen.getByText('react-dom')).toBeInTheDocument();
  });

  it('hides disabled types without touching data (RN RF-07.2)', () => {
    render(<PackageJsonCard file={file} enabledTypes={{ ...allOn, devDependencies: false }} />);
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.queryByText('vitest')).not.toBeInTheDocument();
  });

  it('renders version ranges as-is', () => {
    render(<PackageJsonCard file={file} enabledTypes={allOn} />);
    // react and react-dom share the same range in the fixture.
    expect(screen.getAllByText('^18.2.0')).toHaveLength(2);
    expect(screen.getByText('^2.0.0')).toBeInTheDocument();
  });
});
