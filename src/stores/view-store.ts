import { create } from 'zustand';
import type { DependencyGroup } from '@/lib/types';
import type { AnalysisFailure } from '@/lib/analyze';

export type { AnalysisFailure };

interface ViewState {
  analysis: DependencyGroup[] | null;
  analysisFailed: AnalysisFailure[];
  /** True when every repository failed the last analysis run. */
  analysisTotalFailed: boolean;
  setAnalysis: (groups: DependencyGroup[], failed: AnalysisFailure[], totalFailed?: boolean) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  analysis: null,
  analysisFailed: [],
  analysisTotalFailed: false,
  setAnalysis: (groups, failed, totalFailed = false) =>
    set({ analysis: groups, analysisFailed: failed, analysisTotalFailed: totalFailed }),
}));
