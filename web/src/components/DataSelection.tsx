import {
  Anchor,
  Group,
  Input,
  MultiSelect,
  SegmentedControl,
  Select,
  Spoiler,
  Stack,
  Text,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { FitData, SiteData } from "../data";
import {
  MIN_BENCHMARKS,
  type PresetId,
  type PresetView,
  presetOptions,
  type Selection,
} from "../presets";
import { DROPDOWN } from "../theme";
import classes from "./DataSelection.module.css";

/** Custom-selection options grouped by each benchmark's first domain tag. */
function benchmarkGroups(fit: FitData): { group: string; items: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const b of fit.benchmarks) {
    const group = b.domains[0] ?? "Untagged";
    groups.set(group, [...(groups.get(group) ?? []), b.name]);
  }
  return [...groups]
    .sort(([a], [b]) => (a === "Untagged" ? 1 : b === "Untagged" ? -1 : a.localeCompare(b)))
    .map(([group, items]) => ({ group, items: items.sort((a, b) => a.localeCompare(b)) }));
}

function Note({
  site,
  view,
  selection,
}: {
  site: SiteData;
  view: PresetView;
  selection: Selection;
}) {
  const { preset, minBenchmarks } = selection;
  const samples = site.latest.fit.bootstrap_samples * site.latest.fit.resamples_per_draw;
  if (preset === "general") {
    return (
      <>
        Every benchmark in the index. Variants with {minBenchmarks}+ benchmarks are ranked; thinner
        ones are listed in the full table. Pick a domain to see how variants do on its benchmarks
        alone.
      </>
    );
  }
  const list = view.benchmarks.join(", ");
  if (preset === "custom") {
    return view.benchmarks.length === 0 ? (
      <>Pick benchmarks above. Scores are computed in your browser.</>
    ) : (
      <>
        Variants with {minBenchmarks}+ of: {list}. Scored in your browser with the same method as
        the domains, as point estimates (no intervals).
      </>
    );
  }
  const domains = site.latest.domains;
  return (
    <>
      Variants with {minBenchmarks}+ of these {view.benchmarks.length} benchmarks, tagged by{" "}
      <Anchor href={domains?.hub_page}>Epoch AI's benchmark hub</Anchor>: {list}. Benchmark
      difficulty and slope stay at the general index's and only each variant's score is fitted, so
      values sit on the general scale. 90% intervals from {samples.toLocaleString("en")} samples.
    </>
  );
}

/** Which scores the page shows: General, a domain or a custom set. */
export function DataSelection({
  site,
  fit,
  value,
  onChange,
  view,
}: {
  site: SiteData;
  fit: FitData | null;
  value: Selection;
  onChange: (next: Partial<Selection>) => void;
  view: PresetView;
}) {
  const narrow = useMediaQuery("(max-width: 48em)") ?? false;
  const options = presetOptions(site, fit);
  const setPreset = (preset: string | null) => preset && onChange({ preset: preset as PresetId });
  return (
    <Stack gap="sm" className={classes.panel}>
      <Group gap="md" align="flex-end" wrap={narrow ? "wrap" : "nowrap"}>
        {narrow ? (
          <Select
            label="Scores"
            data={options.map((o) => ({ value: o.value, label: o.label, disabled: o.disabled }))}
            value={value.preset}
            onChange={setPreset}
            allowDeselect={false}
            size="md"
            w="100%"
            comboboxProps={{ ...DROPDOWN, withinPortal: true }}
          />
        ) : (
          <Input.Wrapper label="Scores">
            <div>
              <SegmentedControl
                value={value.preset}
                onChange={setPreset}
                data={options.map((o) => ({
                  value: o.value,
                  label: o.short,
                  disabled: o.disabled,
                }))}
              />
            </div>
          </Input.Wrapper>
        )}
        <Input.Wrapper label="Min. benchmarks" className={narrow ? classes.full : undefined}>
          <div>
            <SegmentedControl
              value={String(value.minBenchmarks)}
              onChange={(v) => onChange({ minBenchmarks: Number(v) })}
              data={MIN_BENCHMARKS.map(String)}
              fullWidth={narrow}
              size={narrow ? "md" : "sm"}
              aria-label="Minimum number of the selected benchmarks a variant needs to be ranked"
            />
          </div>
        </Input.Wrapper>
      </Group>
      {value.preset === "custom" && fit && (
        <MultiSelect
          label="Benchmarks"
          placeholder={value.custom.length ? undefined : "Search benchmarks"}
          data={benchmarkGroups(fit)}
          value={value.custom}
          onChange={(custom) => onChange({ custom })}
          searchable
          clearable
          hidePickedOptions
          maxDropdownHeight={320}
          size={narrow ? "md" : "sm"}
          nothingFoundMessage="No benchmark matches"
        />
      )}
      <Spoiler maxHeight={narrow ? 66 : 48} showLabel="More" hideLabel="Less">
        <Text size="sm" c="dimmed" className={classes.note}>
          <Note site={site} view={view} selection={value} />
        </Text>
      </Spoiler>
    </Stack>
  );
}
