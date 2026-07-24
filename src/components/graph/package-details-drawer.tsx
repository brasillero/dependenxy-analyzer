'use client';

import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { PackageNodeData } from '@/lib/graph/graph-data';

interface Props {
  packageData: PackageNodeData | null;
  onClose: () => void;
}

const STATUS_LABELS = {
  aligned: { label: 'aligned', className: '' },
  majority: { label: 'most common', className: '' },
  divergent: {
    label: 'divergent',
    className: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
} as const;

/** Side drawer with the version-drift details table. */
export function PackageDetailsDrawer({ packageData, onClose }: Props) {
  return (
    <Sheet open={packageData !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-[440px]">
        {packageData && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono">{packageData.packageName}</SheetTitle>
              <SheetDescription>
                {packageData.hasVersionDrift
                  ? 'Version drift detected across repositories.'
                  : 'All projects declare the same version range.'}
              </SheetDescription>
            </SheetHeader>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Repository</th>
                  <th className="pb-2 font-medium">Branch</th>
                  <th className="pb-2 font-medium">Version</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {packageData.versions.map((version) => {
                  const status = STATUS_LABELS[version.status];
                  return (
                    <tr key={`${version.repoId}:${version.packagePath}`} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">
                        {version.repoName} / {version.packageName}
                      </td>
                      <td className="py-2 text-xs">{version.branch}</td>
                      <td className="py-2 font-mono text-xs">{version.version}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
