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
import { pluralize, shortName } from '@/lib/utils';
import type { PackageNodeData } from '@/lib/graph/graph-data';

interface Props {
  packageData: PackageNodeData | null;
  onClose: () => void;
}

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {packageData.versions.map((version) => (
                  <TableRow key={`${version.repoId}:${version.packagePath}`}>
                    <TableCell className="font-mono text-xs" title={version.repoName}>
                      {shortName(version.repoName)} / {version.packageName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {version.branch}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{version.version}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
