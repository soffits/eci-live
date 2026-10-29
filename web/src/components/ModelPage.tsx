import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Grid,
  Group,
  Tooltip as HoverTip,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useDocumentTitle } from "@mantine/hooks";
import { Suspense, use } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LINKS, WEIGHTS } from "../config";
import {
  type BenchmarkResult,
  loadDetail,
  type ModelDetail,
  type Row,
  type SiteData,
} from "../data";
import { curve, type FitPoint, fitPoints, formatFlop, isThin, splitResults } from "../detail";
import { formatDate, formatPercent, formatRange } from "../format";
import { LabLogo } from "./LabLogo";
import { ModelBadges } from "./ModelBadges";
import classes from "./ModelPage.module.css";

const details = new Map<string, Promise<ModelDetail>>();

function detailOf(slug: string): Promise<ModelDetail> {
  let pending = details.get(slug);
  if (!pending) {
    pending = loadDetail(slug);
    details.set(slug, pending);
  }
  return pending;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={classes.card}>
      <Title order={2} className={classes.sectionTitle} mb="md">
        {title}
      </Title>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <Paper withBorder radius="lg" p="md" className={classes.stat}>
      <Text className={classes.label}>{label}</Text>
      <Text className={`${classes.value} num`}>{value}</Text>
      <Text size="xs" c="dimmed" className="num">
        {sub}
      </Text>
    </Paper>
  );
}

function Headline({ row, site }: { row: Row; site: SiteData }) {
  const ci =
    row.ci_low === null || row.ci_high === null
      ? "a scale anchor, fixed by definition"
      : `90% interval ${row.ci_low.toFixed(1)}–${row.ci_high.toFixed(1)}`;
  const rankRange =
    row.rank_low === null || row.rank_high === null
      ? "no rank interval"
      : `90% rank interval ${formatRange(row.rank_low, row.rank_high)}`;
  const diff = row.official_eci === null ? null : row.eci - row.official_eci;
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
      <Stat label="ECI" value={row.eci.toFixed(1)} sub={ci} />
      <Stat label="Rank" value={row.tiedFirst ? "=1" : `#${row.rank}`} sub={rankRange} />
      <Stat
        label="Chance of #1"
        value={formatPercent(row.p_first ?? 0)}
        sub={`of ${site.latest.fit.bootstrap_samples} bootstrap refits`}
      />
      <Stat
        label="Epoch's score"
        value={row.official_eci === null ? "—" : row.official_eci.toFixed(1)}
        sub={
          diff === null
            ? "not published by Epoch yet"
            : `this refit ${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)}`
        }
      />
    </SimpleGrid>
  );
}

