import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TokenDialog } from './token-dialog';
import { useTokenStore } from '@/stores/token-store';
import { useRepoStore } from '@/stores/repo-store';
import type { RepoConfig } from '@/lib/types';

beforeEach(() => {
  localStorage.clear();
  useTokenStore.getState().clearAll();
  useRepoStore.setState({ repos: [], selectedRepoId: null });
});

async function openDialog() {
  const user = userEvent.setup();
  render(<TokenDialog />);
  await user.click(screen.getByRole('button', { name: /access tokens/i }));
  return user;
}

describe('TokenDialog', () => {
  it('always shows the gitlab.com row and the memory-only note', async () => {
    await openDialog();
    expect(screen.getByText(/kept in memory only and never stored/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gitlab\.com/i)).toBeInTheDocument();
  });

  it('adds a row for each self-hosted GitLab host in the repo list', async () => {
    useRepoStore.setState({
      repos: [
        {
          id: 'r1',
          provider: 'gitlab',
          host: 'gitlab.acme.com',
          path: 'g/p',
          displayName: 'g/p',
        } as RepoConfig,
      ],
      selectedRepoId: null,
    });
    await openDialog();
    expect(screen.getByLabelText(/gitlab\.acme\.com/i)).toBeInTheDocument();
  });

  it('writes tokens into the memory store via password fields', async () => {
    const user = await openDialog();
    await user.type(screen.getByLabelText(/^github$/i), 'ghp_secret');
    expect(useTokenStore.getState().githubToken).toBe('ghp_secret');
  });

  it('writes a gitlab host token into the memory store', async () => {
    const user = await openDialog();
    await user.type(screen.getByLabelText(/gitlab\.com/i), 'glpat_secret');
    expect(useTokenStore.getState().gitlabTokens['gitlab.com']).toBe('glpat_secret');
  });

  it('clear all empties every token', async () => {
    useTokenStore.getState().setGithubToken('x');
    useTokenStore.getState().setGitlabToken('gitlab.com', 'y');
    const user = await openDialog();
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(useTokenStore.getState().githubToken).toBe('');
    expect(useTokenStore.getState().gitlabTokens).toEqual({});
  });
});
