'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AddRepoForm } from '@/components/add-repo-form';
import { TokenDialog } from '@/components/token-dialog';
import { CheckIcon, PlusIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useHasCredentials } from '@/stores/token-store';
import { useRepoStore } from '@/stores/repo-store';

function Step({
  n,
  done,
  children,
  action,
}: {
  n: number;
  done?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
          done && 'border-primary bg-primary text-primary-foreground',
        )}
      >
        {done ? <CheckIcon className="size-3.5" /> : n}
      </span>
      <span className={cn('flex-1 text-sm', done && 'text-muted-foreground line-through')}>
        {children}
      </span>
      {action}
    </div>
  );
}

/** Centered onboarding shown until the first analysis exists: credentials → repo → automatic graph. */
export function OnboardingCard() {
  const hasCredentials = useHasCredentials();
  const repos = useRepoStore((s) => s.repos);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card className="w-96 shadow-md">
      <CardHeader>
        <CardTitle>Get started</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Step n={1} done={hasCredentials} action={!hasCredentials && <TokenDialog label="Add tokens" />}>
          Set your credentials
        </Step>
        <Step
          n={2}
          done={repos.length > 0}
          action={
            repos.length === 0 && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <PlusIcon className="h-4 w-4" />
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
            )
          }
        >
          Add a repository
        </Step>
        <Step n={3}>The analysis runs automatically — your dependency graph appears here.</Step>
      </CardContent>
    </Card>
  );
}
