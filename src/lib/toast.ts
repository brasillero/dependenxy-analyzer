import { create } from 'zustand';

export type ToastKind = 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

/** Minimal in-memory toast queue — replaces sonner (inline-first feedback). */
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (kind, message) =>
    set((state) => ({
      toasts: [...state.toasts, { id: nextId++, kind, message }].slice(-5),
    })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** sonner-shaped call site API so components barely change. */
export const toast = {
  error: (message: string) => useToastStore.getState().push('error', message),
  info: (message: string) => useToastStore.getState().push('info', message),
};
