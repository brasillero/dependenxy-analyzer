import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
        data.hasVersionDrift && 'border-red-500/60 bg-red-500/5 ring-1 ring-red-500/30',
        data.isShared && !data.hasVersionDrift && 'border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/30',
      )}
      title={onOpenDetails ? `${data.packageName} — click for version details` : data.packageName}
    >
      <div className="flex items-center gap-2">
        {onOpenDetails ? (
          <Button
            variant="link"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails();
            }}
            className="nodrag h-auto max-w-40 cursor-pointer truncate p-0 font-mono text-xs font-medium"
            title={data.packageName}
          >
            {data.packageName}
          </Button>
        ) : (
          <span
            className="inline-block max-w-40 truncate font-mono text-xs font-medium"
            title={data.packageName}
          >
            {data.packageName}
          </span>
        )}
        {data.hasVersionDrift ? (
          <Badge
            variant="outline"
            className="border-red-500/50 bg-red-500/10 font-mono text-red-700 dark:text-red-400"
          >
            {distinctVersions.length} versions
          </Badge>
        ) : data.isShared ? (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/10 font-mono text-amber-700 dark:text-amber-400"
          >
            aligned
          </Badge>
        ) : (
          <Badge variant="secondary" className="font-mono">
            {distinctVersions[0]}
          </Badge>
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
