import { Badge, Group, Tooltip } from "@mantine/core";
import { NEW_WITHIN_DAYS } from "../config";
import type { Row } from "../data";

export function ModelBadges({ row }: { row: Row }) {
  if (!row.isNew && row.onEpoch) return null;
  return (
    <Group gap={4} wrap="nowrap">
      {row.isNew && (
        <Tooltip label={`Released in the last ${NEW_WITHIN_DAYS} days`}>
          <Badge size="xs" variant="gradient" gradient={{ from: "pink", to: "orange", deg: 90 }}>
            New
          </Badge>
        </Tooltip>
      )}
      {!row.onEpoch && (
        <Tooltip label="Scored by this refit; Epoch AI hasn't published an ECI for it yet">
          <Badge size="xs" variant="light" color="violet">
            Not yet on Epoch
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}
