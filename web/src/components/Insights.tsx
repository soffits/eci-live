import { Group, Progress, Stack, Text, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";
import type { Row, Snapshot } from "../data";
import { formatPercent, formatRange } from "../format";
import classes from "./Insights.module.css";
import { LabLogo, useLabColor } from "./LabLogo";

const LAB_ROWS = 7;

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={classes.block}>
      <Text className={classes.eyebrow}>{title}</Text>
      {children}
    </div>
  );
}

function ModelLine({ row, value }: { row: Row; value: ReactNode }) {
  return (
    <Group gap={8} wrap="nowrap" justify="space-between">
      <Group gap={8} wrap="nowrap" miw={0}>
        <LabLogo lab={row.lab} size={16} />
        <Text size="sm" fw={600} truncate="end">
          {row.name}
        </Text>
      </Group>
      <Text size="sm" className="num" c="dimmed" style={{ flex: "none" }}>
        {value}
      </Text>
    </Group>
  );
}

/** Who leads, honestly: the share of bootstrap refits each model ranks first in. */
function WhoIsFirst({ rows }: { rows: Row[] }) {
  const colorOf = useLabColor();
  const contenders = rows
    .filter((r) => r.tiedFirst)
    .sort((a, b) => (b.p_first ?? 0) - (a.p_first ?? 0));
  if (contenders.length === 0) return null;
  const title =
    contenders.length > 1 ? `${contenders.length}-way statistical tie for #1` : "Clear #1";
  return (
    <Block title="Who is #1?">
      <Text fw={800} size="lg" lh={1.25} mb={4}>
        {title}
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        Share of the bootstrap refits in which each model ranks first.
      </Text>
      <Progress.Root size={14} radius="xl" mb="sm">
        {contenders.map((r, i) => (
          <Tooltip key={r.name} label={`${r.name}: ${formatPercent(r.p_first ?? 0)}`}>
            <Progress.Section
              value={(r.p_first ?? 0) * 100}
              color={colorOf(r.lab)}
              style={i > 0 ? { borderLeft: "2px solid var(--eci-hero-surface)" } : undefined}
            />
          </Tooltip>
        ))}
      </Progress.Root>
      <Stack gap={6}>
        {contenders.map((r) => (
          <ModelLine
            key={r.name}
            row={r}
            value={`${formatPercent(r.p_first ?? 0)} · rank ${formatRange(r.rank_low ?? 1, r.rank_high ?? 1)}`}
          />
        ))}
      </Stack>
    </Block>
  );
}

function BestPerLab({ rows }: { rows: Row[] }) {
  const colorOf = useLabColor();
  const best = new Map<string, Row>();
  for (const r of rows) if (!best.has(r.lab) && r.lab !== "Unknown") best.set(r.lab, r);
  return (
    <Block title="Best model per lab">
      <Stack gap={6}>
        {[...best.values()].slice(0, LAB_ROWS).map((r) => (
          <div key={r.lab} className={classes.labRow} style={{ borderColor: colorOf(r.lab) }}>
            <ModelLine row={r} value={r.eci.toFixed(1)} />
          </div>
        ))}
      </Stack>
    </Block>
  );
}

function NotOnEpoch({ rows }: { rows: Row[] }) {
  const previews = rows.filter((r) => !r.onEpoch);
  if (previews.length === 0) return null;
  return (
    <Block title="Scored here first">
      <Text size="xs" c="dimmed" mb="xs">
        Not yet published by Epoch AI. Fewer benchmarks mean wider intervals.
      </Text>
      <Stack gap={6}>
        {previews.map((r) => (
          <ModelLine key={r.name} row={r} value={`${r.eci.toFixed(1)} · ${r.benchmarks} bm`} />
        ))}
      </Stack>
    </Block>
  );
}

function Agreement({ drift }: { drift: Snapshot["drift"] }) {
  return (
    <Block title="Agreement with Epoch">
      <Text size="sm">
        Mean gap{" "}
        <Text span fw={800} className="num">
          {drift.mean_abs.toFixed(2)}
        </Text>{" "}
        ECI, largest {drift.max_abs.toFixed(2)}, over {drift.shared_models} models Epoch has
        published.
      </Text>
    </Block>
  );
}

/** The side panel next to the leaderboard. Always computed over all models. */
export function Insights({ rows, snapshot }: { rows: Row[]; snapshot: Snapshot }) {
  return (
    <Stack gap="lg">
      <WhoIsFirst rows={rows} />
      <NotOnEpoch rows={rows} />
      <BestPerLab rows={rows} />
      <Agreement drift={snapshot.drift} />
    </Stack>
  );
}
