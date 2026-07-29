import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
  type EdgeProps,
} from '@xyflow/react';
import { memo } from 'react';
import { cn } from '@/lib/utils';

export type DependencyEdgeType = 'straight' | 'bezier' | 'smoothstep' | 'step';

/**
 * Handles are centered on both node types, so the curve orientation is
 * derived from the relative node positions: horizontal pairs get Left/Right,
 * vertical pairs get Top/Bottom — otherwise bezier control points would
 * shoot sideways on vertical layouts.
 */
function orientation(dx: number, dy: number): [Position, Position] {
  return Math.abs(dx) >= Math.abs(dy)
    ? [Position.Right, Position.Left]
    : [Position.Bottom, Position.Top];
}

/**
 * Repo→package edge. The path is drawn from the package (target) toward the
 * repo (source) — visually the same curve, but the marching-ants dash
 * animation then flows TOWARD the repository, which is the direction we want
 * when highlighting a selection. `animated` is set on highlighted edges only;
 * the animation itself lives in globals.css.
 *
 * `data.edgeType` picks the curve: 'straight' | 'bezier' | 'smoothstep' | 'step'.
 */
export const DependencyEdge = memo(function DependencyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  animated,
  data,
}: EdgeProps) {
  const edgeType = (data?.edgeType as DependencyEdgeType | undefined) ?? 'straight';
  // Draw package -> repo (see comment above): target coords become the path source.
  const [fromPosition, toPosition] = orientation(targetX - sourceX, targetY - sourceY);
  const coords = {
    sourceX: targetX,
    sourceY: targetY,
    targetX: sourceX,
    targetY: sourceY,
    sourcePosition: fromPosition,
    targetPosition: toPosition,
  };
  const [path] =
    edgeType === 'bezier'
      ? getBezierPath(coords)
      : edgeType === 'smoothstep'
        ? getSmoothStepPath(coords)
        : edgeType === 'step'
          ? getSmoothStepPath({ ...coords, borderRadius: 0 })
          : getStraightPath(coords);
  return (
    <path
      id={id}
      className={cn('react-flow__edge-path', animated && 'animated-dependency-edge')}
      d={path}
      style={style}
    />
  );
});
