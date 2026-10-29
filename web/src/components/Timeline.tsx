import { Group, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Row } from "../data";
import { ChartTooltip } from "./ChartTooltip";
import { LabLogo, useLabColor } from "./LabLogo";

type Dated = Row & { released: number };

/** Models that set a new ECI record when they were released, in date order. */
function frontier(rows: Dated[]): Dated[] {
  const records: Dated[] = [];
  for (const r of [...rows].sort((a, b) => a.released - b.released)) {
    const best = records.at(-1);
    if (!best || r.eci > best.eci) records.push(r);
  }
  return records;
}

const LABEL_IF_HELD_DAYS = 90;
const LEGEND_LABS = 10;

/** Names worth printing on the chart: records that stood for a while, and the current one. */
function lasting(records: Dated[]): Set<string> {
  return new Set(
    records
      .filter((r, i) => {
        const next = records[i + 1];
        return !next || next.released - r.released >= LABEL_IF_HELD_DAYS * 86_400_000;
      })
      .map((r) => r.name),
  );
}

const yearTick = (t: number) => String(new Date(t).getUTCFullYear());

/** ECI against release date, coloured by lab, with the record-setting frontier as a step line. */
export function Timeline({ rows }: { rows: Row[] }) {
  const narrow = useMediaQuery("(max-width: 36em)") ?? false;
  const colorOf = useLabColor();
  const dated = rows.filter((r): r is Dated => r.released !== null);
  const records = frontier(dated);
  const labelled = lasting(records);
  const years = [...new Set(dated.map((r) => new Date(r.released).getUTCFullYear()))];
  const ticks = years
    .map((y) => Date.UTC(y, 0, 1))
    .filter((t) => t >= Math.min(...dated.map((r) => r.released)));

  const counts = new Map<string, number>();
  for (const r of dated) counts.set(r.lab, (counts.get(r.lab) ?? 0) + 1);
  const legend = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, LEGEND_LABS);

  return (
    <Stack gap="sm">
      <ResponsiveContainer width="100%" height={narrow ? 360 : 460}>
        <ScatterChart margin={{ top: 24, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-default-border)" />
          <XAxis
            type="number"
            dataKey="released"
            domain={["dataMin", "dataMax"]}
            ticks={ticks}
            tickFormatter={yearTick}
            tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey="eci"
            domain={["auto", "auto"]}
            width={44}
            tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={dated} isAnimationActive={false}>
            {dated.map((r) => (
              <Cell key={r.name} fill={colorOf(r.lab)} fillOpacity={0.8} />
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
            {!narrow && (
              <LabelList
                dataKey="name"
                formatter={(name) => (labelled.has(String(name)) ? String(name) : "")}
                position="top"
                offset={10}
                width={200}
                style={{ fill: "var(--mantine-color-text)", fontSize: 11, fontWeight: 600 }}
              />
            )}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <Group gap="md" justify="center">
        {legend.map(([lab]) => (
          <Group key={lab} gap={6} wrap="nowrap">
            <LabLogo lab={lab} size={14} />
            <Text size="xs" c="dimmed">
              {lab}
            </Text>
          </Group>
        ))}
      </Group>
    </Stack>
  );
}
