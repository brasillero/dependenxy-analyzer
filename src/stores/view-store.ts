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
  /** Incremented to force a full re-layout of the canvas (manual refresh). */
  layoutVersion: number;
  /** Incremented when the viewport should fit the graph (auto analysis only). */
  fitVersion: number;
  setAnalysis: (groups: DependencyGroup[], failed: AnalysisFailure[], totalFailed?: boolean) => void;
  setAnalyzing: (analyzing: boolean) => void;
  bumpLayoutVersion: () => void;
  bumpFitVersion: () => void;
}

export const useViewStore = create<ViewState>()((set) => ({
  analysis: null,
  analysisFailed: [],
  analysisTotalFailed: false,
  analyzing: false,
  layoutVersion: 0,
  fitVersion: 0,
  setAnalysis: (groups, failed, totalFailed = false) =>
    set({ analysis: groups, analysisFailed: failed, analysisTotalFailed: totalFailed }),
  setAnalyzing: (analyzing) => set({ analyzing }),
  bumpLayoutVersion: () => set((state) => ({ layoutVersion: state.layoutVersion + 1 })),
  bumpFitVersion: () => set((state) => ({ fitVersion: state.fitVersion + 1 })),
}));
