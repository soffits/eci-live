import { Badge, CloseButton, Group, Tooltip } from "@mantine/core";
import { NEW_WITHIN_DAYS } from "../config";
import type { Row } from "../data";

export function NewMark() {
  return (
    <Tooltip label={`Released in the ${NEW_WITHIN_DAYS} days before this snapshot`}>
      <Badge size="sm" variant="default" tt="none">
        new
      </Badge>
    </Tooltip>
  );
}

/** Marks a model the user added to the chart, with a button to take it off again. */
export function AddedMark({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <Badge
      size="sm"
      variant="light"
      color="blue"
      c="var(--mantine-color-text)"
      tt="none"
      pr={2}
      rightSection={
        <CloseButton size="xs" onClick={onRemove} aria-label={`Remove ${name} from the chart`} />
      }
    >
      added
    </Badge>
  );
}

/** Marks a model this refit scores but Epoch AI hasn't published, with its evidence base. */
export function PreviewMark({ row, compact = false }: { row: Row; compact?: boolean }) {
  return (
    <Tooltip
      label={`Epoch AI hasn't published an ECI for this model yet. This refit rests on ${row.benchmarks} benchmarks.`}
      multiline
      w={260}
    >
      <Badge
        size="sm"
        variant="light"
        color="violet"
        c="var(--mantine-color-text)"
        tt="none"
        bd="1px dashed var(--mantine-color-violet-filled)"
      >
        {compact ? "Not on Epoch" : `Not on Epoch yet · ${row.benchmarks} benchmarks`}
      </Badge>
    </Tooltip>
  );
}

export function ModelBadges({ row }: { row: Row }) {
  if (!row.isNew && row.onEpoch) return null;
  return (
    <Group gap={6}>
      {row.isNew && <NewMark />}
      {!row.onEpoch && <PreviewMark row={row} />}
    </Group>
  );
}
