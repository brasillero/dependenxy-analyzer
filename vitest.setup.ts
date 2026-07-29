import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; Radix primitives (tooltip popper, etc.) need it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? ResizeObserverStub;
