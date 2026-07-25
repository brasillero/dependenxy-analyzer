'use client';

import { useState } from 'react';
import { Panel } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { XIcon } from '@/components/icons';
import { useViewStore } from '@/stores/view-store';

/** Floating banner for partial/total analysis failures (dismissible per run). */
export function AnalysisBanner() {
  const analysisFailed = useViewStore((s) => s.analysisFailed);
  const analysisTotalFailed = useViewStore((s) => s.analysisTotalFailed);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // A new analysis run (new analysisFailed array identity) re-arms the banner.
  const [prevFailed, setPrevFailed] = useState(analysisFailed);
  if (prevFailed !== analysisFailed) {
    setPrevFailed(analysisFailed);
    setBannerDismissed(false);
  }

  if (analysisFailed.length === 0 || bannerDismissed) return null;

  return (
    <Panel position="bottom-left" className="max-w-md">
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
            size="icon-xs"
            aria-label="Dismiss"
            onClick={() => setBannerDismissed(true)}
          >
            <XIcon />
          </Button>
        </CardContent>
      </Card>
    </Panel>
  );
}