function Facts({ row, detail, site }: { row: Row; detail: ModelDetail; site: SiteData }) {
  const firstSeen = site.first_seen[row.name] ?? null;
  const facts: [string, React.ReactNode][] = [
    ["Lab", detail.organization ?? row.lab],
    ["Released", formatDate(row.release_date)],
    [
      "Weights",
      <Group gap={6} key="w">
        <Badge size="sm" variant={WEIGHTS[row.weights].variant} color={WEIGHTS[row.weights].color}>
          {WEIGHTS[row.weights].label}
        </Badge>
        {row.accessibility && (
          <Text span size="sm" c="dimmed">
            {row.accessibility}
          </Text>
        )}
      </Group>,
    ],
    ["Country", detail.country ?? "Not recorded"],
    [
      "Training compute",
      detail.training_compute_flop === null
        ? "Not recorded"
        : formatFlop(detail.training_compute_flop),
    ],
    ["First seen here", firstSeen ? formatDate(firstSeen) : "—"],
    ...(detail.history.length < 2
      ? ([["Score history", <HistoryNote detail={detail} key="h" />]] as [
          string,
          React.ReactNode,
        ][])
      : []),
    [
      `Versions merged (${detail.versions.length})`,
      <Text size="sm" key="v">
        {detail.versions.map((v) => v.display_name ?? v.version).join(", ")}
      </Text>,
    ],
  ];
  return (
    <Table variant="vertical" layout="fixed" withTableBorder={false} className={classes.facts}>
      <Table.Tbody>
        {facts.map(([label, value]) => (
          <Table.Tr key={label}>
            <Table.Th w={{ base: 112, sm: 170 }}>{label}</Table.Th>
            <Table.Td>{value}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Shown instead of the history chart until there are two snapshots to draw. */
function HistoryNote({ detail }: { detail: ModelDetail }) {
  const only = detail.history[0];
  return (
    <Text size="sm">
      {only
        ? `One snapshot so far: ${only.eci.toFixed(1)} on ${formatDate(only.fetched_at)}. A chart appears here once the daily refits add more.`
        : "No snapshots yet."}
    </Text>
  );
}

function History({ detail }: { detail: ModelDetail }) {
  const points = detail.history.map((h) => ({ ...h, time: Date.parse(h.fetched_at) }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--mantine-color-default-border)" vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(t: number) => formatDate(t)}
          tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={["auto", "auto"]}
          width={40}
          tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          wrapperStyle={{ userSelect: "none" }}
          formatter={(v) => (typeof v === "number" ? v.toFixed(1) : String(v))}
          labelFormatter={(t) => formatDate(Number(t))}
        />
        <Line dataKey="eci" stroke="var(--mantine-primary-color-filled)" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function FitTooltip({ active, payload }: { active?: boolean; payload?: { payload: FitPoint }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p || !("benchmark" in p)) return null;
  return (
    <Paper withBorder shadow="md" radius="md" p="xs">
      <Text size="sm" fw={700}>
        {p.benchmark}
      </Text>
      <Text size="xs" className="num">
        actual {formatPercent(p.actual)} · predicted {formatPercent(p.predicted)}
      </Text>
    </Paper>
  );
}

/** Every fitted benchmark against the one logistic curve they all share. */
function FitChart({ points }: { points: FitPoint[] }) {
  const reach = Math.max(4, ...points.map((p) => Math.abs(p.x))) + 0.5;
  const line = curve(-reach, reach);
  const pullColor = (p: FitPoint) =>
    p.pull >= 0 ? "var(--mantine-color-teal-filled)" : "var(--mantine-color-red-filled)";
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
        <CartesianGrid stroke="var(--mantine-color-default-border)" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[-reach, reach]}
          ticks={[0]}
          tickFormatter={() => "at its difficulty"}
          tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          label={{
            value: "← harder for this model · easier →",
            position: "insideBottom",
            offset: -12,
            fill: "var(--mantine-color-dimmed)",
            fontSize: 12,
          }}
        />
        <YAxis
          type="number"
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          width={44}
          tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<FitTooltip />} wrapperStyle={{ userSelect: "none" }} />
        <Line
          data={line}
          dataKey="y"
          dot={false}
          activeDot={false}
          stroke="var(--mantine-color-dimmed)"
          strokeWidth={2}
          isAnimationActive={false}
          tooltipType="none"
        />
        {points.map((p) => (
          <ReferenceLine
            key={p.benchmark}
            segment={[
              { x: p.x, y: p.predicted },
              { x: p.x, y: p.actual },
            ]}
            stroke={pullColor(p)}
            strokeOpacity={0.6}
          />
        ))}
        <Scatter
          data={points}
          dataKey="actual"
          isAnimationActive={false}
          shape={(props: { cx?: number; cy?: number; payload?: FitPoint }) => (
            <circle
              cx={props.cx}
              cy={props.cy}
              r={5}
              fill={props.payload ? pullColor(props.payload) : "currentColor"}
              stroke="var(--eci-surface)"
              strokeWidth={1.5}
            />
          )}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function pp(value: number): string {
  const points = Math.round(value * 100);
  return `${points > 0 ? "+" : points < 0 ? "−" : "±"}${Math.abs(points)} pts`;
}

function HowComputed({ row, detail, site }: { row: Row; detail: ModelDetail; site: SiteData }) {
  const points = fitPoints(row.eci, detail.fit);
  const commit = site.latest.fit.eci_public_commit;
  return (
    <Stack gap="md">
      <Text size="sm" className={classes.prose}>
        ECI gives each model one number and each benchmark two: a <b>difficulty</b> on the same
        scale, and a <b>slope</b> for how sharply scores rise as models get more capable. Scores are
        first rescaled so random guessing is 0% and the benchmark's ceiling is 100%. Every score is
        then predicted by one S-shaped (logistic) curve,{" "}
        <Text span ff="monospace" size="sm">
          predicted = logistic(slope × (ECI − difficulty))
        </Text>
        , and the fit picks the numbers that make all models' predictions match all their scores at
        once. Claude 3.5 Sonnet is pinned at 130 and GPT-5 at 150 to fix the scale. The 90% interval
        comes from refitting {site.latest.fit.bootstrap_samples} times on resampled benchmark
        results. This is Epoch AI's method (<Anchor href={LINKS.epochEci}>Epoch's ECI page</Anchor>,{" "}
        <Anchor href={LINKS.paper}>paper</Anchor>), run unchanged from{" "}
        <Anchor href={`${LINKS.eciPublic}/tree/${commit}`}>
          eci-public @ {commit.slice(0, 7)}
        </Anchor>
        .
      </Text>
      <Text size="sm" className={classes.prose}>
        Below, each of the {detail.fit.length} benchmarks used for {row.name} is a dot against that
        curve. Dots{" "}
        <Text span c="teal" fw={700}>
          above
        </Text>{" "}
        it scored better than the fit predicts and pull the ECI up; dots{" "}
        <Text span c="red" fw={700}>
          below
        </Text>{" "}
        pull it down.
      </Text>
      <FitChart points={points} />
      <Table.ScrollContainer minWidth={560}>
        <Table striped highlightOnHover verticalSpacing={6} className="num">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Benchmark</Table.Th>
              <Table.Th ta="right">Difficulty</Table.Th>
              <Table.Th ta="right">Slope</Table.Th>
              <Table.Th ta="right">Predicted</Table.Th>
              <Table.Th ta="right">Actual</Table.Th>
              <Table.Th ta="right">Pull</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {detail.fit.map((t, i) => (
              <Table.Tr key={t.benchmark}>
                <Table.Td>{t.benchmark}</Table.Td>
                <Table.Td ta="right">{t.edi.toFixed(1)}</Table.Td>
                <Table.Td ta="right">{t.slope.toFixed(3)}</Table.Td>
                <Table.Td ta="right">{formatPercent(points[i]?.predicted ?? t.predicted)}</Table.Td>
                <Table.Td ta="right">{formatPercent(t.actual)}</Table.Td>
                <Table.Td ta="right" c={(points[i]?.pull ?? 0) >= 0 ? "teal" : "red"} fw={600}>
                  {pp(points[i]?.pull ?? t.actual - t.predicted)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}

function score(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toPrecision(3);
}

function ResultsTable({ results }: { results: BenchmarkResult[] }) {
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table striped highlightOnHover verticalSpacing={6}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Benchmark</Table.Th>
            <Table.Th>Version</Table.Th>
            <Table.Th ta="right">Score</Table.Th>
            <Table.Th ta="right">± stderr</Table.Th>
            <Table.Th ta="right">For the fit</Table.Th>
            <Table.Th>Run</Table.Th>
            <Table.Th>Evidence</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody className="num">
          {results.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>{r.benchmark}</Table.Td>
              <Table.Td c="dimmed">{r.version}</Table.Td>
              <Table.Td ta="right">
                <HoverTip label={r.score_column}>
                  <span>{score(r.score)}</span>
                </HoverTip>
              </Table.Td>
              <Table.Td ta="right" c="dimmed">
                {r.stderr === null ? "—" : score(r.stderr)}
              </Table.Td>
              <Table.Td ta="right">
                {r.normalized === null ? "—" : formatPercent(r.normalized)}
              </Table.Td>
              <Table.Td c="dimmed">{r.run_at ? formatDate(r.run_at) : "—"}</Table.Td>
              <Table.Td>
                {r.log_url ? (
                  <Anchor href={r.log_url} size="sm">
                    Epoch logs
                  </Anchor>
                ) : r.source_url ? (
                  <Anchor href={r.source_url} size="sm" lineClamp={1} title={r.source ?? undefined}>
                    {r.source ?? "Source"}
                  </Anchor>
                ) : (
                  <Text span size="sm" c="dimmed">
                    {r.source ?? "—"}
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function Results({ detail }: { detail: ModelDetail }) {
  const { used, unused } = splitResults(detail.results);
  const unusedCount = unused.reduce((n, g) => n + g.results.length, 0);
  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed" className={classes.prose}>
        Every result Epoch's data has for this model's versions: the raw score as published, its
        standard error where measured, and the 0–100% score the fit sees after rescaling (random
        guessing = 0%, the benchmark's ceiling = 100%). Hover a score for the column it comes from.
      </Text>
      <div>
        <Title order={3} className={classes.subTitle}>
          Used in ECI ({used.length})
        </Title>
        <ResultsTable results={used} />
      </div>
      <div>
        <Title order={3} className={classes.subTitle}>
          Not used in ECI ({unusedCount})
        </Title>
        {unused.length === 0 ? (
          <Text size="sm" c="dimmed">
            Every result for this model went into the fit.
          </Text>
        ) : (
          <Accordion
            multiple
            variant="separated"
            radius="md"
            defaultValue={unused[0] ? [unused[0].reason] : []}
          >
            {unused.map((g) => (
              <Accordion.Item key={g.reason} value={g.reason}>
                <Accordion.Control>
                  <Text size="sm" fw={600}>
                    {g.reason}{" "}
                    <Text span c="dimmed" fw={400}>
                      ({g.results.length})
                    </Text>
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <ResultsTable results={g.results} />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </div>
    </Stack>
  );
}

function Body({ row, slug, site }: { row: Row; slug: string; site: SiteData }) {
  const detail = use(detailOf(slug));
  const benchmarks = detail.fit.length;
  return (
    <Stack gap="lg">
      {isThin(benchmarks) && (
        <Alert color="yellow" variant="light" radius="lg" title="Thin evidence">
          This score rests on only {benchmarks} benchmark{benchmarks === 1 ? "" : "s"}; the index
          needs at least 4 to score a model at all. Treat it as provisional
          {row.ci_low !== null && row.ci_high !== null
            ? `: its 90% interval spans ${(row.ci_high - row.ci_low).toFixed(1)} points`
            : ""}
          , and expect it to move as more results come in.
        </Alert>
      )}
      <Headline row={row} site={site} />
      {detail.history.length < 2 ? (
        <Section title="Model facts">
          <Facts row={row} detail={detail} site={site} />
        </Section>
      ) : (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Section title="Model facts">
              <Facts row={row} detail={detail} site={site} />
            </Section>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Section title="Score history">
              <History detail={detail} />
            </Section>
          </Grid.Col>
        </Grid>
      )}
      <Section title="How the score came about">
        <HowComputed row={row} detail={detail} site={site} />
      </Section>
      <Section title={`Every result in the data (${detail.results.length})`}>
        <Results detail={detail} />
      </Section>
      <Text size="sm" c="dimmed" className={classes.prose}>
        Benchmark data by <Anchor href={LINKS.epochData}>Epoch AI</Anchor>, licensed{" "}
        <Anchor href={LINKS.ccBy}>CC BY 4.0</Anchor>. Scores here come from an unofficial refit of
        snapshot {detail.snapshot}, not from Epoch AI.
      </Text>
    </Stack>
  );
}

/** One model: its facts, its scores, and how its ECI was computed. */
export function ModelPage({
  row,
  slug,
  site,
  backHref,
  onBack,
}: {
  row: Row;
  slug: string;
  site: SiteData;
  backHref: string;
  onBack: () => void;
}) {
  useDocumentTitle(`${row.name} · ECI Live`);
  return (
    <Stack gap="lg" pb="xl">
      <Anchor
        href={backHref}
        size="sm"
        className="chrome"
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onBack();
        }}
      >
        ← All models
      </Anchor>
      <Group gap="md" wrap="nowrap" align="center">
        <LabLogo lab={row.lab} size={36} />
        <Stack gap={4}>
          <Title order={1} className={classes.title}>
            {row.name}
          </Title>
          <Group gap={8}>
            <Text c="dimmed" size="sm">
              {row.lab} · released {formatDate(row.release_date)}
            </Text>
            <ModelBadges row={row} />
          </Group>
        </Stack>
      </Group>
      <Suspense
        fallback={
          <Group justify="center" py="xl">
            <Loader type="dots" />
          </Group>
        }
      >
        <Body row={row} slug={slug} site={site} />
      </Suspense>
    </Stack>
  );
}
