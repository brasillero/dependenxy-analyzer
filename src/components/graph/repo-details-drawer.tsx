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
import { repoDependencies, type GraphData, type RepoNodeData } from '@/lib/graph/graph-data';
import { pluralize } from '@/lib/utils';

interface Props {
  graphData: GraphData;
  repo: RepoNodeData | null;
  onClose: () => void;
}

/** Side drawer listing every dependency declared by one repository. */
export function RepoDetailsDrawer({ graphData, repo, onClose }: Props) {
  const rows = repo ? repoDependencies(graphData, repo.repoId) : [];

  return (
    <Sheet open={repo !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-[440px]">
        {repo && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 font-mono">
                {repo.label}
                <Badge variant="secondary" className="font-mono font-normal">
                  {pluralize(rows.length, 'package', 'packages')}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                {repo.branch
                  ? `Dependencies declared on ${repo.branch}.`
                  : 'Dependencies declared in this repository.'}
              </SheetDescription>
            </SheetHeader>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.packageName}:${row.packagePath}`}>
                    <TableCell className="font-mono text-xs">
                      {row.packageName}
                      {row.packagePath !== 'package.json' && (
                        <span className="block text-[10px] text-muted-foreground">
                          {row.packagePath}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.version}</TableCell>
                    <TableCell>
                      {row.hasVersionDrift ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        >
                          drift
                        </Badge>
                      ) : (
                        <Badge variant="outline">aligned</Badge>
                      )}
                    </TableCell>
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
