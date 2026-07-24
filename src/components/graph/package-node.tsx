import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { PackageNodeData } from '@/lib/graph/graph-data';

type PackageFlowNode = Node<PackageNodeData, 'package'>;

/** Pure presentational content (unit-tested directly). */
export function PackageNodeContent({ data }: { data: PackageNodeData }) {
  return (
    <div className="rounded-full border bg-card px-3 py-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className="inline-block max-w-40 truncate font-mono text-xs font-bold"
          title={data.packageName}
        >
          {data.packageName}
        </span>
        {data.hasVersionDrift && (
          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-400">
            drift
          </span>
        )}
      </div>
      <div className="mt-1 flex max-w-56 flex-wrap gap-1">
        {data.versions.map((version) => (
          <span
            key={`${version.repoId}:${version.packagePath}`}
            className="rounded-full border px-1.5 font-mono text-[10px]"
            style={{ borderColor: version.repoColor, color: version.repoColor }}
            title={`${version.repoName} / ${version.packageName}`}
          >
            {version.version}
          </span>
        ))}
      </div>
    </div>
  );
}

/** React Flow wrapper — adds the invisible edge handle. */
export function PackageNode({ data }: NodeProps<PackageFlowNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <PackageNodeContent data={data} />
    </>
  );
}
