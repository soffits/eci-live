import { useElementSize } from "@mantine/hooks";
import { Bar, BarChart, CartesianGrid, ReferenceArea, Tooltip, XAxis, YAxis } from "recharts";
import type { Row } from "../data";
import { niceTicks } from "../scale";
import { ChartTooltip } from "./ChartTooltip";
import { LabLogo, useLabColor } from "./LabLogo";
import classes from "./Leaderboard.module.css";
import { AddedMark, NewMark, PreviewMark } from "./ModelBadges";
import { ModelLink, useModelNav } from "./ModelLink";

const ROW_HEIGHT = 32;
/** On phones each row is two lines: name and value above, capsule below at full width. */
const STACKED_ROW_HEIGHT = 50;
const STACKED_NAME_HEIGHT = 24;
/** Centre of the capsule below the name, leaving a clear gap before the next row. */
const STACKED_CAPSULE_Y = 33;
const STACKED_BELOW_PX = 520;
const TICK_GAP = 12;
const VALUE_ROOM = 52;
const AXIS_HEIGHT = 26;

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

/**
 * Top models as 90% confidence-interval capsules with a dot at the point estimate.
 * Capsules don't imply a zero, so the truncated axis is honest. Models Epoch hasn't
 * published are drawn hollow and dashed.
 */
export function Leaderboard({
  rows,
  added = new Set(),
  onRemove,
}: {
  rows: Row[];
  /** Models the user added; they get a removable "added" mark. */
  added?: Set<string>;
  onRemove?: (name: string) => void;
}) {
  const { ref, width } = useElementSize();
  const stacked = width > 0 && width < STACKED_BELOW_PX;
  const rowHeight = stacked ? STACKED_ROW_HEIGHT : ROW_HEIGHT;
  const colorOf = useLabColor();
  const { open } = useModelNav();
  const byName = new Map(rows.map((r) => [r.name, r]));
  const low = Math.min(...rows.map((r) => r.ci_low ?? r.eci));
  const high = Math.max(...rows.map((r) => r.ci_high ?? r.eci));
  const ticks = niceTicks(low, high, 3);
  const domain = [ticks[0] ?? low, ticks.at(-1) ?? high];
  const labelWidth = stacked ? 4 : 380;
  const tied = rows.filter((r) => r.tiedFirst);

  const renderTick = ({ x = 0, y = 0, payload }: TickProps) => {
    const row = payload && byName.get(payload.value);
    if (!row) return null;
    const box = stacked
      ? { x: 0, y: Number(y) - rowHeight / 2, width, height: STACKED_NAME_HEIGHT }
      : {
          x: Number(x) - labelWidth + TICK_GAP,
          y: Number(y) - rowHeight / 2,
          width: labelWidth - TICK_GAP,
          height: rowHeight,
        };
    return (
      <foreignObject {...box}>
        <div className={classes.tick}>
          <span className={classes.rank} data-tied={row.tiedFirst || undefined}>
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

  const renderCapsule = ({ x = 0, y = 0, width = 0, height = 0, payload }: ShapeProps) => {
    if (!payload) return <g />;
    const color = colorOf(payload.lab);
    const lowCi = payload.ci_low ?? payload.eci;
    const span = (payload.ci_high ?? payload.eci) - lowCi;
    const cx = span > 0 ? x + (width * (payload.eci - lowCi)) / span : x;
    const cy = stacked ? y + STACKED_CAPSULE_Y : y + height / 2;
    const preview = !payload.onEpoch;
    return (
      <g>
        <rect
          x={x}
          y={cy - 8}
          width={Math.max(width, 0)}
          height={16}
          rx={8}
          fill={color}
          style={{ fillOpacity: preview ? 0.12 : "var(--eci-capsule-opacity)" }}
          stroke={color}
          strokeOpacity={preview ? 1 : 0}
          strokeDasharray={preview ? "4 3" : undefined}
          strokeWidth={1.5}
        />
        <circle
          cx={cx}
          cy={cy}
          r={6.5}
          fill={preview ? "var(--eci-hero-surface)" : color}
          stroke={preview ? color : "var(--eci-dot-ring)"}
          strokeWidth={preview ? 2.5 : 2}
        />
        {!stacked && (
          <text x={x + width + 10} y={cy} dominantBaseline="central" className={classes.value}>
            {payload.eci.toFixed(1)}
          </text>
        )}
      </g>
    );
  };

  // The tie band runs across the whole row, from the rank to the value label.
  const renderTieBand = ({ y = 0, height = 0 }: AreaProps) => (
    <rect
      x={0}
      y={y}
      width={width}
      height={height}
      rx={10}
      fill="var(--mantine-primary-color-light)"
      fillOpacity={0.55}
    />
  );

  return (
    <div ref={ref}>
      {width > 0 && (
        <BarChart
          width={width}
          height={rows.length * rowHeight + AXIS_HEIGHT + 4}
          layout="vertical"
          data={rows}
          barCategoryGap={0}
          margin={{ top: 0, right: stacked ? 10 : VALUE_ROOM, bottom: 4, left: 0 }}
        >
          {/* On phones, dash the gridlines with the row period so they skip the name lines. */}
          <CartesianGrid
            horizontal={false}
            stroke="var(--mantine-color-default-border)"
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
          <XAxis
            type="number"
            orientation="top"
            height={AXIS_HEIGHT}
            domain={domain}
            ticks={ticks}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 12, fontWeight: 600 }}
          />
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
            dataKey={(r: Row) => [r.ci_low ?? r.eci, r.ci_high ?? r.eci]}
            shape={renderCapsule}
            isAnimationActive={false}
            cursor="pointer"
            onClick={(bar) => bar.payload && open((bar.payload as Row).name)}
          />
        </BarChart>
      )}
    </div>
  );
}

/** How to read the leaderboard. */
export function LeaderboardKey() {
  return (
    <div className={`${classes.key} chrome`}>
      <span>
        <svg width="34" height="14" aria-hidden>
          <rect x="1" y="3" width="32" height="8" rx="4" className={classes.keyCapsule} />
          <circle cx="15" cy="7" r="4.5" className={classes.keyDot} />
        </svg>
        estimate and 90% CI
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
