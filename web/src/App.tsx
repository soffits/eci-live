import {
  ActionIcon,
  Anchor,
  Box,
  Container,
  Divider,
  Grid,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { createSerializer, parseAsNativeArrayOf, parseAsString, useQueryState } from "nuqs";
import { type ReactNode, use, useMemo, useState } from "react";
import classes from "./App.module.css";
import { About } from "./components/About";
import { FilterBar } from "./components/FilterBar";
import { Insights } from "./components/Insights";
import { LabLegend } from "./components/LabLegend";
import { useLabColor } from "./components/LabLogo";
import { Leaderboard, LeaderboardKey } from "./components/Leaderboard";
import { type ModelNav, ModelNavContext } from "./components/ModelLink";
import { ModelPage } from "./components/ModelPage";
import { ModelPicker } from "./components/ModelPicker";
import { ModelTable } from "./components/ModelTable";
import { Timeline } from "./components/Timeline";
import { LINKS, NEW_WITHIN_DAYS, TOP_N } from "./config";
import { type SiteData, toRows } from "./data";
import { applyFilters, type Filters, monthBounds } from "./filters";
import { formatDate } from "./format";
import { currentGeneration } from "./generations";
import { withPicked } from "./pick";

type TopView = "current" | "all";

// The detail page of a model is `?m=<slug>`: it survives a refresh on GitHub Pages and can
// be shared, and each visit is a history entry so Back returns to the list.
const detailParam = parseAsString.withOptions({ history: "push", scroll: true });
const detailUrl = createSerializer({ m: parseAsString });
const TOP_VIEWS: { value: TopView; label: string }[] = [
  { value: "current", label: "Current generation" },
  { value: "all", label: "Every model" },
];

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

/** A thin band of lab colours, each as wide as the lab's share of scored models. */
function Spectrum({ labs }: { labs: [string, number][] }) {
  const colorOf = useLabColor();
  return (
    <div className={classes.spectrum} aria-hidden>
      {labs.map(([lab, count]) => (
        <span key={lab} style={{ flexGrow: count, background: colorOf(lab) }} />
      ))}
    </div>
  );
}

export function App({ data }: { data: Promise<SiteData> }) {
  const site = use(data);
  const all = useMemo(() => toRows(site, NEW_WITHIN_DAYS), [site]);
  const bounds = useMemo(() => monthBounds(all), [all]);
  const labCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.lab, (counts.get(r.lab) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);
  const labs = labCounts.map(([lab]) => lab);
  const [filters, setFilters] = useState<Filters>({ weights: "all", labs: [], months: bounds });
  const rows = useMemo(() => applyFilters(all, filters, bounds), [all, filters, bounds]);
  const [topView, setTopView] = useState<TopView>("current");
  const current = useMemo(() => currentGeneration(rows), [rows]);
  // Models the user added to the chart, kept in the URL (?model=A&model=B) for sharing.
  const [picked, setPicked] = useQueryState("model", parseAsNativeArrayOf(parseAsString));
  const known = new Set(all.map((r) => r.name));
  const pickedKnown = picked.filter((name) => known.has(name));
  // Labs with at least one dot on the timeline, most models first.
  const datedLabs = labs.filter((lab) => all.some((r) => r.lab === lab && r.released !== null));
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
  const detailRow = slug === null ? undefined : all.find((r) => r.name === nameOf.get(slug));
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
  const hasPrevious = Object.keys(site.previous_eci).length > 0;
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
              <Text c="dimmed" className={`${classes.balance} ${classes.lede}`} maw={820}>
                The Epoch Capabilities Index, refit daily from Epoch AI's open benchmark data in
                public CI, with 90% confidence intervals on every score and rank.
              </Text>
            </Stack>

            <div className={classes.toolbar}>
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
                      Top {top.length} by ECI
                      {chart.added.size > 0 && ` + ${chart.added.size} added`}
                    </Title>
                    <SegmentedControl<TopView>
                      size="xs"
                      value={topView}
                      onChange={setTopView}
                      data={TOP_VIEWS}
                      aria-label="Which models to rank"
                    />
                  </Group>
                  <Text size="xs" c="dimmed" mb="sm" className={classes.balance}>
                    {topView === "current"
                      ? `A model is hidden once its lab releases a newer one with an ECI at least as high (${hidden} hidden; ranks count every model).`
                      : "Every model, including ones their lab has since matched or beaten."}
                  </Text>
                  <Box mb="sm">
                    <ModelPicker models={all} value={pickedKnown} onChange={setPicked} />
                  </Box>
                  <Box mb="sm">
                    <LeaderboardKey />
                  </Box>
                  {chart.rows.length > 0 ? (
                    <Leaderboard rows={chart.rows} added={chart.added} onRemove={unpick} />
                  ) : (
                    <Text c="dimmed" py="xl">
                      No models match these filters.
                    </Text>
                  )}
                </Grid.Col>
                <Grid.Col span={{ base: 12, lg: 4 }} className={classes.insightCol}>
                  <Insights rows={all} snapshot={latest} />
                </Grid.Col>
              </Grid>
            </section>

            <section className={classes.card}>
              <SectionTitle
                eyebrow="Trend"
                title="ECI over time"
                subtitle="Each dot is a model at its release date. The stepped line is the frontier: every model that set a new record, named where space allows."
              />
              <Timeline rows={rows} />
              <Group justify="space-between" mt="md" gap="sm">
                <LabLegend labs={datedLabs} selected={filters.labs} onToggle={toggleLabs} />
              </Group>
            </section>

            <section className={classes.card}>
              <SectionTitle
                eyebrow="Every model"
                title="Full table"
                subtitle={
                  hasPrevious
                    ? "Search, sort and page through every scored model. Δ is the change since the previous snapshot."
                    : "Search, sort and page through every scored model."
                }
              />
              <ModelTable rows={rows} hasPrevious={hasPrevious} />
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
