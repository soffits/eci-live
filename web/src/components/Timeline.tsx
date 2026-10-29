import { Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import {
  CartesianGrid,
  Cell,
  LabelList,
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
import { useLabColor } from "./LabLogo";

type Dated = Row & { released: number };

const DAY_MS = 86_400_000;
const LABEL_SPACING_PX = 120;
const Y_AXIS_WIDTH = 40;
/** The y-axis starts near this quantile, so a few early outliers don't flatten the rest. */
const Y_FLOOR_QUANTILE = 0.02;
/** Room above the top model, as a share of the ECI span, for its frontier label. */
const Y_HEADROOM = 0.08;
/** Frontier labels sit this far up and to the left of their diamond. */
const LABEL_OFFSET_PX = 8;

/** Models that set a new ECI record when they were released, in date order. */
function frontier(rows: Dated[]): Dated[] {
  const records: Dated[] = [];
  for (const r of [...rows].sort((a, b) => a.released - b.released)) {
    const best = records.at(-1);
    if (!best || r.eci > best.eci) records.push(r);
  }
  return records;
}

/** Record holders to name on the chart, newest first, so labels never crowd each other. */
function labelled(records: Dated[], minGap: number): Set<string> {
  const names = new Set<string>();
  let last = Number.POSITIVE_INFINITY;
  for (const r of [...records].reverse()) {
    if (last - r.released >= minGap) {
      names.add(r.name);
      last = r.released;
    }
  }
  return names;
}

interface LabelProps {
  x?: number | string;
  y?: number | string;
  value?: unknown;
}

/** ECI against release date, coloured by lab, with the record-setting frontier as a step line. */
export function Timeline({ rows }: { rows: Row[] }) {
  const { ref, width } = useElementSize();
  const narrow = width > 0 && width < 600;
  const colorOf = useLabColor();
  const dated = rows.filter((r): r is Dated => r.released !== null);
  if (dated.length === 0) return <div ref={ref} />;

  const ecis = dated.map((r) => r.eci).sort((a, b) => a - b);
  const floor = ecis[Math.floor(Y_FLOOR_QUANTILE * (ecis.length - 1))] ?? 0;
  const top = ecis.at(-1) ?? 0;
  const yTicks = niceTicks(floor, top + Y_HEADROOM * (top - floor), 4);
  const yMin = yTicks[0] ?? floor;
  const shown = dated.filter((r) => r.eci >= yMin);
  const offScale = dated.length - shown.length;
  const records = frontier(shown);

  const times = dated.map((r) => r.released);
  const firstYear = new Date(Math.min(...times)).getUTCFullYear();
  const lastYear = new Date(Math.max(...times)).getUTCFullYear();
  const start = Date.UTC(firstYear, 0, 1);
  const end = Math.max(...times) + 20 * DAY_MS;
  const xTicks = Array.from({ length: lastYear - firstYear + 1 }, (_, i) =>
    Date.UTC(firstYear + i, 0, 1),
  );
  const plotWidth = Math.max(width - Y_AXIS_WIDTH - 32, 1);
  const names = labelled(records, ((end - start) * LABEL_SPACING_PX) / plotWidth);

  const renderLabel = ({ x = 0, y = 0, value }: LabelProps) => {
    const name = String(value);
    if (!names.has(name)) return null;
    // Nothing sits above and to the left of a record (it beat everything before it), so
    // the label goes there; only near the left edge does it flip to the right.
    const px = Number(x);
    const anchor = px < Y_AXIS_WIDTH + 70 ? "start" : "end";
    return (
      <text
        x={px + (anchor === "start" ? LABEL_OFFSET_PX : -LABEL_OFFSET_PX)}
        y={Number(y) - LABEL_OFFSET_PX}
        textAnchor={anchor}
        fill="var(--mantine-color-text)"
        fontSize={11}
        fontWeight={650}
        paintOrder="stroke"
        stroke="var(--eci-surface)"
        strokeWidth={4}
      >
        {name}
      </text>
    );
  };

  return (
    <div ref={ref}>
      {width > 0 && (
        <ScatterChart
          width={width}
          height={narrow ? 340 : 440}
          margin={{ top: 12, right: 16, bottom: 4, left: 0 }}
        >
          <CartesianGrid stroke="var(--mantine-color-default-border)" />
          <XAxis
            type="number"
            dataKey="released"
            domain={[start, end]}
            ticks={xTicks}
            tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
            tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            allowDataOverflow
          />
          <YAxis
            type="number"
            dataKey="eci"
            domain={[yMin, yTicks.at(-1) ?? 200]}
            ticks={yTicks}
            width={Y_AXIS_WIDTH}
            tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <ZAxis range={narrow ? [22, 22] : [40, 40]} />
          <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={shown} isAnimationActive={false}>
            {shown.map((r) => (
              <Cell
                key={r.name}
                fill={colorOf(r.lab)}
                fillOpacity={0.5}
                stroke={colorOf(r.lab)}
                strokeOpacity={0.9}
              />
            ))}
          </Scatter>
          <Scatter
            data={records}
            line={{ stroke: "var(--mantine-color-text)", strokeWidth: 2 }}
            lineJointType="stepAfter"
            shape="diamond"
            fill="var(--mantine-color-text)"
            isAnimationActive={false}
          >
            {!narrow && <LabelList dataKey="name" content={renderLabel} />}
          </Scatter>
        </ScatterChart>
      )}
      {offScale > 0 && (
        <Text size="xs" c="dimmed" ta="right">
          {offScale === 1 ? "1 model" : `${offScale} models`} below {yMin} not shown.
        </Text>
      )}
    </div>
  );
}
