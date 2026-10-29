import { useMediaQuery } from "@mantine/hooks";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Row } from "../data";
import { ChartTooltip } from "./ChartTooltip";
import { LabLogo, useLabColor } from "./LabLogo";
import classes from "./Leaderboard.module.css";
import { ModelBadges } from "./ModelBadges";

const ROW_HEIGHT = 34;
const TICK_GAP = 12;

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
}

/** Top models by ECI as horizontal bars with 90% CI whiskers, logo and badges per row. */
export function Leaderboard({ rows }: { rows: Row[] }) {
  const narrow = useMediaQuery("(max-width: 36em)") ?? false;
  const colorOf = useLabColor();
  const byName = new Map(rows.map((r) => [r.name, r]));
  const data = rows.map((r) => ({
    ...r,
    ci: [r.eci - (r.ci_low ?? r.eci), (r.ci_high ?? r.eci) - r.eci],
  }));
  const low = Math.min(...rows.map((r) => r.ci_low ?? r.eci));
  const high = Math.max(...rows.map((r) => r.ci_high ?? r.eci));
  // ECI has no natural zero, so bars start well below the weakest model shown.
  // Recharts grows bars from 0 whenever 0 is inside the domain, so never go below it.
  const domain = [
    Math.max(0, Math.floor((low - (high - low) * 0.6) / 5) * 5),
    Math.ceil(high / 5) * 5,
  ];
  const labelWidth = narrow ? 128 : 320;

  const renderTick = ({ x = 0, y = 0, payload }: TickProps) => {
    const row = payload && byName.get(payload.value);
    if (!row) return null;
    return (
      <foreignObject
        x={Number(x) - labelWidth + TICK_GAP}
        y={Number(y) - ROW_HEIGHT / 2}
        width={labelWidth - TICK_GAP}
        height={ROW_HEIGHT}
      >
        <div className={classes.tick}>
          {!narrow && <ModelBadges row={row} />}
          <span className={classes.name} title={row.name}>
            {row.name}
          </span>
          <LabLogo lab={row.lab} size={18} />
        </div>
      </foreignObject>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={data.length * ROW_HEIGHT + 32}>
      <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid
          horizontal={false}
          strokeDasharray="3 3"
          stroke="var(--mantine-color-default-border)"
        />
        <XAxis
          type="number"
          domain={domain}
          allowDataOverflow
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 12 }}
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
        />
        <Bar dataKey="eci" radius={[0, 8, 8, 0]} barSize={ROW_HEIGHT - 10}>
          {data.map((r) => (
            <Cell key={r.name} fill={colorOf(r.lab)} />
          ))}
          <ErrorBar
            dataKey="ci"
            direction="x"
            width={8}
            strokeWidth={1.5}
            stroke="var(--mantine-color-text)"
          />
          <LabelList
            dataKey="eci"
            position="insideLeft"
            offset={10}
            formatter={(v) => Number(v).toFixed(1)}
            style={{ fill: "white", fontWeight: 700, fontSize: 13 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
