import { Badge, CloseButton, Group, Tooltip } from "@mantine/core";
import { NEW_WITHIN_DAYS } from "../config";
import type { Row } from "../data";
import classes from "./ModelBadges.module.css";

export function NewMark() {
  return (
    <Tooltip label={`Released in the ${NEW_WITHIN_DAYS} days before this snapshot`}>
      <Badge size="sm" color="teal" flex="none">
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
      color="blue"
      flex="none"
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
      <Badge size="sm" color="violet" variant="outline" bd="1px dashed" flex="none">
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

/** On phones the "new" and "not on Epoch" marks are dots, so rows stay one line tall. */
export function MarkDots({ row }: { row: Row }) {
  if (!row.isNew && row.onEpoch) return null;
  const label = [row.isNew && "new", !row.onEpoch && "not on Epoch yet"].filter(Boolean).join(", ");
  return (
    <Tooltip label={label}>
      <span className={classes.dots} role="img" aria-label={label}>
        {row.isNew && <span className={classes.newDot} />}
        {!row.onEpoch && <span className={classes.previewDot} />}
      </span>
    </Tooltip>
  );
}

/** Key entries for the phone marks. */
export function MarkDotsKey() {
  return (
    <>
      <span>
        <span className={classes.newDot} />
        new
      </span>
      <span>
        <span className={classes.previewDot} />
        not on Epoch yet
      </span>
    </>
  );
}
