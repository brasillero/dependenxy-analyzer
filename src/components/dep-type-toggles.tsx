'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { useSettingsStore } from '@/stores/settings-store';
import type { DepType } from '@/lib/types';

const LABELS: Array<{ type: DepType; label: string }> = [
  { type: 'dependencies', label: 'Dependencies' },
  { type: 'devDependencies', label: 'Dev' },
  { type: 'peerDependencies', label: 'Peer' },
];

export function DepTypeToggles() {
  const enabledDepTypes = useSettingsStore((s) => s.enabledDepTypes);
  const toggleDepType = useSettingsStore((s) => s.toggleDepType);

  return (
    <div className="flex items-center gap-4">
      {LABELS.map(({ type, label }) => (
        <label key={type} className="flex items-center gap-1.5 text-sm cursor-pointer">
          <Checkbox
            checked={enabledDepTypes[type]}
            onCheckedChange={() => toggleDepType(type)}
            aria-label={label}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
