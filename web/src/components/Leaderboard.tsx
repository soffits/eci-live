import { useElementSize } from "@mantine/hooks";
import { Bar, BarChart, CartesianGrid, ReferenceArea, Tooltip, XAxis, YAxis } from "recharts";
import type { Row } from "../data";
import { niceTicks } from "../scale";
import { ChartTooltip } from "./ChartTooltip";
import { LabLogo, useLabColor } from "./LabLogo";
import classes from "./Leaderboard.module.css";
import { AddedMark, NewMark, PreviewMark } from "./ModelBadges";
import { ModelLink, useModelNav } from "./ModelLink";

const ROW_HEIGHT = 34;
/** On phones each row is two lines: name and value above, capsule below at full width. */
const STACKED_ROW_HEIGHT = 56;
const STACKED_NAME_HEIGHT = 28;
/** Centre of the capsule below the name, leaving a clear gap before the next row. */
const STACKED_CAPSULE_Y = 40;
const STACKED_BELOW_PX = 560;
/** The score column right of the plot, so numbers line up and no gridline crosses them. */
const VALUE_COLUMN = 64;
const STACKED_SIDE = 14;
const AXIS_HEIGHT = 24;
/** A bottom axis too once the chart is taller than this many rows. */
const BOTTOM_AXIS_ROWS = 10;
const NAME_PX = 7.4;
/** Rank, logo and gaps before the name. */
const LABEL_CHROME = 84;
const BADGE_PX = 96;

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
}

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Row;
}

interface AreaProps {
  y?: number;
  height?: number;
}

/** Wide enough for the longest name and its marks, so no dead gutter before the plot. */
function labelWidthFor(rows: Row[], added: Set<string>): number {
  const widest = Math.max(
    ...rows.map(
      (r) =>
        r.name.length * NAME_PX +
        (r.isNew || !r.onEpoch ? BADGE_PX : 0) +
        (added.has(r.name) ? BADGE_PX : 0),
    ),
  );
  return Math.min(380, Math.max(220, LABEL_CHROME + widest));
}

/**
 * Top models as 90% confidence-interval capsules with a dot at the point estimate. Capsules
 * don't imply a zero, so the truncated axis is honest. Models Epoch hasn't published are
 * drawn dashed and hollow. Scores sit in their own column on the right.
 */
