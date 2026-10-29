import { ColorSwatch, Group, MultiSelect, Paper, Stack, Text } from "@mantine/core";
import { useElementSize, useMediaQuery } from "@mantine/hooks";
import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { FitData, Row } from "../data";
import { niceTicks } from "../scale";

const MAX_PICKED = 5;
const COLORS = ["violet", "teal", "orange", "blue", "pink"].map(
  (c) => `var(--mantine-color-${c}-filled)`,
);
/** Benchmarks need this many results to be a default pick. */
const MIN_RESULTS = 30;

interface Dot {
  x: number;
  y: number;
  model: string;
  benchmark: string;
}

/** Three well-populated benchmarks spread over the difficulty range. */
export function defaultBenchmarks(fit: FitData): string[] {
  const counts = new Map<number, number>();
  for (const [, b] of fit.results) counts.set(b, (counts.get(b) ?? 0) + 1);
  const pool = fit.benchmarks
    .filter((_, i) => (counts.get(i) ?? 0) >= MIN_RESULTS)
    .sort((a, b) => a.edi - b.edi);
  const picks = [0.25, 0.6, 0.9].map((q) => pool[Math.floor(q * (pool.length - 1))]?.name);
  return [...new Set(picks.filter((n): n is string => n !== undefined))];
}

function DotTooltip({ active, payload }: { active?: boolean; payload?: { payload: Dot }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p || !("model" in p)) return null;
  return (
    <Paper withBorder shadow="md" radius="md" p="xs">
      <Text size="sm" fw={700}>
        {p.model}
      </Text>
      <Text size="xs" c="dimmed" className="num">
        {p.benchmark}: {Math.round(p.y * 100)}% at ECI {p.x.toFixed(1)}
      </Text>
    </Paper>
  );
}

/**
 * Per benchmark, the fitted curve of expected score against ECI, with every model's actual
 * result behind it: what an ECI value means in concrete benchmark terms.
 */
export function Interpreting({
  fit,
  rows,
  value,
  onChange,
}: {
  fit: FitData;
  rows: Row[];
  value: string[];
  onChange: (names: string[]) => void;
}) {
  const { ref, width } = useElementSize();
  const narrow = useMediaQuery("(max-width: 48em)") ?? false;
  const eciOf = useMemo(() => new Map(rows.map((r) => [r.name, r.general_eci])), [rows]);
  const picked = value
    .map((name) => fit.benchmarks.find((b) => b.name === name))
    .filter((b) => b !== undefined);

  const dots = picked.map((b) => {
    const index = fit.benchmarks.indexOf(b);
    return fit.results.flatMap(([m, bi, perf]): Dot[] => {
      const model = fit.models[m]?.name;
      const x = model === undefined ? undefined : eciOf.get(model);
      return bi === index && model && x != null ? [{ x, y: perf, model, benchmark: b.name }] : [];
    });
  });
  const xs = dots.flat().map((d) => d.x);
  const ticks = niceTicks(
    Math.min(...xs, ...picked.map((b) => b.edi - 2 / b.slope)),
    Math.max(...xs, ...picked.map((b) => b.edi + 2 / b.slope)),
    4,
  );
  const lo = ticks[0] ?? 80;
  const hi = ticks.at(-1) ?? 180;
  const curves = picked.map((b) =>
    Array.from({ length: 121 }, (_, i) => {
      const x = lo + ((hi - lo) * i) / 120;
      return { x, y: 1 / (1 + Math.exp(-b.slope * (x - b.edi))) };
    }),
  );
  const tick = { fill: "var(--mantine-color-dimmed)", fontSize: narrow ? 11 : 12 };

  return (
    <Stack gap="md">
      <MultiSelect
        label="Benchmarks"
        description={`Up to ${MAX_PICKED}`}
        data={[...fit.benchmarks].sort((a, b) => a.name.localeCompare(b.name)).map((b) => b.name)}
        value={value}
        onChange={onChange}
        maxValues={MAX_PICKED}
        searchable
        clearable
        hidePickedOptions
        size={narrow ? "md" : "sm"}
        maw={720}
      />
      <div ref={ref}>
        {width > 0 && picked.length > 0 && (
          <ComposedChart
            width={width}
            height={narrow ? 320 : 420}
            margin={{ top: 10, right: narrow ? 8 : 20, bottom: 8, left: 0 }}
          >
            <CartesianGrid stroke="var(--eci-grid)" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[lo, hi]}
              ticks={ticks}
              allowDataOverflow
              tick={tick}
              tickLine={false}
              tickMargin={8}
              axisLine={{ stroke: "var(--eci-axis)" }}
              height={narrow ? 46 : 50}
              label={{
                value: "ECI (each dot: a model's general ECI)",
                position: "insideBottom",
                offset: 0,
                fill: "var(--mantine-color-dimmed)",
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              width={narrow ? 46 : 58}
              tick={tick}
              tickLine={false}
              tickMargin={6}
              axisLine={{ stroke: "var(--eci-axis)" }}
              label={{
                value: "Score",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: { textAnchor: "middle" },
                fill: "var(--mantine-color-dimmed)",
                fontSize: 12,
              }}
            />
            <Tooltip content={<DotTooltip />} wrapperStyle={{ userSelect: "none" }} />
            {picked.map((b, i) => (
              <Scatter
                key={`dots-${b.name}`}
                data={dots[i]}
                fill={COLORS[i]}
                fillOpacity={0.35}
                isAnimationActive={false}
                shape="circle"
              />
            ))}
            {picked.map((b, i) => (
              <Line
                key={`curve-${b.name}`}
                data={curves[i]}
                dataKey="y"
                dot={false}
                activeDot={false}
                stroke={COLORS[i]}
                strokeWidth={3}
                isAnimationActive={false}
                tooltipType="none"
              />
            ))}
          </ComposedChart>
        )}
        {picked.length === 0 && (
          <Text c="dimmed" py="xl" ta="center">
            Pick a benchmark to see its curve.
          </Text>
        )}
      </div>
      <Group gap="xs" className="chrome">
        {picked.map((b, i) => (
          <Group key={b.name} gap={6} wrap="nowrap" className="chrome">
            <ColorSwatch color={COLORS[i] ?? "gray"} size={12} withShadow={false} />
            <Text size="sm">
              {b.name}{" "}
              <Text span c="dimmed" size="sm" className="num">
                · 50% at ECI {b.edi.toFixed(0)}
              </Text>
            </Text>
          </Group>
        ))}
      </Group>
    </Stack>
  );
}
