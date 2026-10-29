import { Box, Group, Input, MultiSelect, RangeSlider, SegmentedControl, Text } from "@mantine/core";
import { type Filters, monthLabel, type WeightsFilter } from "../filters";
import { LabLogo } from "./LabLogo";

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
  labs: string[];
  bounds: [number, number];
  shown: number;
  total: number;
}

/** Filters shared by the leaderboard, timeline and table. */
export function FilterBar({ value, onChange, labs, bounds, shown, total }: Props) {
  return (
    <Group gap="lg" align="flex-end" wrap="wrap">
      <Box>
        <Input.Label display="block">Weights</Input.Label>
        <SegmentedControl<WeightsFilter>
          value={value.weights}
          onChange={(weights) => onChange({ ...value, weights })}
          radius="xl"
          data={[
            { value: "all", label: "All" },
            { value: "open", label: "Open" },
            { value: "closed", label: "Closed" },
          ]}
        />
      </Box>
      <MultiSelect
        label="Labs"
        placeholder={value.labs.length ? undefined : "All labs"}
        data={labs}
        value={value.labs}
        onChange={(selected) => onChange({ ...value, labs: selected })}
        searchable
        clearable
        radius="xl"
        miw={220}
        style={{ flex: "1 1 220px" }}
        renderOption={({ option }) => (
          <Group gap={8} wrap="nowrap">
            <LabLogo lab={option.value} size={16} />
            <Text size="sm">{option.value}</Text>
          </Group>
        )}
      />
      <Box style={{ flex: "2 1 260px" }} pb={6}>
        <Input.Label display="block" mb={8}>
          Released {monthLabel(value.months[0])} – {monthLabel(value.months[1])}
        </Input.Label>
        <RangeSlider
          min={bounds[0]}
          max={bounds[1]}
          minRange={0}
          value={value.months}
          onChange={(months) => onChange({ ...value, months })}
          label={monthLabel}
          aria-label="Release date range"
        />
      </Box>
      <Text size="sm" c="dimmed" pb={8}>
        {shown} of {total} models
      </Text>
    </Group>
  );
}
