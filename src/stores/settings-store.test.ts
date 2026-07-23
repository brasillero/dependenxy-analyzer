import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settings-store';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    enabledDepTypes: { dependencies: true, devDependencies: true, peerDependencies: true },
  });
});

describe('settings-store', () => {
  it('has all three types enabled by default (RN RF-07.1)', () => {
    const { enabledDepTypes } = useSettingsStore.getState();
    expect(enabledDepTypes).toEqual({
      dependencies: true,
      devDependencies: true,
      peerDependencies: true,
    });
  });

  it('toggles types independently', () => {
    useSettingsStore.getState().toggleDepType('devDependencies');
    expect(useSettingsStore.getState().enabledDepTypes.devDependencies).toBe(false);
    expect(useSettingsStore.getState().enabledDepTypes.dependencies).toBe(true);
    useSettingsStore.getState().toggleDepType('devDependencies');
    expect(useSettingsStore.getState().enabledDepTypes.devDependencies).toBe(true);
  });
});
