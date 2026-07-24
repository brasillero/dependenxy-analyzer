'use client';

import { useEffect, useState } from 'react';
import { AddRepoForm } from '@/components/add-repo-form';
import { AnalysisView } from '@/components/analysis-view';
import { AppHeader } from '@/components/app-header';
import { DependencyPanel } from '@/components/dependency-panel';
import { RepoList } from '@/components/repo-list';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepoStore } from '@/stores/repo-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useViewStore } from '@/stores/view-store';

export default function Page() {
  const view = useViewStore((s) => s.view);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Persisted stores skip automatic hydration (skipHydration: true) so the
    // first client render matches SSR; rehydrate them here on mount. `mounted`
    // flips only once hydration has actually finished, so persisted repos and
    // settings are loaded before RepoList/DependencyPanel render. The setState
    // lives in an async callback (not the effect body) to satisfy
    // react-hooks/set-state-in-effect.
    void Promise.all([
      useRepoStore.persist.rehydrate(),
      useSettingsStore.persist.rehydrate(),
    ]).then(() => setMounted(true));
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-r p-4">
          <AddRepoForm />
          {mounted ? <RepoList /> : <Skeleton className="h-24 w-full" />}
        </aside>
        <main className="flex-1 overflow-y-auto p-4">
          {!mounted ? (
            <Skeleton className="h-32 w-full" />
          ) : view === 'analysis' ? (
            <AnalysisView />
          ) : (
            <DependencyPanel />
          )}
        </main>
      </div>
    </div>
  );
}
