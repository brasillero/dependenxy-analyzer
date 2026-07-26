import { getStraightPath, type EdgeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

/**
 * Straight repo→package edge. The path is drawn from the package (target)
 * toward the repo (source) — visually the same line, but the marching-ants
 * dash animation then flows TOWARD the repository, which is the direction
 * we want when highlighting a selection. `animated` is set on highlighted
 * edges only; the animation itself lives in globals.css.
 */
export function DependencyEdge({ id, sourceX, sourceY, targetX, targetY, style, animated }: EdgeProps) {
  const [path] = getStraightPath({
    sourceX: targetX,
    sourceY: targetY,
    targetX: sourceX,
    targetY: sourceY,
  });
  return (
    <path
      id={id}
      className={cn('react-flow__edge-path', animated && 'animated-dependency-edge')}
      d={path}
      style={style}
    />
  );
}
