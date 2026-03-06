'use client';

import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TeamSeriesBucket {
  key: string;
  label: string;
  date: Date;
  isProjected: boolean;
}

export interface TeamSeriesLine {
  teamId: string;
  teamName: string;
  values: number[];
  latestFte: number;
  color: string;
}

const CHART_PADDING = { top: 12, right: 48, bottom: 32, left: 40 };
const CHART_HEIGHT = 220;
const Y_MAX = 120;

function monotonePath(
  points: { x: number; y: number }[],
  xScale: (i: number) => number,
  yScale: (v: number) => number,
  indexOffset = 0
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${xScale(indexOffset)} ${yScale(points[0].y)}`;
  const pts = points.map((p, i) => ({ x: xScale(indexOffset + i), y: yScale(p.y) }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i += 1) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const dx = (p1.x - p0.x) / 3;
    d += ` C ${p0.x + dx} ${p0.y}, ${p1.x - dx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

interface MultiLineCapacityChartProps {
  buckets: TeamSeriesBucket[];
  lines: TeamSeriesLine[];
  selectedTeamIds: Set<string> | null;
  onToggleTeam: (teamId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  width?: number;
}

export function MultiLineCapacityChart({
  buckets,
  lines,
  selectedTeamIds,
  onToggleTeam,
  onSelectAll,
  onDeselectAll,
  width = 640,
}: MultiLineCapacityChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverTeamId, setHoverTeamId] = useState<string | null>(null);

  const innerWidth = width - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  }, []);

  const { xScale, yScale, todayIndex } = useMemo(() => {
    const n = buckets.length;
    const xScale = (i: number) => (n <= 1 ? CHART_PADDING.left + innerWidth / 2 : CHART_PADDING.left + (i / Math.max(1, n - 1)) * innerWidth);
    const allValues = lines.flatMap((l) => l.values);
    const maxVal = Math.max(0, ...allValues, Y_MAX);
    const yScale = (v: number) => CHART_PADDING.top + innerHeight - (v / maxVal) * innerHeight;
    let todayIndex: number | null = null;
    for (let i = 0; i < buckets.length; i += 1) {
      const b = buckets[i];
      const t = b.date.getTime();
      if (t <= today && (i === buckets.length - 1 || buckets[i + 1].date.getTime() > today)) {
        todayIndex = i;
        break;
      }
    }
    return { xScale, yScale, yMax: maxVal, todayIndex };
  }, [buckets, lines, innerWidth, innerHeight]);

  const isTeamActive = useCallback(
    (teamId: string) => (selectedTeamIds == null ? true : selectedTeamIds.has(teamId)),
    [selectedTeamIds]
  );

  const tooltipRows = useMemo(() => {
    if (hoverIndex == null || hoverIndex < 0 || hoverIndex >= buckets.length) return [];
    return lines
      .map((l) => ({ ...l, value: l.values[hoverIndex] ?? 0 }))
      .sort((a, b) => b.value - a.value);
  }, [lines, hoverIndex, buckets.length]);

  return (
    <div className="space-y-3">
      <div className="relative" style={{ width }}>
        <svg width={width} height={CHART_HEIGHT} className="overflow-visible">
          <defs>
            <linearGradient id="band-amber" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgb(245 158 11)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="rgb(245 158 11)" stopOpacity={0.08} />
            </linearGradient>
            <linearGradient id="band-red" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgb(239 68 68)" stopOpacity={0.08} />
              <stop offset="100%" stopColor="rgb(239 68 68)" stopOpacity={0.08} />
            </linearGradient>
          </defs>
          {/* Amber band 75–100% */}
          <rect
            x={CHART_PADDING.left}
            y={yScale(100)}
            width={innerWidth}
            height={yScale(75) - yScale(100)}
            fill="url(#band-amber)"
          />
          {/* Red band above 100% */}
          <rect
            x={CHART_PADDING.left}
            y={CHART_PADDING.top}
            width={innerWidth}
            height={yScale(100) - CHART_PADDING.top}
            fill="url(#band-red)"
          />
          {/* Ref line 75% */}
          <line
            x1={CHART_PADDING.left}
            y1={yScale(75)}
            x2={CHART_PADDING.left + innerWidth}
            y2={yScale(75)}
            stroke="rgb(245 158 11)"
            strokeDasharray="4 2"
            strokeWidth={1}
            opacity={0.7}
          />
          <text x={CHART_PADDING.left + innerWidth + 6} y={yScale(75) + 4} className="fill-muted-foreground text-[10px]">75% — approaching</text>
          {/* Ref line 100% */}
          <line
            x1={CHART_PADDING.left}
            y1={yScale(100)}
            x2={CHART_PADDING.left + innerWidth}
            y2={yScale(100)}
            stroke="rgb(239 68 68)"
            strokeDasharray="4 2"
            strokeWidth={1}
            opacity={0.7}
          />
          <text x={CHART_PADDING.left + innerWidth + 6} y={yScale(100) + 4} className="fill-muted-foreground text-[10px]">100% — full capacity</text>
          {/* Today line */}
          {todayIndex != null && (
            <g>
              <line
                x1={xScale(todayIndex)}
                y1={CHART_PADDING.top}
                x2={xScale(todayIndex)}
                y2={CHART_PADDING.top + innerHeight}
                stroke="currentColor"
                strokeWidth={1}
                opacity={0.4}
              />
              <text x={xScale(todayIndex)} y={CHART_PADDING.top + innerHeight + 14} className="fill-muted-foreground text-[10px]" textAnchor="middle">Today</text>
            </g>
          )}
          {/* Crosshair on hover */}
          {hoverIndex != null && hoverIndex >= 0 && hoverIndex < buckets.length && (
            <line
              x1={xScale(hoverIndex)}
              y1={CHART_PADDING.top}
              x2={xScale(hoverIndex)}
              y2={CHART_PADDING.top + innerHeight}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.35}
              strokeDasharray="2 2"
            />
          )}
          {/* Lines: historical solid, projected dashed 60% */}
          {lines.map((line) => {
            const active = isTeamActive(line.teamId);
            const isHover = hoverTeamId === line.teamId;
            const points = line.values.map((y, i) => ({ x: i, y }));
            const opacity = active ? 1 : 0.3;
            const strokeWidth = isHover ? 3 : 2;
            const n = points.length;
            const drawHistorical = todayIndex != null && todayIndex < n - 1 ? points.slice(0, todayIndex + 1) : points;
            const drawProjected = todayIndex != null && todayIndex < n - 1 ? points.slice(todayIndex) : [];
            return (
              <g key={line.teamId}>
                <path
                  d={monotonePath(drawHistorical, xScale, yScale, 0)}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={strokeWidth}
                  strokeOpacity={opacity}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: 'stroke-width 0.15s, stroke-opacity 0.15s' }}
                  onMouseEnter={() => setHoverTeamId(line.teamId)}
                  onMouseLeave={() => setHoverTeamId(null)}
                />
                {drawProjected.length > 0 && (
                  <path
                    d={monotonePath(drawProjected, xScale, yScale, todayIndex!)}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={strokeWidth}
                    strokeOpacity={opacity * 0.6}
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transition: 'stroke-width 0.15s, stroke-opacity 0.15s' }}
                    onMouseEnter={() => setHoverTeamId(line.teamId)}
                    onMouseLeave={() => setHoverTeamId(null)}
                  />
                )}
              </g>
            );
          })}
          {/* Invisible hover strips per bucket (aligned with xScale) */}
          {buckets.map((_, i) => {
            const n = buckets.length;
            const step = n <= 1 ? innerWidth : innerWidth / (n - 1);
            const x = CHART_PADDING.left + (i === 0 ? 0 : (i - 0.5) * step);
            const w = n <= 1 ? innerWidth : (i === 0 || i === n - 1 ? step / 2 : step);
            return (
              <rect
                key={i}
                x={x}
                y={CHART_PADDING.top}
                width={w}
                height={innerHeight}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoverIndex != null && tooltipRows.length > 0 && (
          <div
            className="absolute z-10 rounded-lg border border-white/20 bg-background/90 backdrop-blur px-2.5 py-2 shadow-lg text-xs pointer-events-none"
            style={{
              left: Math.min(xScale(hoverIndex), width - 160),
              top: CHART_PADDING.top - 8,
            }}
          >
            <p className="text-[10px] text-muted-foreground mb-1.5">{buckets[hoverIndex].label}</p>
            {tooltipRows.map((r) => (
              <div key={r.teamId} className="flex items-center justify-between gap-3 py-0.5">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="truncate text-foreground/90">{r.teamName}</span>
                </span>
                <span className="font-medium tabular-nums text-foreground">{Math.round(r.value)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
            onClick={onSelectAll}
          >
            Select all
          </button>
          <span className="text-muted-foreground/50">·</span>
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
            onClick={onDeselectAll}
          >
            Deselect all
          </button>
        </div>
        {lines.map((line) => {
          const active = isTeamActive(line.teamId);
          return (
            <button
              key={line.teamId}
              type="button"
              onClick={() => onToggleTeam(line.teamId)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors',
                active ? 'border-white/20 bg-background/60 text-foreground' : 'border-white/10 bg-muted/20 text-muted-foreground opacity-70'
              )}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: line.color }} />
              <span className="truncate max-w-[120px]">{line.teamName}</span>
              <span className="tabular-nums text-[10px]">{Math.round(line.latestFte)}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
