'use client';

import { useEffect } from 'react';
import { XIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useToastStore, type ToastItem } from '@/lib/toast';

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), 4500);
    return () => clearTimeout(timer);
  }, [item.id, dismiss]);

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-md',
        item.kind === 'error' && 'border-destructive/50 text-destructive',
      )}
    >
      <span className="min-w-0 flex-1">{item.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(item.id)}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Minimal fixed-position toaster — replaces the sonner Toaster. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
