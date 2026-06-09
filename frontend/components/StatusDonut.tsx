import type { ReactNode } from "react";

export interface DonutSegment {
  value: number;
  color: string;
}

/**
 * Dependency-free SVG donut chart. Renders segments proportionally with a
 * centred label. When every segment is 0 it shows a neutral empty ring.
 */
export default function StatusDonut({
  segments,
  size = 132,
  thickness = 18,
  centerTop,
  centerBottom,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerTop: ReactNode;
  centerBottom?: ReactNode;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const c = size / 2;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="status-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(-90 ${c} ${c})`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line-soft)" strokeWidth={thickness} />
          {total > 0 &&
            segments.map((seg, i) => {
              if (seg.value <= 0) return null;
              const dash = (seg.value / total) * circ;
              const node = (
                <circle
                  key={i}
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-acc}
                />
              );
              acc += dash;
              return node;
            })}
        </g>
      </svg>
      <div className="status-donut-center">
        <strong>{centerTop}</strong>
        {centerBottom != null && <span>{centerBottom}</span>}
      </div>
    </div>
  );
}
