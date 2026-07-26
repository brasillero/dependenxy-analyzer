import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settings-store';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    enabledDepTypes: { dependencies: true, devDependencies: true, peerDependencies: true },
    autoFitSelection: true,
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

  it('toggles auto-fit-selection on and off', () => {
    expect(useSettingsStore.getState().autoFitSelection).toBe(true);
    useSettingsStore.getState().toggleAutoFitSelection();
    expect(useSettingsStore.getState().autoFitSelection).toBe(false);
    useSettingsStore.getState().toggleAutoFitSelection();
    expect(useSettingsStore.getState().autoFitSelection).toBe(true);
  });
});
