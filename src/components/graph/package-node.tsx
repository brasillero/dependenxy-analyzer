import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PackageNodeData } from '@/lib/graph/graph-data';

type PackageFlowNode = Node<PackageNodeData, 'package'>;

/** Pure presentational content (unit-tested directly). */
export function PackageNodeContent({ data }: { data: PackageNodeData }) {
  const distinctVersions = [...new Set(data.versions.map((v) => v.version))];

  return (
    <div
      className={cn(
        'rounded-full border bg-card px-3 py-1.5 shadow-sm',
        data.hasVersionDrift && 'border-amber-500/60 ring-1 ring-amber-500/30',
        data.isShared && 'cursor-pointer',
      )}
      title={data.isShared ? `${data.packageName} — double-click for version details` : data.packageName}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-block max-w-40 truncate font-mono text-xs font-bold',
            data.isShared &&
              'text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary',
          )}
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
      <PackageNodeContent data={data} />
    </>
  );
}
