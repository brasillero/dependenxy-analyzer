import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from './view-store';
import type { DependencyGroup } from '@/lib/types';

beforeEach(() => {
  useViewStore.setState({ analysis: null, analysisFailed: [], analysisTotalFailed: false });
});

describe('view-store', () => {
  it('starts with no analysis', () => {
    const state = useViewStore.getState();
    expect(state.analysis).toBeNull();
    expect(state.analysisFailed).toEqual([]);
    expect(state.analysisTotalFailed).toBe(false);
  });

  it('setAnalysis sets groups and failures', () => {
    const groups = [{ depName: 'react', versions: [] }] as DependencyGroup[];
    const failed = [{ repoName: 'acme/web', error: 'boom' }];
    useViewStore.getState().setAnalysis(groups, failed);
    const state = useViewStore.getState();
    expect(state.analysis).toEqual(groups);
    expect(state.analysisFailed).toEqual(failed);
    expect(state.analysisTotalFailed).toBe(false);
  });

  it('setAnalysis records total failure when the flag is passed', () => {
    const failed = [{ repoName: 'acme/web', error: 'boom' }];
    useViewStore.getState().setAnalysis([], failed, true);
    const state = useViewStore.getState();
    expect(state.analysis).toEqual([]);
    expect(state.analysisFailed).toEqual(failed);
    expect(state.analysisTotalFailed).toBe(true);
  });
});