export function Leaderboard({
  rows,
  added = new Set(),
  onRemove,
  axisLabel = "ECI",
}: {
  rows: Row[];
  /** Models the user added; they get a removable "added" mark. */
  added?: Set<string>;
  onRemove?: (name: string) => void;
  axisLabel?: string;
}) {
  const { ref, width } = useElementSize();
  const stacked = width > 0 && width < STACKED_BELOW_PX;
  const rowHeight = stacked ? STACKED_ROW_HEIGHT : ROW_HEIGHT;
  const colorOf = useLabColor();
  const { open } = useModelNav();
  const byName = new Map(rows.map((r) => [r.name, r]));
  const low = Math.min(...rows.map((r) => r.ci_low ?? r.eci));
  const high = Math.max(...rows.map((r) => r.ci_high ?? r.eci));
  const ticks = niceTicks(low, high, stacked ? 3 : 4);
  const domain = [ticks[0] ?? low, ticks.at(-1) ?? high];
  const labelWidth = stacked ? STACKED_SIDE : labelWidthFor(rows, added);
  const tied = rows.filter((r) => r.tiedFirst);
  const bottomAxis = rows.length > BOTTOM_AXIS_ROWS;
  const valueX = width - (stacked ? STACKED_SIDE : 8);
  const chartHeight = rows.length * rowHeight + AXIS_HEIGHT * (bottomAxis ? 2 : 1) + 8;
  const plotWidth = width - labelWidth - (stacked ? STACKED_SIDE : VALUE_COLUMN);

  const gapBefore = (row: Row): number => {
    const i = rows.indexOf(row);
    const previous = rows[i - 1];
    return previous && !row.tiedFirst ? row.rank - previous.rank - 1 : 0;
  };

  const renderTick = ({ y = 0, payload }: TickProps) => {
    const row = payload && byName.get(payload.value);
    if (!row) return null;
    const box = stacked
      ? { x: 0, y: Number(y) - rowHeight / 2, width, height: STACKED_NAME_HEIGHT }
      : { x: 0, y: Number(y) - rowHeight / 2, width: labelWidth, height: rowHeight };
    const hidden = gapBefore(row);
    return (
      <foreignObject {...box}>
        <div className={classes.tick} data-stacked={stacked || undefined}>
          <span
            className={classes.rank}
            data-tied={row.tiedFirst || undefined}
            data-gap={hidden > 0 || undefined}
            title={
              hidden > 0
                ? `${hidden} older ${hidden === 1 ? "model ranks" : "models rank"} between this and the row above`
                : undefined
            }
          >
            {row.tiedFirst ? "=1" : row.rank}
          </span>
          <LabLogo lab={row.lab} size={16} />
          <ModelLink name={row.name} className={classes.name} title={row.name} />
          {added.has(row.name) && onRemove && (
            <AddedMark name={row.name} onRemove={() => onRemove(row.name)} />
          )}
          {row.isNew && row.onEpoch && <NewMark />}
          {!row.onEpoch && <PreviewMark row={row} compact />}
          {stacked && <span className={classes.stackedValue}>{row.eci.toFixed(1)}</span>}
        </div>
      </foreignObject>
    );
  };

  const renderCapsule = ({ x = 0, y = 0, width: w = 0, height = 0, payload }: ShapeProps) => {
    if (!payload) return <g />;
    const color = colorOf(payload.lab);
    const lowCi = payload.ci_low ?? payload.eci;
    const span = (payload.ci_high ?? payload.eci) - lowCi;
    const cx = span > 0 ? x + (w * (payload.eci - lowCi)) / span : x;
    const cy = stacked ? y + STACKED_CAPSULE_Y : y + height / 2;
    const preview = !payload.onEpoch;
    return (
      <g>
        {span > 0 && (
          <rect
            x={x}
            y={cy - 7}
            width={Math.max(w, 0)}
            height={14}
            rx={7}
            fill={color}
            style={{ fillOpacity: preview ? 0.1 : "var(--eci-capsule-opacity)" }}
            stroke={color}
            strokeOpacity={preview ? 1 : 0.85}
            strokeDasharray={preview ? "4 3" : undefined}
            strokeWidth={1.5}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={6.5}
          fill={preview ? "var(--eci-hero-surface)" : color}
          stroke={preview ? color : "var(--eci-dot-ring)"}
          strokeWidth={preview ? 3 : 2.5}
        />
        {!stacked && (
          <text
            x={valueX}
            y={cy}
            textAnchor="end"
            dominantBaseline="central"
            className={classes.value}
          >
            {payload.eci.toFixed(1)}
          </text>
        )}
      </g>
    );
  };

  // The tie band runs across the whole row, from the rank to the score.
  const renderTieBand = ({ y = 0, height = 0 }: AreaProps) => (
    <g>
      <rect x={0} y={y} width={width} height={height} rx={10} fill="var(--eci-tie-band)" />
      <rect x={0} y={y + 4} width={3} height={height - 8} rx={1.5} fill="var(--eci-tie-accent)" />
    </g>
  );

  const axis = {
    type: "number" as const,
    height: AXIS_HEIGHT,
    domain,
    ticks,
    tickLine: false,
    axisLine: false,
    tick: { fill: "var(--mantine-color-dimmed)", fontSize: 12, fontWeight: 600 },
  };

  return (
    <div ref={ref}>
      {width > 0 && (
        <BarChart
          width={width}
          height={chartHeight}
          layout="vertical"
          data={rows}
          barCategoryGap={0}
          margin={{
            top: 0,
            right: stacked ? STACKED_SIDE : VALUE_COLUMN,
            bottom: bottomAxis ? AXIS_HEIGHT + 4 : 4,
            left: 0,
          }}
        >
          {/* On phones, dash the gridlines with the row period so they skip the name lines. */}
          <CartesianGrid
            horizontal={false}
            stroke="var(--eci-grid)"
            strokeDasharray={
              stacked ? `0 ${STACKED_NAME_HEIGHT} ${rowHeight - STACKED_NAME_HEIGHT} 0` : undefined
            }
          />
          {tied.length > 1 && (
            <ReferenceArea
              y1={tied[0]?.name}
              y2={tied.at(-1)?.name}
              ifOverflow="extendDomain"
              shape={renderTieBand}
            />
          )}
          <XAxis xAxisId="top" orientation="top" {...axis} />
          <YAxis
            type="category"
            dataKey="name"
            width={labelWidth}
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={renderTick}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "var(--mantine-color-default-hover)" }}
            wrapperStyle={{ userSelect: "none" }}
          />
          <Bar
            xAxisId="top"
            dataKey={(r: Row) => [r.ci_low ?? r.eci, r.ci_high ?? r.eci]}
            shape={renderCapsule}
            isAnimationActive={false}
            cursor="pointer"
            onClick={(bar) => bar.payload && open((bar.payload as Row).name)}
          />
          {/* The same scale repeated under a long chart, drawn from the axis domain. */}
          {bottomAxis &&
            ticks.map((t) => (
              <text
                key={t}
                x={
                  labelWidth +
                  ((t - (domain[0] ?? 0)) / ((domain[1] ?? 1) - (domain[0] ?? 0))) * plotWidth
                }
                y={chartHeight - AXIS_HEIGHT / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className={classes.axisTick}
              >
                {t}
              </text>
            ))}
          {!stacked && (
            <text
              x={labelWidth - 22}
              y={AXIS_HEIGHT / 2}
              textAnchor="end"
              dominantBaseline="central"
              className={classes.axisTitle}
            >
              {axisLabel} →
            </text>
          )}
        </BarChart>
      )}
    </div>
  );
}

/** How to read the leaderboard. */
export function LeaderboardKey({ intervals = true }: { intervals?: boolean }) {
  return (
    <div className={`${classes.key} chrome`}>
      <span>
        <svg width="34" height="14" aria-hidden>
          <rect x="1" y="3" width="32" height="8" rx="4" className={classes.keyCapsule} />
          <circle cx="15" cy="7" r="4.5" className={classes.keyDot} />
        </svg>
        {intervals ? "estimate and 90% CI" : "point estimate (no interval for custom sets)"}
      </span>
      <span>
        <svg width="34" height="14" aria-hidden>
          <rect x="1" y="3" width="32" height="8" rx="4" className={classes.keyPreview} />
          <circle cx="15" cy="7" r="4" className={classes.keyHollow} />
        </svg>
        not on Epoch yet
      </span>
      <span>
        <span className={classes.keyTie}>=1</span>
        statistically tied for #1
      </span>
    </div>
  );
}
