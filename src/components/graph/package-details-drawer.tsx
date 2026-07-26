'use client';

import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { pluralize } from '@/lib/utils';
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
    className: 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  },
} as const;

/** Side drawer with the version-drift details table. */
export function PackageDetailsDrawer({ packageData, onClose }: Props) {
  const versionCount = packageData
    ? new Set(packageData.versions.map((v) => v.version)).size
    : 0;

  return (
    <Sheet open={packageData !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-[440px]">
        {packageData && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 font-mono">
                {packageData.packageName}
                <Badge variant="secondary" className="font-mono font-normal">
                  {pluralize(versionCount, 'version', 'versions')}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                {packageData.hasVersionDrift
                  ? 'Version drift detected across repositories.'
                  : 'All projects declare the same version range.'}
              </SheetDescription>
            </SheetHeader>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Repository</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packageData.versions.map((version) => {
                  const status = STATUS_LABELS[version.status];
                  return (
                    <TableRow key={`${version.repoId}:${version.packagePath}`}>
                      <TableCell className="font-mono text-xs">
                        {version.repoName} / {version.packageName}
                      </TableCell>
                      <TableCell className="text-xs">{version.branch}</TableCell>
                      <TableCell className="font-mono text-xs">{version.version}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
