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
import { useDocumentTitle, useMediaQuery } from "@mantine/hooks";
import { Suspense, use } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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
import {
  curve,
  type FitPoint,
  fitPoints,
  formatFlop,
  formatScore,
  groupTitle,
  isThin,
  pullPoints,
  splitResults,
} from "../detail";
import { formatDate, formatPercent, formatRange } from "../format";
import { niceTicks } from "../scale";
import { LabLogo } from "./LabLogo";
import { BorrowedTag, ModelBadges } from "./ModelBadges";
import { ModelLink } from "./ModelLink";
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
    <div className={classes.stat}>
      <Text className={classes.label}>{label}</Text>
      <Text className={`${classes.value} num`}>{value}</Text>
      <Text size="sm" c="dimmed" className="num">
        {sub}
      </Text>
    </div>
  );
}

function Headline({ row, site }: { row: Row; site: SiteData }) {
  const { fit } = site.latest;
  const ci =
    row.ci_low === null || row.ci_high === null
      ? "no interval"
      : `90% CI ${row.ci_low.toFixed(1)}–${row.ci_high.toFixed(1)}`;
  const ranked = row.rank !== null && row.rank_low !== null && row.rank_high !== null;
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing={0} className={classes.stats}>
      <Stat label="ECI" value={row.eci.toFixed(1)} sub={ci} />
      <Stat
        label="Rank"
        value={row.rank === null ? "—" : row.tiedFirst ? "=1" : `#${row.rank}`}
        sub={
          ranked
            ? `90% rank interval ${formatRange(row.rank_low ?? 0, row.rank_high ?? 0)}`
            : row.rank === null
              ? "provisional, not ranked"
              : "no rank interval"
        }
      />
      <Stat
        label="Chance of #1"
        value={row.p_first === null ? "—" : formatPercent(row.p_first)}
        sub={`of ${(fit.bootstrap_samples * fit.resamples_per_draw).toLocaleString("en")} draws`}
      />
      <Stat
        label="Benchmarks"
        value={String(row.benchmarks)}
        sub={
          row.borrowed > 0
            ? `${row.borrowed} borrowed from unrecorded thinking`
            : row.benchmarks >= fit.rank_min_benchmarks
              ? "results behind the score"
              : `ranked from ${fit.rank_min_benchmarks}`
        }
      />
    </SimpleGrid>
  );
}

