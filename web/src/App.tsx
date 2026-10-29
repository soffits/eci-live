import {
  ActionIcon,
  Anchor,
  Badge,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { type ReactNode, use, useMemo, useState } from "react";
import classes from "./App.module.css";
import { About } from "./components/About";
import { FilterBar } from "./components/FilterBar";
import { LabLogo } from "./components/LabLogo";
import { Leaderboard } from "./components/Leaderboard";
import { ModelTable } from "./components/ModelTable";
import { Timeline } from "./components/Timeline";
import { LINKS, NEW_WITHIN_DAYS, TOP_N } from "./config";
import { type SiteData, toRows } from "./data";
import { applyFilters, type Filters, monthBounds } from "./filters";
import { formatDate } from "./format";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card withBorder radius="lg" padding="lg" className={classes.card}>
      <Stack gap={4} mb="md">
        <Title order={2} size="h3">
          {title}
        </Title>
        <Text size="sm" c="dimmed">
          {subtitle}
        </Text>
      </Stack>
      {children}
    </Card>
  );
}

function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <Card withBorder radius="lg" padding="md" className={classes.card}>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={0.5}>
        {label}
      </Text>
      <Text fz={28} fw={800} lh={1.2} mt={4} className={classes.statValue}>
        {value}
      </Text>
      {detail && (
        <Text size="sm" c="dimmed" mt={2}>
          {detail}
        </Text>
      )}
    </Card>
  );
}

function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const dark = useComputedColorScheme("light") === "dark";
  return (
    <ActionIcon
      variant="default"
      radius="xl"
      size="lg"
      onClick={() => setColorScheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span aria-hidden>{dark ? "☀" : "☾"}</span>
    </ActionIcon>
  );
}

export function App({ data }: { data: Promise<SiteData> }) {
  const site = use(data);
  const all = useMemo(() => toRows(site, NEW_WITHIN_DAYS), [site]);
  const bounds = useMemo(() => monthBounds(all), [all]);
  const labs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.lab, (counts.get(r.lab) ?? 0) + 1);
    return [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [all]);
  const [filters, setFilters] = useState<Filters>({ weights: "all", labs: [], months: bounds });
  const rows = useMemo(() => applyFilters(all, filters, bounds), [all, filters, bounds]);

  const { latest } = site;
  const top = all[0];
  const unpublished = all.filter((r) => !r.onEpoch);

  return (
    <>
      <div className={classes.glow} aria-hidden />
      <Container size="lg" py="lg" className={classes.page}>
        <Group justify="space-between" mb={48}>
          <Group gap={10}>
            <span className={classes.pulse} aria-hidden />
            <Text fw={800} size="lg" lts={-0.3}>
              ECI Live
            </Text>
            <Badge variant="outline" color="gray" radius="sm" size="sm">
              unofficial
            </Badge>
          </Group>
          <Group gap="xs">
            <Text size="sm" visibleFrom="xs">
              <Anchor href={LINKS.repo} c="dimmed">
                Source &amp; data
              </Anchor>
            </Text>
            <ThemeToggle />
          </Group>
        </Group>

        <Stack gap="xs" mb="xl" maw={760}>
          <Title className={classes.headline}>
            Which AI model is the most <span className={classes.gradientText}>capable</span>, today?
          </Title>
          <Text size="lg" c="dimmed">
            The Epoch Capabilities Index, refit from Epoch AI's open benchmark data every day,
            entirely in public CI. Last refit {formatDate(latest.input.fetched_at)}.
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" mb="xl">
          <Stat
            label="Top model"
            value={
              top && (
                <Group gap={8} wrap="nowrap">
                  <LabLogo lab={top.lab} size={24} />
                  <span className={classes.truncate}>{top.name}</span>
                </Group>
              )
            }
            detail={top && `${top.eci.toFixed(1)} ECI · ${top.lab}`}
          />
          <Stat label="Models scored" value={all.length} detail={`${labs.length} labs`} />
          <Stat
            label="Not yet on Epoch"
            value={unpublished.length}
            detail={unpublished.map((r) => r.name).join(", ") || "all published"}
          />
          <Stat
            label="Agreement"
            value={`±${latest.drift.max_abs.toFixed(2)}`}
            detail={`max gap vs Epoch over ${latest.drift.shared_models} models`}
          />
        </SimpleGrid>

        <Card
          withBorder
          radius="lg"
          padding="md"
          mb="xl"
          className={`${classes.card} ${classes.sticky}`}
        >
          <FilterBar
            value={filters}
            onChange={setFilters}
            labs={labs}
            bounds={bounds}
            shown={rows.length}
            total={all.length}
          />
        </Card>

        <Stack gap="xl">
          <Section
            title={`Top ${Math.min(TOP_N, rows.length)} by ECI`}
            subtitle={`Bars show each model's ECI; whiskers its ${Math.round(latest.fit.ci_level * 100)}% bootstrap confidence interval.`}
          >
            <Leaderboard rows={rows.slice(0, TOP_N)} />
          </Section>
          <Section
            title="ECI over time"
            subtitle="Each dot is a model at its release date. The line traces the frontier: every model that set a new record."
          >
            <Timeline rows={rows} />
          </Section>
          <Section
            title="All models"
            subtitle="Search and sort every scored model. Δ is the change since the previous snapshot."
          >
            <ModelTable rows={rows} />
          </Section>
          <Card withBorder radius="lg" padding="xl" className={classes.card}>
            <About snapshot={latest} />
          </Card>
        </Stack>

        <Text size="xs" c="dimmed" ta="center" mt={48}>
          Data © Epoch AI, CC BY 4.0 · Method: Ho et al., “A Rosetta Stone for AI Benchmarks” ·
          Unofficial refit by Sakina, not affiliated with Epoch AI
        </Text>
      </Container>
    </>
  );
}
