'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DependencyGroupCard } from '@/components/dependency-group-card';
import { pluralize } from '@/lib/utils';
import { useViewStore } from '@/stores/view-store';

export function AnalysisView() {
  const analysis = useViewStore((s) => s.analysis);
  const analysisFailed = useViewStore((s) => s.analysisFailed);
  const analysisTotalFailed = useViewStore((s) => s.analysisTotalFailed);
  const setView = useViewStore((s) => s.setView);
  const [search, setSearch] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // A new analysis run (new analysisFailed array identity) re-arms the banner
  // (RF-09.4). Render-time state adjustment, per React docs — avoids an effect.
  const [prevFailed, setPrevFailed] = useState(analysisFailed);
  if (prevFailed !== analysisFailed) {
    setPrevFailed(analysisFailed);
    setBannerDismissed(false);
  }

  const filtered = useMemo(() => {
    const groups = analysis ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => g.depName.toLowerCase().includes(term));
  }, [analysis, search]);

  // "M projects" = distinct (repoId, packagePath) pairs across the result.
  const projectCount = useMemo(() => {
    const keys = new Set<string>();
    for (const group of analysis ?? []) {
      for (const version of group.versions) {
        for (const project of version.projects) {
          keys.add(`${project.repoId}:${project.packagePath}`);
        }
      }
    }
    return keys.size;
  }, [analysis]);

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Run Analyze to see cross-repo results.
      </div>
    );
  }

  const showBanner = analysisFailed.length > 0 && !bannerDismissed;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">
          Analysis — {pluralize(analysis.length, 'dependency', 'dependencies')} across{' '}
          {pluralize(projectCount, 'project', 'projects')}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setView('repo')}>
          Back to repository view
        </Button>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dependency…"
          aria-label="Search dependency"
          className="ml-auto w-64"
        />
      </div>

      {showBanner && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {analysisTotalFailed
                  ? 'Analysis failed — no repository could be analyzed.'
                  : `Partial analysis — ${analysisFailed.length} repositor${
                      analysisFailed.length === 1 ? 'y' : 'ies'
                    } failed`}
              </p>
              <ul className="space-y-0.5 text-sm text-amber-700 dark:text-amber-400">
                {analysisFailed.map((failure, index) => (
                  <li key={`${failure.repoName}:${index}`}>
                    <span className="font-mono">{failure.repoName}</span> — {failure.error}
                  </li>
                ))}
              </ul>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label="Dismiss"
              onClick={() => setBannerDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {analysis.length === 0
            ? 'No dependencies found in the analyzed repositories.'
            : 'No dependencies match your search.'}
        </p>
      )}

      {filtered.map((group) => (
        <DependencyGroupCard key={group.depName} group={group} />
      ))}
    </div>
  );
}
