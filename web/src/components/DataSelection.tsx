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
import { formatDate } from "../format";
import {
  MIN_BENCHMARKS,
  type PresetId,
  type PresetView,
  presetOptions,
  type Selection,
} from "../presets";
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
  if (preset === "general") {
    return (
      <>Every benchmark in the index. Pick a domain to see how models do on its benchmarks alone.</>
    );
  }
  if (preset === "cyber") {
    const cyber = site.latest.cyber;
    return (
      <>
        Epoch AI's own published Cyber ECI, shown as Epoch's numbers: a separate joint fit with{" "}
        {view.benchmarks.length} cyber benchmarks that Epoch updates less often than the general
        index, so it isn't refit here. Source:{" "}
        <Anchor href={cyber?.scores.url}>Epoch's eci_scores.csv</Anchor>, fetched{" "}
        {cyber ? formatDate(cyber.scores.fetched_at) : "—"}. Models with {minBenchmarks}+ of them.
      </>
    );
  }
  const list = view.benchmarks.join(", ");
  if (preset === "custom") {
    return view.benchmarks.length === 0 ? (
      <>Pick benchmarks above. Scores are refit in your browser.</>
    ) : (
      <>
        Models with {minBenchmarks}+ of: {list}. Refit in your browser with the domain method below,
        as point estimates (no intervals).
      </>
    );
  }
  const domains = site.latest.domains;
  return (
    <>
      Models with {minBenchmarks}+ of these {view.benchmarks.length} benchmarks, tagged by{" "}
      <Anchor href={domains?.hub_page}>Epoch's benchmark hub</Anchor>: {list}. Epoch's domain
      method: benchmark difficulty and slope stay at the general fit's and only each model's score
      is refit, so values sit on the general scale. 90% intervals from{" "}
      {site.latest.fit.bootstrap_samples * (domains?.resamples_per_draw ?? 10)} resamples.
    </>
  );
}

/** Which scores the page shows: General, a domain, Epoch's Cyber ECI or a custom set. */
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
            comboboxProps={{ withinPortal: true }}
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
        {value.preset !== "general" && (
          <Input.Wrapper label="Min. benchmarks" className={narrow ? classes.full : undefined}>
            <div>
              <SegmentedControl
                value={String(value.minBenchmarks)}
                onChange={(v) => onChange({ minBenchmarks: Number(v) })}
                data={MIN_BENCHMARKS.map(String)}
                fullWidth={narrow}
                size={narrow ? "md" : "sm"}
                aria-label="Minimum number of the selected benchmarks a model needs"
              />
            </div>
          </Input.Wrapper>
        )}
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
