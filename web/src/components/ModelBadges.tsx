import { Badge, CloseButton, Group, Menu, Text, Tooltip } from "@mantine/core";
import { NEW_WITHIN_DAYS } from "../config";
import type { Row } from "../data";
import { provisionalReason } from "../eligibility";
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

/** Marks a default variant shown because its model's higher-effort ones don't qualify. */
export function FallbackMark({ skipped }: { skipped: Row[] }) {
  const top = skipped[0];
  if (!top) return null;
  // Say the real reason (too few benchmarks or a missing area), from the shared rule.
  const coverageOnly = top.gaps.every((g) => g.startsWith("no "));
  const short =
    coverageOnly && top.missing_areas?.length
      ? `no ${top.missing_areas.join(", ").toLowerCase()}`
      : "too few";
  return (
    <Tooltip
      label={`${top.name} isn't ranked here (${top.gaps.join("; ")}), so the next effort level down stands for this model.`}
      multiline
      w={260}
    >
      <Badge size="sm" color="gray" variant="light" flex="none">
        {top.effort ? `${top.effort}: ${short}` : "fallback"}
      </Badge>
    </Tooltip>
  );
}

/** Marks a variant drawn although it misses the board's requirement (eligibility.ts). */
export function ProvisionalMark({ row }: { row: Row }) {
  return (
    <Tooltip label={provisionalReason(row)} multiline w={280}>
      <Badge size="sm" color="gray" variant="outline" bd="1px dashed" flex="none">
        provisional
      </Badge>
    </Tooltip>
  );
}

/** "+N": the model's other variants, each one click from being added to the chart. */
export function VariantsMenu({
  row,
  others,
  shown,
  onAdd,
}: {
  row: Row;
  others: Row[];
  /** Names already on the chart. */
  shown: Set<string>;
  onAdd: (name: string) => void;
}) {
  if (others.length === 0) return null;
  return (
    <Menu position="bottom-start" withinPortal width={300}>
      <Menu.Target>
        <Badge
          component="button"
          size="sm"
          variant="default"
          flex="none"
          style={{ cursor: "pointer" }}
          aria-label={`Other variants of ${row.group}`}
        >
          +{others.length}
        </Badge>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Add a variant of {row.group}</Menu.Label>
        {others.map((r) => (
          <Menu.Item
            key={r.name}
            disabled={shown.has(r.name)}
            onClick={() => onAdd(r.name)}
            rightSection={
              <Text size="xs" c="dimmed" className="num">
                {r.eci.toFixed(1)} · {r.benchmarks} bm
              </Text>
            }
          >
            {r.effort ?? r.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** Marks a result taken from a run at an unrecorded thinking setting (`version`). */
export function BorrowedTag({ version }: { version: string }) {
  return (
    <Tooltip
      label={`Run as ${version}, at an unrecorded thinking setting (usually the provider's default). It fills a benchmark this variant has no result of its own for.`}
      multiline
      w={280}
    >
      <Badge size="xs" color="violet" variant="light" flex="none">
        borrowed
      </Badge>
    </Tooltip>
  );
}

/** Marks a variant whose score includes borrowed results, with how many. */
export function BorrowedMark({ row }: { row: Pick<Row, "borrowed" | "group"> }) {
  if (row.borrowed === 0) return null;
  return (
    <Tooltip
      label={`${row.borrowed} of the benchmarks behind its general ECI come from ${row.group} runs at an unrecorded thinking setting, where this variant has no result of its own.`}
      multiline
      w={280}
    >
      <Badge size="sm" color="violet" variant="light" flex="none">
        {row.borrowed} borrowed
      </Badge>
    </Tooltip>
  );
}

export function ModelBadges({ row }: { row: Row }) {
  if (!row.isNew && row.borrowed === 0) return null;
  return (
    <Group gap={6}>
      {row.isNew && <NewMark />}
      <BorrowedMark row={row} />
    </Group>
  );
}

/** On phones the "new" mark is a dot, so rows stay one line tall. */
export function MarkDots({ row }: { row: Row }) {
  if (!row.isNew) return null;
  return (
    <Tooltip label="new">
      <span className={classes.dots} role="img" aria-label="new">
        <span className={classes.newDot} />
      </span>
    </Tooltip>
  );
}

/** Key entry for the phone mark. */
export function MarkDotsKey() {
  return (
    <span>
      <span className={classes.newDot} />
      new
    </span>
  );
}
