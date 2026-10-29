import {
  ColorSwatch,
  darken,
  Group,
  isLightColor,
  lighten,
  Progress,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import type { ReactNode } from "react";
import type { Row, Snapshot } from "../data";
import { formatRange } from "../format";
import classes from "./Insights.module.css";
import { LabLogo, useLabColor } from "./LabLogo";
import { ModelLink } from "./ModelLink";

const LAB_ROWS = 7;
/** Segments narrower than this many pixels are left unlabelled; the list below has them. */
const MIN_LABEL_PX = 44;

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={classes.block}>
      <Text className={classes.eyebrow}>{title}</Text>
      {children}
    </div>
  );
}

function ModelLine({ row, value, swatch }: { row: Row; value: ReactNode; swatch?: string }) {
  return (
    <div className={classes.line}>
      <Group gap={8} wrap="nowrap" miw={0} className={classes.who}>
        {swatch && <ColorSwatch color={swatch} size={10} withShadow={false} />}
        <LabLogo lab={row.lab} size={16} />
        <Text size="sm" fw={600} className={classes.name}>
          <ModelLink name={row.name} />
        </Text>
      </Group>
      <Text size="sm" className={`num ${classes.value}`} c="dimmed">
        {value}
      </Text>
    </div>
  );
}

const percent = (share: number) => `${(share * 100).toFixed(share >= 0.995 ? 0 : 1)}%`;

/** Who leads, honestly: the share of bootstrap refits each model ranks first in. */
function WhoIsFirst({ rows }: { rows: Row[] }) {
  const colorOf = useLabColor();
  const { ref, width } = useElementSize();
  const contenders = rows
    .filter((r) => r.tiedFirst)
    .sort((a, b) => (b.p_first ?? 0) - (a.p_first ?? 0));
  if (contenders.length === 0) return null;
  const rest = Math.max(0, 1 - contenders.reduce((n, r) => n + (r.p_first ?? 0), 0));
  // A lab's second and third contender get a darker, then lighter, shade of its colour.
  const seen = new Map<string, number>();
  const segmentColors = contenders.map((r) => {
    const repeat = seen.get(r.lab) ?? 0;
    seen.set(r.lab, repeat + 1);
    const base = colorOf(r.lab);
    return repeat === 0 ? base : repeat % 2 ? darken(base, 0.35) : lighten(base, 0.35);
  });
  const title = contenders.length > 1 ? `${contenders.length} models could be #1` : "A clear #1";
  return (
    <Block title="Who is #1?">
      <Text fw={800} size="lg" lh={1.25} mb={4}>
        {title}
      </Text>
      <Text size="sm" c="dimmed" mb="sm">
        Share of the bootstrap refits in which each model ranks first, and its 90% rank range.
      </Text>
      <div ref={ref}>
        <Progress.Root size={24} radius="xl" mb="sm">
          {contenders.map((r, i) => {
            const color = segmentColors[i] ?? colorOf(r.lab);
            const share = r.p_first ?? 0;
            return (
              <Tooltip key={r.name} label={`${r.name}: ${percent(share)}`}>
                <Progress.Section
                  value={share * 100}
                  color={color}
                  style={i > 0 ? { borderLeft: "2px solid var(--eci-hero-surface)" } : undefined}
                >
                  {share * width >= MIN_LABEL_PX && (
                    <Progress.Label c={isLightColor(color) ? "dark.9" : "white"} fz={12}>
                      {Math.round(share * 100)}%
                    </Progress.Label>
                  )}
                </Progress.Section>
              </Tooltip>
            );
          })}
        </Progress.Root>
      </div>
      <Stack gap={8}>
        {contenders.map((r, i) => (
          <ModelLine
            key={r.name}
            row={r}
            swatch={segmentColors[i]}
            value={`${percent(r.p_first ?? 0)} · rank ${formatRange(r.rank_low ?? 1, r.rank_high ?? 1)}`}
          />
        ))}
        {rest >= 0.0005 && (
          <Text size="sm" c="dimmed">
            Every other model: {percent(rest)}
          </Text>
        )}
      </Stack>
    </Block>
  );
}

function BestPerLab({ rows, isGeneral }: { rows: Row[]; isGeneral: boolean }) {
  const best = new Map<string, Row>();
  for (const r of rows) if (!best.has(r.lab) && r.lab !== "Unknown") best.set(r.lab, r);
  return (
    <Block title={isGeneral ? "Best model per lab" : "Best per lab in this selection"}>
      <Text size="sm" c="dimmed" mb="xs">
        Over every model, including older ones hidden from the leaderboard.
      </Text>
      <Stack gap={8}>
        {[...best.values()].slice(0, LAB_ROWS).map((r) => (
          <ModelLine key={r.lab} row={r} value={r.eci.toFixed(1)} />
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
      <Text size="sm" c="dimmed" mb="xs">
        Not yet published by Epoch AI. Fewer benchmarks mean wider intervals.
      </Text>
      <Stack gap={8}>
        {previews.map((r) => (
          <ModelLine key={r.name} row={r} value={`${r.eci.toFixed(1)} · ${r.benchmarks} bm`} />
        ))}
      </Stack>
    </Block>
  );
}

function Agreement({ drift, total }: { drift: Snapshot["drift"]; total: number }) {
  const only = total - drift.shared_models;
  return (
    <Block title="Agreement with Epoch">
      <Text size="sm" className={classes.prose}>
        Mean gap{" "}
        <Text span fw={800} className="num">
          {drift.mean_abs.toFixed(2)}
        </Text>{" "}
        ECI, largest {drift.max_abs.toFixed(2)}, over the {drift.shared_models} of {total} models
        Epoch has published{only > 0 ? ` (the other ${only} are scored here first)` : ""}.
      </Text>
    </Block>
  );
}

/** The side panel next to the leaderboard. Always computed over all models. */
export function Insights({
  rows,
  general,
  snapshot,
  isGeneral,
}: {
  rows: Row[];
  general: Row[];
  snapshot: Snapshot;
  isGeneral: boolean;
}) {
  return (
    <Stack gap="xl" className={classes.panel}>
      {isGeneral && <WhoIsFirst rows={rows} />}
      {isGeneral && <NotOnEpoch rows={rows} />}
      <BestPerLab rows={rows} isGeneral={isGeneral} />
      <Agreement drift={snapshot.drift} total={general.length} />
    </Stack>
  );
}
