import { Group, MultiSelect, Text } from "@mantine/core";
import type { Row } from "../data";
import { LabLogo } from "./LabLogo";

interface Props {
  models: Row[];
  value: string[];
  onChange: (names: string[]) => void;
}

/** Search every scored model and add it to the leaderboard chart. */
export function ModelPicker({ models, value, onChange }: Props) {
  const byName = new Map(models.map((r) => [r.name, r]));
  return (
    <MultiSelect
      aria-label="Add models to the chart"
      placeholder={value.length ? undefined : "Add any model to the chart"}
      data={models.map((r) => r.name)}
      value={value}
      onChange={onChange}
      searchable
      clearable
      hidePickedOptions
      limit={40}
      maxDropdownHeight={300}
      nothingFoundMessage="No model matches"
      renderOption={({ option }) => {
        const row = byName.get(option.value);
        return (
          <Group gap={8} wrap="nowrap" w="100%">
            {row && <LabLogo lab={row.lab} size={14} />}
            <Text size="sm" truncate="end" style={{ flex: 1 }}>
              {option.value}
            </Text>
            {row && (
              <Text size="xs" c="dimmed" className="num">
                #{row.rank} · {row.eci.toFixed(1)}
              </Text>
            )}
          </Group>
        );
      }}
    />
  );
}
