import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from './view-store';
import type { DependencyGroup } from '@/lib/types';

beforeEach(() => {
  useViewStore.setState({ view: 'repo', analysis: null, analysisFailed: [] });
});

describe('view-store', () => {
  it('starts on the repo view with no analysis', () => {
    const state = useViewStore.getState();
    expect(state.view).toBe('repo');
    expect(state.analysis).toBeNull();
    expect(state.analysisFailed).toEqual([]);
  });

  it('setView switches the view', () => {
    useViewStore.getState().setView('analysis');
    expect(useViewStore.getState().view).toBe('analysis');
    useViewStore.getState().setView('repo');
    expect(useViewStore.getState().view).toBe('repo');
  });

  it('setAnalysis flips to the analysis view and sets both fields', () => {
    const groups = [{ depName: 'react', versions: [] }] as DependencyGroup[];
    const failed = [{ repoName: 'acme/web', error: 'boom' }];
    useViewStore.getState().setAnalysis(groups, failed);
    const state = useViewStore.getState();
    expect(state.view).toBe('analysis');
    expect(state.analysis).toEqual(groups);
    expect(state.analysisFailed).toEqual(failed);
  });
});
