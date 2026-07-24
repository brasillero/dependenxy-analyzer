'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DependencyGroupCard } from '@/components/dependency-group-card';
import { DependencyGraph } from '@/components/graph/dependency-graph';
import { filterGroupsByVisibility } from '@/lib/grouping';
import { pluralize } from '@/lib/utils';
import { useRepoStore } from '@/stores/repo-store';
import { useViewStore } from '@/stores/view-store';

export function AnalysisView() {
  const analysis = useViewStore((s) => s.analysis);
  const analysisFailed = useViewStore((s) => s.analysisFailed);
  const analysisTotalFailed = useViewStore((s) => s.analysisTotalFailed);
  const setView = useViewStore((s) => s.setView);
  const repos = useRepoStore((s) => s.repos);
  const [mode, setMode] = useState<'list' | 'graph'>('list');
  const [search, setSearch] = useState('');
  const [hideUnique, setHideUnique] = useState(false);
  const [hideShared, setHideShared] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // A new analysis run (new analysisFailed array identity) re-arms the banner
  // (RF-09.4). Render-time state adjustment, per React docs — avoids an effect.
  const [prevFailed, setPrevFailed] = useState(analysisFailed);
  if (prevFailed !== analysisFailed) {
    setPrevFailed(analysisFailed);
    setBannerDismissed(false);
  }

  const filtered = useMemo(() => {
    const byVisibility = filterGroupsByVisibility(analysis ?? [], { hideUnique, hideShared });
    const term = search.trim().toLowerCase();
    if (!term) return byVisibility;
    return byVisibility.filter((g) => g.depName.toLowerCase().includes(term));
  }, [analysis, search, hideUnique, hideShared]);

  // Graph input: repos that were actually analyzed (failures excluded).
  const analyzedRepos = useMemo(() => {
    const failedNames = new Set(analysisFailed.map((failure) => failure.repoName));
    return repos.filter((repo) => !failedNames.has(repo.displayName));
  }, [repos, analysisFailed]);

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
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <Button
            variant={mode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('list')}
          >
            List
          </Button>
          <Button
            variant={mode === 'graph' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('graph')}
          >
            Graph
          </Button>
        </div>
        {mode === 'list' && (
          <>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dependency…"
              aria-label="Search dependency"
              className="ml-auto w-64"
            />
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={hideUnique}
                onCheckedChange={(checked) => setHideUnique(checked === true)}
                aria-label="Hide unique"
              />
              Hide unique
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={hideShared}
                onCheckedChange={(checked) => setHideShared(checked === true)}
                aria-label="Hide shared"
              />
              Hide shared
            </label>
          </>
        )}
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

      {mode === 'list' && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {analysis.length === 0
            ? 'No dependencies found in the analyzed repositories.'
            : search.trim()
              ? 'No dependencies match your search.'
              : 'All dependencies are hidden by the current filters.'}
        </p>
      )}

      {mode === 'list' &&
        filtered.map((group) => <DependencyGroupCard key={group.depName} group={group} />)}

      {mode === 'graph' &&
        (analyzedRepos.length >= 1 && analysis.length > 0 ? (
          <DependencyGraph groups={analysis} repos={analyzedRepos} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing to graph — run an analysis with at least one accessible repository.
          </p>
        ))}
    </div>
  );
}
