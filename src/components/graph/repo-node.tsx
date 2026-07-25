import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { RepoNodeData } from '@/lib/graph/graph-data';

type RepoFlowNode = Node<RepoNodeData, 'repo'>;

/** Pure presentational content (unit-tested directly). */
export function RepoNodeContent({ data }: { data: RepoNodeData }) {
  return (
    <div
      className="rounded-md border-2 bg-card px-4 py-2 shadow-sm"
      style={{ borderColor: data.color }}
    >
      <p className="max-w-56 truncate font-mono text-sm font-medium" title={data.label}>
        {data.label}
      </p>
      <p className="text-xs text-muted-foreground">on {data.branch}</p>
    </div>
  );
}

/** React Flow wrapper — adds the invisible edge handle. */
export function RepoNode({ data }: NodeProps<RepoFlowNode>) {
  return (
    <>
      {/* Centered so edges appear to attach from any direction; isConnectable={false}
          keeps pointer-down from starting a connection so the node stays draggable. */}
      <Handle
        type="source"
        position={Position.Right}
        className="opacity-0"
        style={{ top: '50%', left: '50%', right: 'auto', transform: 'translate(-50%, -50%)' }}
        isConnectable={false}
      />
      <RepoNodeContent data={data} />
    </>
  );
}
