import { Spoiler, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import {
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { Row } from "../data";
import { niceTicks } from "../scale";
import { ChartTooltip } from "./ChartTooltip";
import { useModelNav } from "./ModelLink";

export type View = "time" | "compute" | "domain";

interface Point {
  row: Row;
  name: string;
  x: number;
  y: number;
}

const NARROW_PX = 600;
/** The y-axis starts near this quantile, so a few early outliers don't flatten the rest. */
const Y_FLOOR_QUANTILE = 0.02;
/** Room above the top model, as a share of the span, for its label. */
const Y_HEADROOM = 0.08;
const LABEL_GAP_PX = 6;
const CHAR_PX = 6.4;
const DAY_MS = 86_400_000;

/** Points that set a new record along x, in x order: the frontier. */
export function frontier<T extends { x: number; y: number }>(points: T[]): T[] {
  const records: T[] = [];
  for (const p of [...points].sort((a, b) => a.x - b.x || b.y - a.y)) {
    const best = records.at(-1);
    if (!best || p.y > best.y) records.push(p);
  }
  return records;
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const power = (n: number) =>
  `10${String(n)
    .split("")
    .map((d) => (d === "-" ? "⁻" : SUPERSCRIPT[Number(d)]))
    .join("")}`;

function xAxisOf(view: View, points: Point[], narrow: boolean) {
  const xs = points.map((p) => p.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  if (view === "time") {
    const first = new Date(lo).getUTCFullYear();
    const last = new Date(hi).getUTCFullYear();
    // Gridlines every half year, labels on years; the axis ends at the next half-year line.
    const ticks: number[] = [];
    for (let y = first; y <= last + 1; y++) {
      for (const m of [0, 6]) {
        const t = Date.UTC(y, m, 1);
        if (t <= hi + 183 * DAY_MS) ticks.push(t);
      }
    }
    const end = ticks.at(-1) ?? hi;
    return {
      domain: [Date.UTC(first, 0, 1), Math.max(end, hi + 15 * DAY_MS)] as [number, number],
      ticks,
      format: (t: number) => {
        const d = new Date(t);
        if (d.getUTCMonth() !== 0) return narrow ? "" : "Jul";
        return String(d.getUTCFullYear());
      },
      label: "Release date",
    };
  }
  if (view === "compute") {
    // Whole powers of ten, with room so no point sits on the frame.
    const first = Math.floor(lo - 0.15);
    const last = Math.ceil(hi + 0.15);
    const ticks = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    return {
      domain: [first, last] as [number, number],
      ticks: narrow ? ticks.filter((t) => (t - first) % 2 === 0) : ticks,
      format: (t: number) => power(t),
      label: "Training compute (FLOP, log scale)",
    };
  }
  const ticks = niceTicks(lo, hi, 4);
  return {
    domain: [ticks[0] ?? lo, ticks.at(-1) ?? hi] as [number, number],
    ticks,
    format: (t: number) => String(t),
    label: "General ECI",
  };
}

/** Names worth labelling: the frontier, or for domain vs general the leaders and the
 * models furthest off the diagonal. */
function candidates(view: View, points: Point[], records: Point[]): Point[] {
  if (view !== "domain") return [...records].reverse();
  const top = [...points].sort((a, b) => b.y - a.y).slice(0, 4);
  const off = [...points].sort((a, b) => Math.abs(b.y - b.x) - Math.abs(a.y - a.x)).slice(0, 6);
  return [...new Set([...top, ...off])];
}

interface LabelProps {
  x?: number | string;
  y?: number | string;
  value?: unknown;
}

/**
 * The explore views: ECI against release date, training compute, or (for a domain
 * selection) the general ECI. Dots take the colour-by colour; on the time and compute views
 * the record-setting frontier is a stepped line of diamonds, named where labels don't collide.
 */
export function ExploreChart({
  rows,
  view,
  colorOf,
  frontierOnly,
  yLabel,
}: {
  rows: Row[];
  view: View;
  colorOf: (row: Row) => string;
  frontierOnly: boolean;
  yLabel: string;
}) {
  const { ref, width } = useElementSize();
  const narrow = width > 0 && width < NARROW_PX;
  const { open } = useModelNav();

  const xOf = (r: Row): number | null =>
    view === "time"
      ? r.released
      : view === "compute"
        ? r.training_compute_flop
          ? Math.log10(r.training_compute_flop)
          : null
        : r.general_eci;
  const all: Point[] = rows.flatMap((row) => {
    const x = xOf(row);
    return x === null ? [] : [{ row, name: row.name, x, y: row.eci }];
  });
  const missing = rows.filter((r) => xOf(r) === null);
  if (all.length === 0) {
    return (
      <div ref={ref}>
        <Text c="dimmed" py="xl" ta="center">
          No model in this selection can be placed on this view.
        </Text>
      </div>
    );
  }

  const ys = all.map((p) => p.y).sort((a, b) => a - b);
  const floor = ys[Math.floor(Y_FLOOR_QUANTILE * (ys.length - 1))] ?? 0;
  const top = ys.at(-1) ?? 0;
  const yLow = view === "domain" ? Math.min(floor, ...all.map((p) => p.x)) : floor;
  const yTicks = niceTicks(yLow, top + Y_HEADROOM * (top - yLow), 4);
  const yMin = yTicks[0] ?? floor;
  const inRange = all.filter((p) => p.y >= yMin);
  const offScale = all.length - inRange.length;
  const records = view === "domain" ? [] : frontier(inRange);
  const recordNames = new Set(records.map((p) => p.name));
  const dots = frontierOnly ? [] : inRange.filter((p) => !recordNames.has(p.name));
  const axis = xAxisOf(view, inRange, narrow);
  const yWidth = narrow ? 46 : 58;
  const margin = { top: 14, right: narrow ? 8 : 20, bottom: 8, left: 0 };
  const plotLeft = yWidth + margin.left;
  const plotRight = width - margin.right;

  // Labels are placed in render order and skipped where they would overlap one already
  // drawn or run off the plot.
  const wanted = new Set(candidates(view, inRange, records).map((p) => p.name));
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const placed: Box[] = [];
  // Recharts may render a label more than once; each name is decided once.
  const decided = new Map<string, Box | null>();
  const fontSize = narrow ? 10 : 11;
  const renderLabel = ({ x = 0, y = 0, value }: LabelProps) => {
    const name = String(value);
    if (!wanted.has(name)) return null;
    const px = Number(x);
    const py = Number(y);
    const w = name.length * (narrow ? CHAR_PX * 0.92 : CHAR_PX);
    const right = px - w - LABEL_GAP_PX < plotLeft;
    const x0 = right ? px + LABEL_GAP_PX : px - LABEL_GAP_PX - w;
    if (!decided.has(name)) {
      const box = { x0, x1: x0 + w, y0: py - LABEL_GAP_PX - fontSize, y1: py - LABEL_GAP_PX + 2 };
      const clash =
        box.x1 > plotRight ||
        box.y0 < 0 ||
        placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1);
      if (!clash) placed.push(box);
      decided.set(name, clash ? null : box);
    }
    const box = decided.get(name);
    if (!box) return null;
    return (
      <text
        x={right ? box.x0 : px - LABEL_GAP_PX}
        y={py - LABEL_GAP_PX}
        textAnchor={right ? "start" : "end"}
        fill="var(--mantine-color-text)"
        fontSize={fontSize}
        fontWeight={650}
        paintOrder="stroke"
        stroke="var(--eci-surface)"
        strokeWidth={4}
      >
        {name}
      </text>
    );
  };

  const openPoint = (p: { payload?: Point }) => p.payload && open(p.payload.name);
  const tick = { fill: "var(--mantine-color-dimmed)", fontSize: narrow ? 11 : 12 };
  const diagonal = view === "domain" && [Math.max(axis.domain[0], yMin), axis.domain[1]];

  return (
    <div ref={ref}>
      {width > 0 && (
        <ScatterChart width={width} height={narrow ? 360 : 460} margin={margin}>
          <CartesianGrid stroke="var(--eci-grid)" />
          <XAxis
            type="number"
            dataKey="x"
            domain={axis.domain}
            ticks={axis.ticks}
            tickFormatter={axis.format}
            tick={tick}
            tickLine={false}
            tickMargin={8}
            axisLine={{ stroke: "var(--eci-axis)" }}
            allowDataOverflow
            height={narrow ? 46 : 50}
            label={{
              value: axis.label,
              position: "insideBottom",
              offset: 0,
              fill: "var(--mantine-color-dimmed)",
              fontSize: 12,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[yMin, yTicks.at(-1) ?? 200]}
            ticks={yTicks}
            width={yWidth}
            tick={tick}
            tickLine={false}
            tickMargin={6}
            axisLine={{ stroke: "var(--eci-axis)" }}
            allowDataOverflow
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              offset: 10,
              style: { textAnchor: "middle" },
              fill: "var(--mantine-color-dimmed)",
              fontSize: 12,
            }}
          />
          <ZAxis range={narrow ? [26, 26] : [44, 44]} />
          <Tooltip
            content={({ active, payload }) => (
              <ChartTooltip
                active={active}
                payload={payload?.map((p) => ({ payload: (p.payload as Point).row }))}
              />
            )}
            cursor={{ strokeDasharray: "3 3" }}
            wrapperStyle={{ userSelect: "none" }}
          />
          {diagonal && (
            <ReferenceLine
              segment={[
                { x: diagonal[0], y: diagonal[0] },
                { x: diagonal[1], y: diagonal[1] },
              ]}
              stroke="var(--mantine-color-dimmed)"
              strokeDasharray="5 4"
              ifOverflow="hidden"
            />
          )}
          <Scatter data={dots} isAnimationActive={false} cursor="pointer" onClick={openPoint}>
            {dots.map((p) => (
              <Cell
                key={p.name}
                fill={colorOf(p.row)}
                fillOpacity={0.82}
                stroke="var(--eci-surface)"
                strokeWidth={1}
              />
            ))}
            {view === "domain" && <LabelList dataKey="name" content={renderLabel} />}
          </Scatter>
          {records.length > 0 && (
            <Scatter
              data={records}
              line={{ stroke: "var(--mantine-color-text)", strokeWidth: 1.5, strokeOpacity: 0.7 }}
              lineJointType="stepAfter"
              shape="diamond"
              isAnimationActive={false}
              cursor="pointer"
              onClick={openPoint}
            >
              {records.map((p) => (
                <Cell
                  key={p.name}
                  fill={colorOf(p.row)}
                  stroke="var(--mantine-color-text)"
                  strokeWidth={1.5}
                />
              ))}
              <LabelList dataKey="name" content={renderLabel} />
            </Scatter>
          )}
        </ScatterChart>
      )}
      {(offScale > 0 || missing.length > 0) && (
        <Text size="sm" c="dimmed" mt={6}>
          {offScale > 0 &&
            `${offScale === 1 ? "1 model" : `${offScale} models`} below ${yMin} not shown. `}
          {missing.length > 0 &&
            view === "compute" &&
            `${missing.length} of ${rows.length} models have no training-compute estimate in Epoch AI's data and are not plotted:`}
        </Text>
      )}
      {missing.length > 0 && view === "compute" && (
        <Spoiler maxHeight={44} showLabel="Show all" hideLabel="Show fewer" mt={2}>
          <Text size="sm" c="dimmed">
            {missing.map((r) => r.name).join(", ")}
          </Text>
        </Spoiler>
      )}
    </div>
  );
}
