'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { AddRepoForm } from '@/components/add-repo-form';
import { DepTypeToggles } from '@/components/dep-type-toggles';
import { TokenDialog } from '@/components/token-dialog';
import { runAnalysis } from '@/lib/analyze';
import { toast } from '@/lib/toast';
import { useRepoStore } from '@/stores/repo-store';
import { useViewStore } from '@/stores/view-store';

/** Floating tools panel: add repo, tokens, dep-type toggles, Analyze. */
export function ToolsPanel() {
  const repos = useRepoStore((s) => s.repos);
  const [analyzing, setAnalyzing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
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
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 shadow-sm">
      <span className="mr-1 text-xs font-medium text-muted-foreground">RDA</span>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            Add repository
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add repository</DialogTitle>
          </DialogHeader>
          <AddRepoForm onAdded={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>
      <TokenDialog />
      <Separator orientation="vertical" className="h-6" />
      <DepTypeToggles />
      <Separator orientation="vertical" className="h-6" />
      <Button size="sm" onClick={handleAnalyze} disabled={repos.length === 0 || analyzing}>
        {analyzing ? 'Analyzing…' : 'Analyze'}
      </Button>
    </div>
  );
}
