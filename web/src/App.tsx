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
  Tooltip,
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
import { applyPreset, defaultMinBenchmarks, PRESET_IDS, type Selection } from "./presets";
import { defaultVariants, preferred, siblings } from "./variants";

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
  // Unset means the selection's default (presets.defaultMinBenchmarks).
  min: parseAsInteger,
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

const SCHEMES = ["auto", "light", "dark"] as const;
const SCHEME_LABEL = {
  auto: "Theme: follows your device",
  light: "Theme: light",
  dark: "Theme: dark",
};
const SCHEME_ICON = { auto: "◐", light: "☀", dark: "☾" };

/** Cycles device (auto), light and dark; auto is the default and follows the system setting. */
function ThemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const next = SCHEMES[(SCHEMES.indexOf(colorScheme) + 1) % SCHEMES.length] ?? "auto";
  return (
    <Tooltip label={SCHEME_LABEL[colorScheme]} withArrow>
      <ActionIcon
        variant="default"
        size="lg"
        onClick={() => setColorScheme(next)}
        aria-label={`${SCHEME_LABEL[colorScheme]}. Switch to ${next}.`}
      >
        <span aria-hidden>{SCHEME_ICON[colorScheme]}</span>
      </ActionIcon>
    </Tooltip>
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
  const minBenchmarks = params.min ?? defaultMinBenchmarks(params.preset);
  const selection: Selection = useMemo(
    () => ({ preset: params.preset, custom: params.bench, minBenchmarks }),
    [params.preset, params.bench, minBenchmarks],
  );
  const preset = useMemo(
    () => applyPreset(general, site, fit, selection),
    [general, site, fit, selection],
  );
  // Domain vs general needs a domain; with General selected it shows Software engineering.
  const domainPreset = useMemo(
    () =>
      selection.preset === "general"
        ? applyPreset(general, site, fit, {
            ...selection,
            preset: "software",
            minBenchmarks: defaultMinBenchmarks("software"),
          })
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
  const ranked = useMemo(() => all.filter((r) => r.rank !== null), [all]);
  // One variant per model: its highest reasoning effort with enough evidence (variants.ts).
  const defaults = useMemo(() => defaultVariants(rows), [rows]);
  const [topView, setTopView] = useState<TopView>("current");
  const current = useMemo(() => currentGeneration(defaults.rows), [defaults]);
  // Variants the user added to the chart, kept in the URL (?model=<version>) for sharing.
  const [pickedVersions, setPickedVersions] = useQueryState(
    "model",
    parseAsNativeArrayOf(parseAsString),
  );
  const nameOfVersion = useMemo(() => new Map(general.map((r) => [r.version, r.name])), [general]);
  const versionOfName = useMemo(() => new Map(general.map((r) => [r.name, r.version])), [general]);
  const picked = pickedVersions.flatMap((v) => nameOfVersion.get(v) ?? []);
  const setPicked = (names: string[]) =>
    void setPickedVersions(names.flatMap((n) => versionOfName.get(n) ?? []));
  const known = new Set(all.map((r) => r.name));
  const narrow = useMediaQuery("(max-width: 48em)") ?? false;
  const labColor = useLabColor();
  const colorBy: ColorBy = params.color;
  const colorOf = (r: Row) => (colorBy === "lab" ? labColor(r.lab) : groupColor(r, colorBy));
  const pickedKnown = picked.filter((name) => known.has(name));
  // The explore views draw what the leaderboard does: each model's default variant, plus
  // any the user added.
  const viewSource =
    params.view === "domain" ? applyFilters(domainPreset.rows, filters, bounds) : rows;
  const viewRows = withPicked(defaultVariants(viewSource).rows, viewSource, pickedKnown).rows;
  const curves = params.curve.length > 0 ? params.curve : fit ? defaultBenchmarks(fit) : [];
  // A legend chip may stand for several labs: all on, or all off when they already are.
  const toggleLabs = (group: string[]) =>
    setFilters((f) => {
      const on = group.every((lab) => f.labs.includes(lab));
      const rest = f.labs.filter((lab) => !group.includes(lab));
      return { ...f, labs: on ? rest : [...rest, ...group] };
    });

  const [slug, setSlug] = useQueryState("m", detailParam);
  const versionOfSlug = useMemo(
    () => new Map(Object.entries(site.slugs).map(([version, s]) => [s, version])),
    [site.slugs],
  );
  // Detail pages show the General (all-round) board at its default minimum.
  const board = useMemo(
    () =>
      applyPreset(general, site, fit, {
        preset: "general",
        custom: [],
        minBenchmarks: defaultMinBenchmarks("general"),
      }).rows,
    [general, site, fit],
  );
  const detailRow =
    slug === null ? undefined : board.find((r) => r.version === versionOfSlug.get(slug));
  const slugOf = (name: string) => site.slugs[versionOfName.get(name) ?? ""];
  const nav: ModelNav = {
    hrefOf: (name) => {
      const target = slugOf(name);
      return target ? detailUrl(window.location.search, { m: target }) : null;
    },
    open: (name) => {
      const target = slugOf(name);
      if (target) void setSlug(target);
    },
  };

  const { latest } = site;
  const isGeneral = params.preset === "general";
  // Δ only earns its column when some score moved since the previous snapshot.
  const hasPrevious =
    isGeneral && general.some((r) => r.delta !== null && Math.abs(r.delta) >= 0.05);
  const top = (topView === "current" ? current : defaults.rows).slice(0, TOP_N);
  const hidden = defaults.rows.length - current.length;
  const chart = withPicked(top, all, pickedKnown);
  const unpick = (name: string) => setPicked(pickedKnown.filter((n) => n !== name));
  const pick = (name: string) => setPicked([...pickedKnown, name]);

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
            variants={board.filter((r) => r.group === detailRow.group).sort(preferred)}
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
                    // A new selection starts from its own default minimum.
                    ...(next.preset !== undefined && { preset: next.preset, min: null }),
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
                      ? `The newest version of each lab's ${LINES_PER_LAB} most recent model lines (${hidden} older models hidden).`
                      : "Every model, including ones their lab has since matched or beaten."}{" "}
                    Each model shows its highest reasoning setting; add other variants with + or the
                    search below.
                  </Text>
                  <Box mb="sm">
                    <ModelPicker models={all} value={pickedKnown} onChange={setPicked} />
                  </Box>
                  <Box mb="xs">
                    <LeaderboardKey intervals={preset.intervals} dots={narrow} tie={isGeneral} />
                  </Box>
                  {chart.rows.length > 0 ? (
                    <Leaderboard
                      rows={chart.rows}
                      added={chart.added}
                      onRemove={unpick}
                      skipped={defaults.skipped}
                      minBenchmarks={minBenchmarks}
                      othersOf={(r) => siblings(r, all)}
                      onAdd={pick}
                      axisLabel={isGeneral ? "ECI" : preset.label}
                    />
                  ) : (
                    <Text c="dimmed" py="xl">
                      No models match these filters.
                    </Text>
                  )}
                </Grid.Col>
                <Grid.Col span={{ base: 12, lg: 4 }} className={classes.insightCol}>
                  <Insights rows={ranked} isGeneral={isGeneral} />
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
                    scroll={narrow}
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

        <Group
          component="footer"
          justify="space-between"
          py={32}
          mt={48}
          gap="xs"
          className={classes.footer}
        >
          <Text size="md" c="dimmed">
            ECI Live by Sakina · code AGPL-3.0 · data Epoch AI, CC BY 4.0
          </Text>
          <Text size="md">
            <Anchor href={LINKS.repo}>Source and snapshot history</Anchor>
          </Text>
        </Group>
      </Container>
    </ModelNavContext>
  );
}
