import { create } from 'zustand';
import type { DependencyGroup } from '@/lib/types';
import type { AnalysisFailure } from '@/lib/analyze';

export type { AnalysisFailure };

interface ViewState {
  analysis: DependencyGroup[] | null;
  analysisFailed: AnalysisFailure[];
  /** True when every repository failed the last analysis run. */
  analysisTotalFailed: boolean;
  /** True while an analysis run is in flight (auto or manual). */
  analyzing: boolean;
  setAnalysis: (groups: DependencyGroup[], failed: AnalysisFailure[], totalFailed?: boolean) => void;
  setAnalyzing: (analyzing: boolean) => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  analysis: null,
  analysisFailed: [],
  analysisTotalFailed: false,
  analyzing: false,
  setAnalysis: (groups, failed, totalFailed = false) =>
    set({ analysis: groups, analysisFailed: failed, analysisTotalFailed: totalFailed }),
  setAnalyzing: (analyzing) => set({ analyzing }),
}));
