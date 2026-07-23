import { create } from 'zustand';
import type { DependencyGroup } from '@/lib/types';

export interface AnalysisFailure {
  repoName: string;
  error: string;
}

interface ViewState {
  view: 'repo' | 'analysis';
  analysis: DependencyGroup[] | null;
  analysisFailed: AnalysisFailure[];
  setView: (view: 'repo' | 'analysis') => void;
  setAnalysis: (groups: DependencyGroup[], failed: AnalysisFailure[]) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  view: 'repo',
  analysis: null,
  analysisFailed: [],
  setView: (view) => set({ view }),
  setAnalysis: (groups, failed) => set({ view: 'analysis', analysis: groups, analysisFailed: failed }),
}));
