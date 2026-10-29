import {
  ActionIcon,
  Anchor,
  Box,
  Container,
  Divider,
  Grid,
  Group,
  Input,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  createSerializer,
  parseAsBoolean,
  parseAsInteger,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { type ReactNode, use, useMemo, useState } from "react";
import classes from "./App.module.css";
import { COLOR_BY, type ColorBy, groupColor, groupKey } from "./colors";
import { About } from "./components/About";
import { ColorKey } from "./components/ColorKey";
import { DataSelection } from "./components/DataSelection";
import { ExploreChart, type View } from "./components/ExploreChart";
import { FilterBar } from "./components/FilterBar";
import { Insights } from "./components/Insights";
import { defaultBenchmarks, Interpreting } from "./components/Interpreting";
import { LabLegend } from "./components/LabLegend";
import { useLabColor } from "./components/LabLogo";
import { Leaderboard, LeaderboardKey } from "./components/Leaderboard";
import { type ModelNav, ModelNavContext } from "./components/ModelLink";
import { ModelPage } from "./components/ModelPage";
import { ModelPicker } from "./components/ModelPicker";
import { ModelTable } from "./components/ModelTable";
import { LINKS, NEW_WITHIN_DAYS, TOP_N } from "./config";
import { type FitData, type Row, type SiteData, toRows } from "./data";
import { applyFilters, type Filters, monthBounds } from "./filters";
import { formatDate } from "./format";
import { currentGeneration, LINES_PER_LAB } from "./generations";
import { withPicked } from "./pick";
import { applyPreset, DEFAULT_MIN_BENCHMARKS, PRESET_IDS, type Selection } from "./presets";

type TopView = "current" | "all";

// The detail page of a model is `?m=<slug>`: it survives a refresh on GitHub Pages and can
// be shared, and each visit is a history entry so Back returns to the list.
const detailParam = parseAsString.withOptions({ history: "push", scroll: true });
const detailUrl = createSerializer({ m: parseAsString });
const TOP_VIEWS: { value: TopView; label: string }[] = [
  { value: "current", label: "Current generation" },
  { value: "all", label: "Every model" },
];
const VIEWS: { value: View; label: string; short: string }[] = [
  { value: "time", label: "Score vs time", short: "Time" },
  { value: "compute", label: "Score vs training compute", short: "Compute" },
  { value: "domain", label: "Domain vs general", short: "Domain" },
];
// What the page shows, in the URL so a view can be shared. Defaults are left out of it.
const viewParams = {
  preset: parseAsStringLiteral(PRESET_IDS).withDefault("general"),
  bench: parseAsNativeArrayOf(parseAsString),
  min: parseAsInteger.withDefault(DEFAULT_MIN_BENCHMARKS),
  view: parseAsStringLiteral(VIEWS.map((v) => v.value)).withDefault("time"),
  color: parseAsStringLiteral(COLOR_BY.map((c) => c.value)).withDefault("lab"),
  frontier: parseAsBoolean.withDefault(false),
  curve: parseAsNativeArrayOf(parseAsString),
};

function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
}) {
  return (
    <Stack gap={4} mb="lg">
      <Text className={classes.eyebrow}>{eyebrow}</Text>
      <Title order={2} className={classes.sectionTitle}>
        {title}
      </Title>
      <Text c="dimmed" className={classes.balance}>
        {subtitle}
      </Text>
    </Stack>
  );
}

function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const dark = useComputedColorScheme("light") === "dark";
  return (
    <ActionIcon
      variant="default"
      size="lg"
      onClick={() => setColorScheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span aria-hidden>{dark ? "☀" : "☾"}</span>
    </ActionIcon>
  );
}

/** A thin band of lab colours, each as wide as the lab's share of scored models; labs on the
 * shared grey are one segment, at the end. */
