'use client';

import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { DependencyGraph } from '@/components/graph/dependency-graph';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepoStore } from '@/stores/repo-store';
import { useSettingsStore } from '@/stores/settings-store';

export default function Page() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Persisted stores skip automatic hydration (skipHydration: true) so the
    // first client render matches SSR; rehydrate them here on mount.
    void Promise.all([
      useRepoStore.persist.rehydrate(),
      useSettingsStore.persist.rehydrate(),
    ]).then(() => setMounted(true));
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden">
      {mounted ? (
        <ReactFlowProvider>
          <DependencyGraph />
        </ReactFlowProvider>
      ) : (
        <div className="p-4">
          <Skeleton className="h-32 w-full" />
        </div>
      )}
    </div>
  );
}
