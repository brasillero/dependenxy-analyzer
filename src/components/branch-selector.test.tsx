import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BranchSelector } from './branch-selector';
import { useRepoStore } from '@/stores/repo-store';
import { useTokenStore } from '@/stores/token-store';
import type { RepoConfig } from '@/lib/types';

vi.mock('@/hooks/use-branches', () => ({
  useBranches: () => ({ data: ['main', 'develop'], isLoading: false, error: null }),
}));

beforeAll(() => {
  // jsdom lacks the pointer-capture / ResizeObserver APIs Radix Select needs to open.
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const repo: RepoConfig = {
  id: 'r1',
  provider: 'github',
  host: 'github.com',
  path: 'o/r',
  displayName: 'o/r',
  defaultBranch: 'main',
  selectedBranch: 'deleted-branch',
};

beforeEach(() => {
  localStorage.clear();
  useTokenStore.getState().clearAll();
  useRepoStore.setState({ repos: [repo], selectedRepoId: 'r1' });
  useTokenStore.getState().setGithubToken('ghp_x');
});

describe('BranchSelector', () => {
  it('renders a persisted branch missing upstream as a disabled "(not found)" item', async () => {
    const user = userEvent.setup();
    render(<BranchSelector repo={repo} />);
    await user.click(screen.getByRole('combobox'));
    const options = await screen.findAllByRole('option');
    const missing = options.find((o) => o.textContent === 'deleted-branch (not found)');
    expect(missing).toBeDefined();
    expect(missing).toHaveAttribute('data-disabled');
  });
});
