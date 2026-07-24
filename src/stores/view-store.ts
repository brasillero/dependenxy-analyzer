import { create } from 'zustand';
import type { DependencyGroup } from '@/lib/types';
import type { AnalysisFailure } from '@/lib/analyze';

export type { AnalysisFailure };

interface ViewState {
  view: 'repo' | 'analysis';
  analysis: DependencyGroup[] | null;
  analysisFailed: AnalysisFailure[];
  /** True when every repository failed the last analysis run. */
  analysisTotalFailed: boolean;
  setView: (view: 'repo' | 'analysis') => void;
  setAnalysis: (groups: DependencyGroup[], failed: AnalysisFailure[], totalFailed?: boolean) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  view: 'repo',
  analysis: null,
  analysisFailed: [],
  analysisTotalFailed: false,
  setView: (view) => set({ view }),
  setAnalysis: (groups, failed, totalFailed = false) =>
    set({ view: 'analysis', analysis: groups, analysisFailed: failed, analysisTotalFailed: totalFailed }),
}));
