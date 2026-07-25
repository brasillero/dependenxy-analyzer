'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { TokenDialog } from '@/components/token-dialog';
import { DEP_TYPES, type DepType } from '@/lib/types';
import { useSettingsStore } from '@/stores/settings-store';
import { useTokenStore } from '@/stores/token-store';

const DEP_TYPE_LABELS: Record<DepType, string> = {
  dependencies: 'Dependencies',
  devDependencies: 'Dev',
  peerDependencies: 'Peer',
};

export function useHasCredentials(): boolean {
  const githubToken = useTokenStore((s) => s.githubToken);
  const gitlabTokens = useTokenStore((s) => s.gitlabTokens);
  return githubToken !== '' || Object.keys(gitlabTokens).length > 0;
}

interface Props {
  sharedOnly: boolean;
  onSharedOnlyChange: (value: boolean) => void;
}

/** Checkbox filters panel — sits above the repositories panel, top-right. */
export function FiltersPanel({ sharedOnly, onSharedOnlyChange }: Props) {
  const hasCredentials = useHasCredentials();
  const enabledDepTypes = useSettingsStore((s) => s.enabledDepTypes);
  const toggleDepType = useSettingsStore((s) => s.toggleDepType);

  return (
    <div className="w-64 space-y-2 rounded-md border bg-card p-3 shadow-sm">
      {!hasCredentials && (
        <div className="flex items-center gap-2">
          <TokenDialog />
          <span className="text-xs text-muted-foreground">Set credentials to enable tools</span>
        </div>
      )}
      <p className="text-sm font-medium text-muted-foreground">Types</p>
      <div className="space-y-1.5">
        {DEP_TYPES.map((type) => (
          <label key={type} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={enabledDepTypes[type]}
              onCheckedChange={() => toggleDepType(type)}
              disabled={!hasCredentials}
              aria-label={DEP_TYPE_LABELS[type]}
            />
            {DEP_TYPE_LABELS[type]}
          </label>
        ))}
      </div>
      <Separator />
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={sharedOnly}
          onCheckedChange={(value) => onSharedOnlyChange(value === true)}
          disabled={!hasCredentials}
          aria-label="Shared only"
        />
        Shared only
      </label>
    </div>
  );
}
