import { Badge, CloseButton, Group, Menu, Text, Tooltip } from "@mantine/core";
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

/** Marks a default variant shown because its model's higher-effort ones are too thin. */
export function FallbackMark({ skipped, min }: { skipped: Row[]; min: number }) {
  const top = skipped[0];
  if (!top) return null;
  const count = `${top.benchmarks} benchmark${top.benchmarks === 1 ? "" : "s"}`;
  return (
    <Tooltip
      label={`${top.name} has only ${count}, fewer than the minimum of ${min}, so the next effort level down stands for this model.`}
      multiline
      w={260}
    >
      <Badge size="sm" color="gray" variant="light" flex="none">
        {top.effort ? `${top.effort}: too few` : "fallback"}
      </Badge>
    </Tooltip>
  );
}

/** Marks a variant with fewer benchmarks than the minimum: listed, but not ranked. */
export function ThinMark({ row, min }: { row: Row; min: number }) {
  return (
    <Tooltip label={`Fewer than ${min} benchmarks: listed, but not ranked`}>
      <Badge size="sm" color="gray" variant="outline" flex="none">
        {row.benchmarks} bm
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
    <Menu position="bottom-start" withinPortal shadow="md" width={300}>
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

export function ModelBadges({ row }: { row: Row }) {
  if (!row.isNew) return null;
  return (
    <Group gap={6}>
      <NewMark />
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
