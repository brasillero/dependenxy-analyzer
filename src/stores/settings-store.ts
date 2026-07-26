import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DepType } from '@/lib/types';

interface SettingsState {
  enabledDepTypes: Record<DepType, boolean>;
  toggleDepType: (type: DepType) => void;
  /** When on, the canvas zooms to fit the current selection automatically. */
  autoFitSelection: boolean;
  toggleAutoFitSelection: () => void;
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