/** Every variant of this model, this one highlighted, each linking to its page. */
function Variants({ row, variants }: { row: Row; variants: Row[] }) {
  return (
    <Table.ScrollContainer minWidth={420}>
      <Table
        highlightOnHover
        verticalSpacing={6}
        className="num"
        borderColor="var(--eci-card-border)"
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Variant</Table.Th>
            <Table.Th>Effort</Table.Th>
            <Table.Th ta="right">ECI</Table.Th>
            <Table.Th ta="right" visibleFrom="sm">
              90% CI
            </Table.Th>
            <Table.Th ta="right">Benchmarks</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {variants.map((v) => (
            <Table.Tr key={v.version} fw={v.version === row.version ? 700 : undefined}>
              <Table.Td>
                {v.version === row.version ? v.name : <ModelLink name={v.name} />}
              </Table.Td>
              <Table.Td c="dimmed">
                {v.effort ?? "not recorded"}
                {v.pro && v.effort === null ? " (pro)" : ""}
              </Table.Td>
              <Table.Td ta="right">{v.eci.toFixed(1)}</Table.Td>
              <Table.Td ta="right" c="dimmed" visibleFrom="sm">
                {v.ci_low === null || v.ci_high === null
                  ? ""
                  : `${v.ci_low.toFixed(1)}–${v.ci_high.toFixed(1)}`}
              </Table.Td>
              <Table.Td ta="right">{v.benchmarks}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function Facts({ row, detail, site }: { row: Row; detail: ModelDetail; site: SiteData }) {
  const firstSeen = site.first_seen[row.version] ?? null;
  const facts: [string, React.ReactNode][] = [
    ["Model", row.group],
    ["Reasoning setting", row.effort ?? "not recorded in the version id"],
    [
      "Version id",
      <Text span size="sm" ff="monospace" key="id">
        {row.version}
      </Text>,
    ],
    ["Lab", detail.organization ?? row.lab],
    ["Released", formatDate(row.release_date)],
    [
      "Weights",
      <Group gap={6} key="w">
        <Badge size="sm" color={WEIGHTS[row.weights].color}>
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
        ? `One snapshot so far: ${only.eci.toFixed(1)} on ${formatDate(only.fetched_at)}. A chart appears here once the daily runs add more.`
        : "No snapshots yet."}
    </Text>
  );
}

/** A snapshot's time: the date, plus the hour when several snapshots share a day. */
function snapshotLabel(time: number, sameDay: boolean): string {
  const day = formatDate(time);
  return sameDay
    ? `${day.replace(/, \d{4}$/, "")} ${new Date(time).toISOString().slice(11, 16)}`
    : day;
}

function History({ detail }: { detail: ModelDetail }) {
  const points = detail.history.map((h) => ({
    ...h,
    time: Date.parse(h.fetched_at),
    band: [h.ci_low ?? h.eci, h.ci_high ?? h.eci],
  }));
  const times = points.map((p) => p.time);
  const days = new Set(points.map((p) => p.fetched_at.slice(0, 10)));
  const yTicks = niceTicks(
    Math.min(...points.map((p) => p.ci_low ?? p.eci)) - 1,
    Math.max(...points.map((p) => p.ci_high ?? p.eci)) + 1,
    3,
  );
  const sameDay = days.size < points.length;
  return (
    <Stack gap={6}>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={points} margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--eci-grid)" vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={[Math.min(...times), Math.max(...times)]}
            ticks={points.length <= 6 ? times : undefined}
            tickFormatter={(t: number) => snapshotLabel(t, sameDay)}
            tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 12 }}
            tickLine={false}
            tickMargin={8}
            axisLine={{ stroke: "var(--eci-axis)" }}
            padding={{ left: 24, right: 24 }}
          />
          <YAxis
            domain={[yTicks[0] ?? "auto", yTicks.at(-1) ?? "auto"]}
            ticks={yTicks}
            width={44}
            tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            wrapperStyle={{ userSelect: "none" }}
            formatter={(v) =>
              Array.isArray(v)
                ? `${Number(v[0]).toFixed(1)}–${Number(v[1]).toFixed(1)}`
                : typeof v === "number"
                  ? v.toFixed(2)
                  : String(v)
            }
            labelFormatter={(t) => snapshotLabel(Number(t), true)}
          />
          <Area
            dataKey="band"
            name="90% CI"
            stroke="none"
            fill="var(--mantine-primary-color-filled)"
            fillOpacity={0.15}
            isAnimationActive={false}
          />
          <Line
            dataKey="eci"
            name="ECI"
            stroke="var(--mantine-primary-color-filled)"
            strokeWidth={2.5}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <Text size="sm" c="dimmed">
        {points.length} snapshots: the line is the ECI, the band its 90% interval.
      </Text>
    </Stack>
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
  // The curve's own units: slope × (ECI − difficulty). The view spans the data (and 0),
  // with a little room so no dot sits on the frame.
  const xs = points.map((p) => p.x);
  const lo = Math.floor(Math.min(0, ...xs) - 0.6);
  const hi = Math.ceil(Math.max(0, ...xs) + 0.6);
  const line = curve(lo, hi);
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((t) =>
    hi - lo <= 8 ? true : t % 2 === 0,
  );
  const pullColor = (p: FitPoint) => {
    const pts = pullPoints(p.actual, p.predicted);
    return pts > 0
      ? "var(--mantine-color-teal-filled)"
      : pts < 0
        ? "var(--mantine-color-red-filled)"
        : "var(--mantine-color-dimmed)";
  };
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--eci-grid)" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[lo, hi]}
          ticks={ticks}
          tickFormatter={(t: number) => (t === 0 ? "difficulty" : t > 0 ? `+${t}` : String(t))}
          tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 12 }}
          tickLine={false}
          tickMargin={8}
          axisLine={{ stroke: "var(--eci-axis)" }}
          height={50}
          label={{
            value: "slope × (ECI − difficulty): left is harder for this model",
            position: "insideBottom",
            offset: 0,
            fill: "var(--mantine-color-dimmed)",
            fontSize: 12,
          }}
        />
        <YAxis
          type="number"
          domain={[-0.04, 1.04]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          width={48}
          tick={{ fill: "var(--mantine-color-dimmed)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<FitTooltip />} wrapperStyle={{ userSelect: "none" }} />
        <Line
          data={line}
          dataKey="y"
          dot={false}
          activeDot={false}
          stroke="var(--mantine-color-text)"
          strokeOpacity={0.7}
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
            strokeOpacity={0.85}
            strokeWidth={2}
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
              r={4.5}
              fill={props.payload ? pullColor(props.payload) : "currentColor"}
              fillOpacity={0.9}
              stroke="var(--eci-surface)"
              strokeWidth={1.5}
            />
          )}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function pp(points: number): string {
  return `${points > 0 ? "+" : points < 0 ? "−" : "±"}${Math.abs(points)} pts`;
}

/** Actual minus predicted as a bar from a centre line, in percentage points. */
function PullBar({ points }: { points: number }) {
  const width = Math.min(Math.abs(points), 25) * 2;
  return (
    <div className={classes.pullTrack} aria-hidden>
      <div
        className={classes.pullBar}
        data-sign={points > 0 ? "up" : points < 0 ? "down" : undefined}
        style={{ width: `${width}%`, [points >= 0 ? "left" : "right"]: "50%" }}
      />
    </div>
  );
}

function HowComputed({ row, detail, site }: { row: Row; detail: ModelDetail; site: SiteData }) {
  const narrow = useMediaQuery("(max-width: 48em)") ?? false;
  const points = fitPoints(row.eci, detail.fit);
  const commit = site.latest.fit.eci_public_commit;
  return (
    <Stack gap="lg">
      <Grid gap="xl" align="center">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="md">
            <Text className={classes.prose}>
              ECI gives each model one number and each benchmark two: a <b>difficulty</b> on the
              same scale, and a <b>slope</b> for how sharply scores rise as models get more capable.
              Scores are first rescaled so random guessing is 0% and the benchmark's ceiling is
              100%. Every score is then predicted by one S-shaped (logistic) curve,{" "}
              <span className={classes.formula}>
                predicted = logistic(slope × (ECI − difficulty))
              </span>
              . Benchmark difficulty and slope come from a joint fit over every model (each model's
              variants pooled, best score per benchmark), with Claude 3.5 Sonnet at 130 and GPT-5 at
              150 fixing the scale. This variant's ECI is then the value that best matches its own
              results alone. The 90% interval comes from{" "}
              {(
                site.latest.fit.bootstrap_samples * site.latest.fit.resamples_per_draw
              ).toLocaleString("en")}{" "}
              draws over refitted benchmarks and resampled results.
            </Text>
            <Text className={classes.prose}>
              The method is Epoch AI's (
              <Anchor href={LINKS.epochEci} className={classes.keep}>
                ECI page
              </Anchor>
              , <Anchor href={LINKS.paper}>paper</Anchor>); the joint fit runs their open{" "}
              <Anchor href={`${LINKS.eciPublic}/tree/${commit}`} className={classes.keep}>
                eci-public @ {commit.slice(0, 7)}
              </Anchor>
              . Each of the {detail.fit.length} benchmarks used for {row.name} is a dot on the
              curve: dots{" "}
              <Text span c="teal" fw={700}>
                above
              </Text>{" "}
              it scored better than predicted and pull the ECI up; dots{" "}
              <Text span c="red" fw={700}>
                below
              </Text>{" "}
              pull it down.
            </Text>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <FitChart points={points} />
        </Grid.Col>
      </Grid>
      <Table.ScrollContainer minWidth={narrow ? 0 : 640}>
        <Table
          highlightOnHover
          stickyHeader
          verticalSpacing={8}
          horizontalSpacing={narrow ? "xs" : "md"}
          layout="fixed"
          className="num"
          borderColor="var(--eci-card-border)"
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Benchmark</Table.Th>
              <Table.Th ta="right" w={100} visibleFrom="sm">
                Difficulty
              </Table.Th>
              <Table.Th ta="right" w={80} visibleFrom="sm">
                Slope
              </Table.Th>
              <Table.Th ta="right" w={narrow ? 56 : 96}>
                {narrow ? "Pred." : "Predicted"}
              </Table.Th>
              <Table.Th ta="right" w={narrow ? 56 : 80}>
                {narrow ? "Act." : "Actual"}
              </Table.Th>
              <Table.Th ta="right" w={narrow ? 72 : 88}>
                Pull
              </Table.Th>
              <Table.Th w="22%" visibleFrom="md">
                <span className="chrome">Pull, ±25 pts</span>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {detail.fit
              .map((t, i) => ({ t, predicted: points[i]?.predicted ?? t.predicted }))
              .map(({ t, predicted }) => ({ t, predicted, pull: pullPoints(t.actual, predicted) }))
              .sort((a, b) => b.pull - a.pull)
              .map(({ t, predicted, pull }) => {
                return (
                  <Table.Tr key={t.benchmark}>
                    <Table.Td>
                      <BenchmarkName name={t.benchmark} borrowedFrom={t.borrowed_from} />
                    </Table.Td>
                    <Table.Td ta="right">{t.edi.toFixed(1)}</Table.Td>
                    <Table.Td ta="right">{t.slope.toFixed(3)}</Table.Td>
                    <Table.Td ta="right">{Math.round(predicted * 100)}%</Table.Td>
                    <Table.Td ta="right">{Math.round(t.actual * 100)}%</Table.Td>
                    <Table.Td
                      ta="right"
                      c={pull > 0 ? "teal" : pull < 0 ? "red" : "dimmed"}
                      fw={pull === 0 ? 400 : 600}
                    >
                      {pp(pull)}
                    </Table.Td>
                    <Table.Td visibleFrom="md">
                      <PullBar points={pull} />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}

function BenchmarkName({ name, borrowedFrom }: { name: string; borrowedFrom: string | null }) {
  if (borrowedFrom === null) return name;
  return (
    <Group gap={6} wrap="nowrap">
      <span>{name}</span>
      <BorrowedTag version={borrowedFrom} />
    </Group>
  );
}

/** Raw scores and errors get decimals by the size of the scores in their table. */
function ResultsTable({ results, detail }: { results: BenchmarkResult[]; detail: ModelDetail }) {
  const scale = (r: BenchmarkResult) => {
    const same = results.filter((x) => x.benchmark === r.benchmark).map((x) => Math.abs(x.score));
    return Math.max(...same, Math.abs(r.score));
  };
  // Columns are decided over all of the model's results, so every table lines up.
  const hasStderr = detail.results.some((r) => r.stderr !== null);
  const hasRun = detail.results.some((r) => r.run_at !== null);
  const hasFit = detail.results.some((r) => r.normalized !== null);
  return (
    <Table.ScrollContainer minWidth={720}>
      <Table
        highlightOnHover
        stickyHeader
        verticalSpacing={8}
        horizontalSpacing="md"
        layout="fixed"
        borderColor="var(--eci-card-border)"
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th w="34%">Benchmark</Table.Th>
            <Table.Th ta="right" w={100}>
              Score
            </Table.Th>
            {hasStderr && (
              <Table.Th ta="right" w={96}>
                ± stderr
              </Table.Th>
            )}
            {hasFit && (
              <Table.Th ta="right" w={104}>
                Fit sees
              </Table.Th>
            )}
            {hasRun && (
              <Table.Th ta="right" w={124}>
                Run on
              </Table.Th>
            )}
            <Table.Th>Evidence</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody className="num">
          {results.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>
                <BenchmarkName name={r.benchmark} borrowedFrom={r.borrowed_from} />
              </Table.Td>
              <Table.Td ta="right">
                <HoverTip label={`Column: ${r.score_column}`}>
                  <span className={classes.hint}>{formatScore(r.score, scale(r))}</span>
                </HoverTip>
              </Table.Td>
              {hasStderr && (
                <Table.Td ta="right" c="dimmed">
                  {r.stderr === null ? "" : formatScore(r.stderr, scale(r))}
                </Table.Td>
              )}
              {hasFit && (
                <Table.Td ta="right">
                  {r.normalized === null ? "" : `${(r.normalized * 100).toFixed(1)}%`}
                </Table.Td>
              )}
              {hasRun && (
                <Table.Td ta="right" c="dimmed">
                  {r.run_at ? formatDate(r.run_at) : ""}
                </Table.Td>
              )}
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
                    {r.source ?? ""}
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
  const lenders = [...new Set(detail.results.flatMap((r) => r.borrowed_from ?? []))].sort();
  return (
    <Stack gap="xl">
      <Text c="dimmed" className={classes.prose}>
        Every result Epoch AI's data has for this variant: the raw score as published (hover it for
        the column it comes from), its standard error where measured, and the 0–100% score the fit
        sees after rescaling (random guessing = 0%, the benchmark's ceiling = 100%). Empty columns
        are left out.
      </Text>
      {lenders.length > 0 && (
        <Text c="dimmed" className={classes.prose}>
          Also listed, marked <BorrowedTag version={lenders.join(", ")} />: every result of{" "}
          {lenders.join(", ")}, the same model run at an unrecorded thinking setting. This is the
          model's top-effort variant, so those results fill the benchmarks it has no result of its
          own for; where it has one, its own counts. They have no row of their own.
        </Text>
      )}
      <Text size="sm" c="dimmed" hiddenFrom="sm" className="chrome">
        The tables scroll sideways for more columns →
      </Text>
      <div>
        <Title order={3} className={classes.subTitle}>
          Used in ECI ({used.length})
        </Title>
        <ResultsTable results={used} detail={detail} />
      </div>
      <div>
        <Title order={3} className={classes.subTitle}>
          Not used in ECI ({unusedCount})
        </Title>
        {unused.length === 0 ? (
          <Text c="dimmed">Every result for this variant went into its score.</Text>
        ) : (
          <Accordion multiple variant="default" defaultValue={unused[0] ? [unused[0].reason] : []}>
            {unused.map((g) => (
              <Accordion.Item key={g.reason} value={g.reason}>
                <Accordion.Control>
                  <Text fw={600}>
                    {groupTitle(g.reason)}{" "}
                    <Text span c="dimmed" fw={500} className="num">
                      ({g.results.length})
                    </Text>
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <ResultsTable results={g.results} detail={detail} />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </div>
    </Stack>
  );
}

function Body({
  row,
  slug,
  site,
  variants,
}: {
  row: Row;
  slug: string;
  site: SiteData;
  variants: Row[];
}) {
  const detail = use(detailOf(slug));
  const benchmarks = detail.fit.length;
  return (
    <Stack gap="lg">
      {row.missing_areas && row.missing_areas.length > 0 && (
        <Alert color="gray" variant="light" radius="lg" title="Incomplete coverage">
          No {row.missing_areas.join(", ").toLowerCase()} benchmark behind this score, so it isn't
          ranked on the General (all-round) index. It still counts in a domain where it has enough
          of that domain's benchmarks.
        </Alert>
      )}
      {isThin(benchmarks) && (
        <Alert color="yellow" variant="light" radius="lg" title="Thin evidence">
          This score rests on only {benchmarks} benchmark{benchmarks === 1 ? "" : "s"}
          {benchmarks < site.latest.fit.rank_min_benchmarks
            ? `, fewer than the ${site.latest.fit.rank_min_benchmarks} needed for a rank`
            : ""}
          . Treat it as provisional
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
        <Grid gap="lg" align="stretch">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Section title="Model facts">
              <Facts row={row} detail={detail} site={site} />
            </Section>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Section title="Score history">
              <History detail={detail} />
            </Section>
          </Grid.Col>
        </Grid>
      )}
      {variants.length > 1 && (
        <Section title={`Variants of ${row.group} (${variants.length})`}>
          <Variants row={row} variants={variants} />
        </Section>
      )}
      <Section title="How the score came about">
        <HowComputed row={row} detail={detail} site={site} />
      </Section>
      <Section title={`Every result in the data (${detail.results.length})`}>
        <Results detail={detail} />
      </Section>
      <Text c="dimmed" className={classes.prose}>
        Benchmark data by <Anchor href={LINKS.epochData}>Epoch AI</Anchor>, licensed{" "}
        <Anchor href={LINKS.ccBy}>CC BY 4.0</Anchor>. Scores computed by ECI Live from snapshot{" "}
        {detail.snapshot}.
      </Text>
    </Stack>
  );
}

/** One model variant: its facts, its siblings, its scores, and how its ECI was computed. */
export function ModelPage({
  row,
  slug,
  site,
  variants,
  backHref,
  onBack,
}: {
  row: Row;
  slug: string;
  site: SiteData;
  /** Every variant of the model, this one included, in default order. */
  variants: Row[];
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
            <Text c="dimmed">
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
        <Body row={row} slug={slug} site={site} variants={variants} />
      </Suspense>
    </Stack>
  );
}