function Spectrum({ labs }: { labs: [string, number][] }) {
  const colorOf = useLabColor();
  const widths = new Map<string, number>();
  for (const [lab, count] of labs) {
    const color = colorOf(lab);
    widths.set(color, (widths.get(color) ?? 0) + count);
  }
  const other = colorOf("");
  const segments = [...widths].sort(([a], [b]) => Number(a === other) - Number(b === other));
  return (
    <div className={classes.spectrum} aria-hidden>
      {segments.map(([color, count]) => (
        <span key={color} style={{ flexGrow: count, background: color }} />
      ))}
    </div>
  );
}

export function App({
  data,
  fitData,
}: {
  data: Promise<SiteData>;
  fitData: Promise<FitData | null>;
}) {
  const site = use(data);
  const fit = use(fitData);
  const general = useMemo(() => toRows(site, NEW_WITHIN_DAYS, fit), [site, fit]);
  const [params, setParams] = useQueryStates(viewParams);
  const selection: Selection = useMemo(
    () => ({ preset: params.preset, custom: params.bench, minBenchmarks: params.min }),
    [params.preset, params.bench, params.min],
  );
  const preset = useMemo(
    () => applyPreset(general, site, fit, selection, NEW_WITHIN_DAYS),
    [general, site, fit, selection],
  );
  // Domain vs general needs a domain; with General selected it shows Software engineering.
  const domainPreset = useMemo(
    () =>
      selection.preset === "general"
        ? applyPreset(general, site, fit, { ...selection, preset: "software" }, NEW_WITHIN_DAYS)
        : preset,
    [general, site, fit, preset, selection],
  );
  const all = preset.rows;
  const bounds = useMemo(() => monthBounds(general), [general]);
  const labCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of general) counts.set(r.lab, (counts.get(r.lab) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [general]);
  const labs = labCounts.map(([lab]) => lab);
  const [filters, setFilters] = useState<Filters>({ weights: "all", labs: [], months: bounds });
  const rows = useMemo(() => applyFilters(all, filters, bounds), [all, filters, bounds]);
  const [topView, setTopView] = useState<TopView>("current");
  const current = useMemo(() => currentGeneration(rows), [rows]);
  // Models the user added to the chart, kept in the URL (?model=A&model=B) for sharing.
  const [picked, setPicked] = useQueryState("model", parseAsNativeArrayOf(parseAsString));
  const known = new Set(all.map((r) => r.name));
  const narrow = useMediaQuery("(max-width: 48em)") ?? false;
  const labColor = useLabColor();
  const colorBy: ColorBy = params.color;
  const colorOf = (r: Row) => (colorBy === "lab" ? labColor(r.lab) : groupColor(r, colorBy));
  const viewRows =
    params.view === "domain" ? applyFilters(domainPreset.rows, filters, bounds) : rows;
  const curves = params.curve.length > 0 ? params.curve : fit ? defaultBenchmarks(fit) : [];
  const pickedKnown = picked.filter((name) => known.has(name));
  // A legend chip may stand for several labs: all on, or all off when they already are.
  const toggleLabs = (group: string[]) =>
    setFilters((f) => {
      const on = group.every((lab) => f.labs.includes(lab));
      const rest = f.labs.filter((lab) => !group.includes(lab));
      return { ...f, labs: on ? rest : [...rest, ...group] };
    });

  const [slug, setSlug] = useQueryState("m", detailParam);
  const nameOf = useMemo(
    () => new Map(Object.entries(site.slugs).map(([name, s]) => [s, name])),
    [site.slugs],
  );
  const detailRow = slug === null ? undefined : general.find((r) => r.name === nameOf.get(slug));
  const nav: ModelNav = {
    hrefOf: (name) => {
      const target = site.slugs[name];
      return target ? detailUrl(window.location.search, { m: target }) : null;
    },
    open: (name) => {
      const target = site.slugs[name];
      if (target) void setSlug(target);
    },
  };

  const { latest } = site;
  const isGeneral = params.preset === "general";
  const hasPrevious = isGeneral && Object.keys(site.previous_eci).length > 0;
  const top = (topView === "current" ? current : rows).slice(0, TOP_N);
  const hidden = rows.length - current.length;
  const chart = withPicked(top, all, pickedKnown);
  const unpick = (name: string) => setPicked(pickedKnown.filter((n) => n !== name));

  return (
    <ModelNavContext value={nav}>
      <Spectrum labs={labCounts.filter(([lab]) => lab !== "Unknown")} />
      <Container size="xl" className={classes.page}>
        <Group component="header" justify="space-between" py="md" wrap="nowrap">
          <Group gap={10} wrap="nowrap">
            <span className={classes.pulse} aria-hidden />
            <Text fw={800} size="lg" lts={-0.3}>
              ECI Live
            </Text>
          </Group>
          <Group gap="md" wrap="nowrap">
            <Text size="sm" c="dimmed" visibleFrom="sm" className="num">
              Refit {formatDate(latest.input.fetched_at)} · {latest.input.fetched_at.slice(11, 16)}{" "}
              UTC
            </Text>
            <Text size="sm" visibleFrom="xs">
              <Anchor href={LINKS.repo}>GitHub</Anchor>
            </Text>
            <ThemeToggle />
          </Group>
        </Group>

        {detailRow && slug ? (
          <ModelPage
            row={detailRow}
            slug={slug}
            site={site}
            backHref={detailUrl(window.location.search, { m: null }) || window.location.pathname}
            onBack={() => void setSlug(null)}
          />
        ) : (
          <>
            <Stack gap={6} mt={{ base: "sm", md: "lg" }} mb="lg">
              <Title className={classes.headline}>
                Which AI model is the most <span className={classes.gradientText}>capable</span>{" "}
                today?
              </Title>
              <Text c="dimmed" className={classes.lede}>
                The Epoch Capabilities Index, refit daily from Epoch AI's open benchmark data in
                public CI, with 90% confidence intervals on every score and rank. Switch to a domain
                to rank models on software engineering, math or cyber alone.
              </Text>
            </Stack>

            <div className={classes.toolbar}>
              <DataSelection
                site={site}
                fit={fit}
                value={selection}
                onChange={(next) =>
                  void setParams({
                    ...(next.preset !== undefined && { preset: next.preset }),
                    ...(next.custom !== undefined && { bench: next.custom }),
                    ...(next.minBenchmarks !== undefined && { min: next.minBenchmarks }),
                  })
                }
                view={preset}
              />
              <Divider my="md" />
              <FilterBar
                value={filters}
                onChange={setFilters}
                labs={labs}
                bounds={bounds}
                shown={rows.length}
                total={all.length}
              />
            </div>

            <section className={classes.hero}>
              <Grid gap={0}>
                <Grid.Col span={{ base: 12, lg: 8 }} className={classes.chartCol}>
                  <Group justify="space-between" align="center" mb={6} gap="xs">
                    <Title order={2} className={classes.sectionTitle}>
                      {isGeneral ? "Leaderboard" : preset.label}
                      {chart.added.size > 0 && ` + ${chart.added.size} added`}
                    </Title>
                    <SegmentedControl<TopView>
                      size={narrow ? "sm" : "xs"}
                      value={topView}
                      onChange={setTopView}
                      data={TOP_VIEWS}
                      aria-label="Which models to rank"
                    />
                  </Group>
                  <Text size="sm" c="dimmed" mb="sm" className={classes.caption}>
                    {topView === "current"
                      ? `The newest version of each lab's ${LINES_PER_LAB} most recent model lines. ${hidden} older models are hidden, so ranks skip numbers: they count every model.`
                      : "Every model, including ones their lab has since matched or beaten."}
                  </Text>
                  <Box mb="sm">
                    <ModelPicker models={all} value={pickedKnown} onChange={setPicked} />
                  </Box>
                  <Box mb="xs">
                    <LeaderboardKey intervals={preset.intervals} />
                  </Box>
                  {chart.rows.length > 0 ? (
                    <Leaderboard
                      rows={chart.rows}
                      added={chart.added}
                      onRemove={unpick}
                      axisLabel={isGeneral ? "ECI" : preset.label}
                    />
                  ) : (
                    <Text c="dimmed" py="xl">
                      No models match these filters.
                    </Text>
                  )}
                </Grid.Col>
                <Grid.Col span={{ base: 12, lg: 4 }} className={classes.insightCol}>
                  <Insights rows={all} general={general} snapshot={latest} isGeneral={isGeneral} />
                </Grid.Col>
              </Grid>
            </section>

            <section className={classes.card}>
              <SectionTitle
                eyebrow="Explore"
                title={VIEWS.find((v) => v.value === params.view)?.label ?? ""}
                subtitle={
                  params.view === "domain"
                    ? `${domainPreset.label} against the general ECI. Above the dashed line, a model does better on these benchmarks than on the index as a whole.${isGeneral ? " Pick a domain above to switch." : ""}`
                    : `Each dot is a model${isGeneral ? "" : ` scored on ${preset.label}`}. The stepped line joins the models that set a new record, named where space allows.`
                }
              />
              <div className={classes.viewControls}>
                <SegmentedControl<View>
                  value={params.view}
                  onChange={(view) => void setParams({ view })}
                  data={VIEWS.map((v) => ({ value: v.value, label: narrow ? v.short : v.label }))}
                  fullWidth={narrow}
                  size={narrow ? "md" : "sm"}
                  aria-label="Chart"
                />
                <Group gap="md" align="center" wrap="nowrap" className={classes.viewOptions}>
                  <Input.Wrapper label="Colour by" className={classes.inline}>
                    <SegmentedControl<ColorBy>
                      value={colorBy}
                      onChange={(color) => void setParams({ color })}
                      data={COLOR_BY}
                      size="sm"
                    />
                  </Input.Wrapper>
                  {params.view !== "domain" && (
                    <Switch
                      label="Frontier only"
                      checked={params.frontier}
                      onChange={(e) => void setParams({ frontier: e.currentTarget.checked })}
                      size="md"
                    />
                  )}
                </Group>
              </div>
              <ExploreChart
                rows={viewRows}
                view={params.view}
                colorOf={colorOf}
                frontierOnly={params.frontier && params.view !== "domain"}
                yLabel={
                  params.view === "domain" ? domainPreset.label : isGeneral ? "ECI" : preset.label
                }
              />
              <Box mt="md">
                {colorBy === "lab" ? (
                  <LabLegend
                    labs={labs.filter((lab) => viewRows.some((r) => r.lab === lab))}
                    selected={filters.labs}
                    onToggle={toggleLabs}
                  />
                ) : (
                  <ColorKey entries={groupKey(viewRows, colorBy)} />
                )}
              </Box>
            </section>

            {fit && (
              <section className={classes.card}>
                <SectionTitle
                  eyebrow="Interpreting the ECI"
                  title="What a score means on a benchmark"
                  subtitle="An ECI value on its own is abstract. Each curve is a benchmark's fitted logistic curve: the score a model of that ECI is expected to get, after Epoch's rescaling (random guessing = 0%, the benchmark's ceiling = 100%). The dots are real results, placed at each model's general ECI."
                />
                <Interpreting
                  fit={fit}
                  rows={general}
                  value={curves}
                  onChange={(curve) => void setParams({ curve })}
                />
              </section>
            )}

            <section className={classes.card}>
              <SectionTitle
                eyebrow="Every model"
                title="Full table"
                subtitle={
                  hasPrevious
                    ? "Search, sort and page through every scored model. Δ is the change since the previous snapshot."
                    : `Search, sort and page through every model${isGeneral ? "" : ` scored on ${preset.label}`}.`
                }
              />
              <ModelTable rows={rows} hasPrevious={hasPrevious} intervals={preset.intervals} />
            </section>

            <Divider my={56} />
            <section>
              <About snapshot={latest} />
            </section>
          </>
        )}

        <Group justify="space-between" py={40} gap="xs">
          <Text size="sm" c="dimmed">
            ECI Live by Sakina · code AGPL-3.0
          </Text>
          <Text size="sm" c="dimmed">
            <Anchor href={LINKS.repo}>Source and snapshot history</Anchor>
          </Text>
        </Group>
      </Container>
    </ModelNavContext>
  );
}
