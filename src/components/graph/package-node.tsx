import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TableIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { PackageNodeData } from '@/lib/graph/graph-data';

type PackageFlowNode = Node<PackageNodeData, 'package'>;

/** Pure presentational content (unit-tested directly). */
export function PackageNodeContent({
  data,
  onOpenDetails,
}: {
  data: PackageNodeData;
  onOpenDetails?: () => void;
}) {
  const distinctVersions = [...new Set(data.versions.map((v) => v.version))];

  return (
    <div
      className={cn(
        'rounded-full border bg-card px-3 py-1.5 shadow-sm',
        data.hasVersionDrift && 'border-amber-500/60 ring-1 ring-amber-500/30',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block max-w-40 truncate font-mono text-xs font-bold"
          title={data.packageName}
        >
          {data.packageName}
        </span>
        {data.hasVersionDrift ? (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/10 font-mono text-amber-700 dark:text-amber-400"
          >
            {distinctVersions.length} versions
          </Badge>
        ) : (
          <Badge variant="secondary" className="font-mono">
            {distinctVersions[0]}
          </Badge>
        )}
        {onOpenDetails && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Version details of ${data.packageName}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDetails();
                  }}
                  className="nodrag"
                >
                  <TableIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open version details</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

/** React Flow wrapper — adds the invisible edge handle. */
export function PackageNode({ data }: NodeProps<PackageFlowNode>) {
  return (
    <>
      {/* Centered so edges appear to attach from any direction; isConnectable={false}
          keeps pointer-down from starting a connection so the node stays draggable. */}
      <Handle
        type="target"
        position={Position.Left}
        className="opacity-0"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        isConnectable={false}
      />
      <PackageNodeContent
        data={data}
        onOpenDetails={
          typeof data.onOpenDetails === 'function'
            ? () => (data.onOpenDetails as () => void)()
            : undefined
        }
      />
    </>
  );
}
