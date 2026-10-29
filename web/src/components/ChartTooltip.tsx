import { Group, Paper, Stack, Text } from "@mantine/core";
import type { Row } from "../data";
import { formatCi, formatDate } from "../format";
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
        </Text>
        <Text size="sm">
          <Text span fw={800} ff="monospace">
            {row.eci.toFixed(1)}
          </Text>{" "}
          ECI{" "}
          <Text span c="dimmed" size="xs">
            {formatCi(row)}
          </Text>
        </Text>
        <Text size="xs" c="dimmed">
          {row.benchmarks} benchmarks
          {row.official_eci !== null && ` · Epoch: ${row.official_eci.toFixed(1)}`}
        </Text>
        <ModelBadges row={row} />
      </Stack>
    </Paper>
  );
}
