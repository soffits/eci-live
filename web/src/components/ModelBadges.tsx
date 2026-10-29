import { Text, Tooltip } from "@mantine/core";
import { NEW_WITHIN_DAYS } from "../config";
import type { Row } from "../data";
import classes from "./ModelBadges.module.css";

export function NewMark() {
  return (
    <Tooltip label={`Released in the ${NEW_WITHIN_DAYS} days before this snapshot`}>
      <span className={classes.new}>new</span>
    </Tooltip>
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
      <span className={classes.preview}>
        {compact
          ? `Not on Epoch · ${row.benchmarks} bm`
          : `Not on Epoch yet · ${row.benchmarks} benchmarks`}
      </span>
    </Tooltip>
  );
}

export function ModelBadges({ row }: { row: Row }) {
  if (!row.isNew && row.onEpoch) return null;
  return (
    <Text span className={classes.group}>
      {row.isNew && <NewMark />}
      {!row.onEpoch && <PreviewMark row={row} />}
    </Text>
  );
}
