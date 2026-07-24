'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DepTypeToggles } from '@/components/dep-type-toggles';
import { TokenDialog } from '@/components/token-dialog';
import { runAnalysis } from '@/lib/analyze';
import { useRepoStore } from '@/stores/repo-store';
import { useViewStore } from '@/stores/view-store';

export function AppHeader() {
  const repos = useRepoStore((s) => s.repos);
  const [analyzing, setAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const handleAnalyze = async () => {
    if (repos.length === 0 || analyzing) return;
    setAnalyzing(true);
    try {
      const { groups, failed } = await runAnalysis(repos, queryClient);
      useViewStore.getState().setAnalysis(groups, failed, failed.length === repos.length);
      if (failed.length === repos.length) {
        toast.error('No repository could be analyzed.');
      }
    } catch {
      toast.error('Analysis failed unexpectedly.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
      <h1 className="text-sm font-medium">Repository Dependency Analyzer</h1>
      <div className="ml-auto flex items-center gap-4">
        <DepTypeToggles />
        <Separator orientation="vertical" className="h-6" />
        <TokenDialog />
        <Button onClick={handleAnalyze} disabled={repos.length === 0 || analyzing}>
          {analyzing ? 'Analyzing…' : 'Analyze'}
        </Button>
      </div>
    </header>
  );
}
