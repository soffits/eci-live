import { Group, Paper, Stack, Text } from "@mantine/core";
import type { Row } from "../data";
import { formatCi, formatDate, formatPercent, formatRange } from "../format";
import { LabLogo } from "./LabLogo";
import { ModelBadges } from "./ModelBadges";

/** Tooltip body shared by both charts; Recharts passes the hovered datum(s). */
export function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <Paper withBorder shadow="md" radius="md" p="sm" maw={280}>
      <Stack gap={4}>
        <Group gap={6} wrap="nowrap">
          <LabLogo lab={row.lab} size={16} />
          <Text fw={700} size="sm">
            {row.name}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          {row.lab} · released {formatDate(row.released)}
          {row.effort ? ` · effort: ${row.effort}` : ""}
        </Text>
        <Text size="sm">
          <Text span fw={800} className="num">
            {row.eci.toFixed(1)}
          </Text>{" "}
          {row.general_eci === row.eci ? "ECI" : "in this selection"}{" "}
          <Text span c="dimmed" size="xs">
            {formatCi(row)}
          </Text>
        </Text>
        {row.rank_low !== null && row.rank_high !== null && (
          <Text size="xs" c="dimmed">
            Rank {formatRange(row.rank_low, row.rank_high)} (90%)
            {row.p_first ? ` · #1 in ${formatPercent(row.p_first)} of draws` : ""}
          </Text>
        )}
        {row.general_eci === row.eci ? (
          <Text size="xs" c="dimmed">
            {row.benchmarks} benchmarks{row.rank === null ? " (too few to rank)" : ""}
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            {row.benchmarks} benchmarks in this selection · general ECI{" "}
            {row.general_eci === null ? "none" : row.general_eci.toFixed(1)}
          </Text>
        )}
        <ModelBadges row={row} />
        <Text size="xs" c="dimmed" fs="italic">
          Click for its detail page
        </Text>
      </Stack>
    </Paper>
  );
}
