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
import type { Row } from "../data";
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

/** Who leads, honestly: the share of bootstrap draws each variant ranks first in. */
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
  const title = contenders.length > 1 ? `${contenders.length} variants could be #1` : "A clear #1";
  return (
    <Block title="Who is #1?">
      <Text fw={800} size="lg" lh={1.25} mb={4}>
        {title}
      </Text>
      <Text size="sm" c="dimmed" mb="sm">
        Share of the bootstrap draws in which each variant ranks first among those with enough
        benchmarks, and its 90% rank range. Variants of one model compete here too.
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
            Every other variant: {percent(rest)}
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
        Over every ranked variant, including older models and other effort levels hidden from the
        leaderboard.
      </Text>
      <Stack gap={8}>
        {[...best.values()].slice(0, LAB_ROWS).map((r) => (
          <ModelLine key={r.lab} row={r} value={r.eci.toFixed(1)} />
        ))}
      </Stack>
    </Block>
  );
}

/** The side panel next to the leaderboard. Always computed over every ranked variant. */
export function Insights({ rows, isGeneral }: { rows: Row[]; isGeneral: boolean }) {
  return (
    <Stack gap="xl" className={classes.panel}>
      {isGeneral && <WhoIsFirst rows={rows} />}
      <BestPerLab rows={rows} isGeneral={isGeneral} />
    </Stack>
  );
}
