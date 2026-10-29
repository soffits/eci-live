import {
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Input,
  MultiSelect,
  RangeSlider,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { WEIGHTS } from "../config";
import { activeFilterCount, type Filters, monthLabel, type WeightsFilter } from "../filters";
import classes from "./FilterBar.module.css";
import { LabLogo } from "./LabLogo";

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
  labs: string[];
  bounds: [number, number];
  shown: number;
  total: number;
}

const WEIGHT_OPTIONS = [
  { value: "all", label: "All" },
  ...Object.entries(WEIGHTS).map(([value, w]) => ({ value, label: w.label })),
];

function Controls({ value, onChange, labs, bounds, stacked }: Props & { stacked: boolean }) {
  return (
    <>
      <Input.Wrapper label="Weights">
        <div>
          <SegmentedControl<WeightsFilter>
            value={value.weights}
            onChange={(weights) => onChange({ ...value, weights })}
            data={WEIGHT_OPTIONS as { value: WeightsFilter; label: string }[]}
            fullWidth={stacked}
            orientation={stacked ? "vertical" : "horizontal"}
            className={classes.control}
          />
        </div>
      </Input.Wrapper>
      <MultiSelect
        label="Labs"
        placeholder={value.labs.length ? undefined : "Every lab"}
        data={labs}
        value={value.labs}
        onChange={(selected) => onChange({ ...value, labs: selected })}
        searchable
        clearable
        className={classes.grow}
        renderOption={({ option }) => (
          <Group gap={8} wrap="nowrap">
            <LabLogo lab={option.value} size={16} />
            <Text size="sm">{option.value}</Text>
          </Group>
        )}
      />
      <Input.Wrapper
        label={`Released ${monthLabel(value.months[0])} – ${monthLabel(value.months[1])}`}
        className={classes.grow}
      >
        <Box className={classes.sliderBox}>
          <RangeSlider
            min={bounds[0]}
            max={bounds[1]}
            minRange={0}
            value={value.months}
            onChange={(months) => onChange({ ...value, months })}
            label={monthLabel}
            aria-label="Release date range"
            style={{ flex: 1 }}
          />
        </Box>
      </Input.Wrapper>
    </>
  );
}

/** Filters shared by the leaderboard, timeline and table: inline on wide screens, a sheet on phones. */
export function FilterBar(props: Props) {
  const narrow = useMediaQuery("(max-width: 48em)") ?? false;
  const [opened, { open, close }] = useDisclosure(false);
  const active = activeFilterCount(props.value, props.bounds);
  const count = (
    <Text size="sm" c="dimmed" className="num chrome" style={{ whiteSpace: "nowrap" }}>
      {props.shown} of {props.total} models
    </Text>
  );

  if (!narrow) {
    return (
      <Group gap="lg" align="flex-end" wrap="nowrap" className={classes.bar}>
        <Controls {...props} stacked={false} />
        <Box className={classes.countBox}>{count}</Box>
      </Group>
    );
  }
  return (
    <>
      <Group justify="space-between" wrap="nowrap">
        <Button
          variant="default"
          onClick={open}
          rightSection={
            active > 0 && (
              <Badge size="sm" circle>
                {active}
              </Badge>
            )
          }
        >
          Filters
        </Button>
        {count}
      </Group>
      <Drawer opened={opened} onClose={close} position="bottom" size="sheet" title="Filter models">
        <Stack gap="lg" pb="md">
          <Controls {...props} stacked />
          <Button onClick={close}>Show {props.shown} models</Button>
        </Stack>
      </Drawer>
    </>
  );
}
