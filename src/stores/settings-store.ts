import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DepType } from '@/lib/types';

interface SettingsState {
  enabledDepTypes: Record<DepType, boolean>;
  toggleDepType: (type: DepType) => void;
  /** When on, the canvas zooms to fit the current selection automatically. */
  autoFitSelection: boolean;
  toggleAutoFitSelection: () => void;
  /** Master switch for compact package nodes (badges hidden). */
  compactNodes: boolean;
  toggleCompactNodes: () => void;
  /** Which package nodes compacting applies to. */
  compactMode: 'single' | 'shared' | 'all';
  setCompactMode: (mode: 'single' | 'shared' | 'all') => void;
  /** When on, highlighted edges play the marching-ants flow animation. */
  animateEdges: boolean;
  toggleAnimateEdges: () => void;
  /** Curve style used to draw dependency edges. */
  edgeType: 'straight' | 'bezier' | 'smoothstep' | 'step';
  setEdgeType: (type: 'straight' | 'bezier' | 'smoothstep' | 'step') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      enabledDepTypes: { dependencies: true, devDependencies: true, peerDependencies: true },
      toggleDepType: (type) =>
        set((state) => ({
          enabledDepTypes: {
            ...state.enabledDepTypes,
            [type]: !state.enabledDepTypes[type],
          },
        })),
      autoFitSelection: true,
      toggleAutoFitSelection: () =>
        set((state) => ({ autoFitSelection: !state.autoFitSelection })),
      compactNodes: false,
      toggleCompactNodes: () => set((state) => ({ compactNodes: !state.compactNodes })),
      compactMode: 'all',
      setCompactMode: (mode) => set({ compactMode: mode }),
      animateEdges: true,
      toggleAnimateEdges: () => set((state) => ({ animateEdges: !state.animateEdges })),
      edgeType: 'straight',
      setEdgeType: (type) => set({ edgeType: type }),
    }),
    {
      name: 'rda-settings',
      version: 1,
      // Rehydration is triggered manually in a client effect (Task 20 calls
      // useSettingsStore.persist.rehydrate() in useEffect) to avoid SSR hydration mismatch.
      skipHydration: true,
    },
  ),
);
