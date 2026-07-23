import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DepType } from '@/lib/types';

interface SettingsState {
  enabledDepTypes: Record<DepType, boolean>;
  toggleDepType: (type: DepType) => void;
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
    }),
    { name: 'rda-settings' },
  ),
);
