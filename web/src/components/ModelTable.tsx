import { Badge, Group, Progress, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import { TABLE_PAGE_SIZE, WEIGHTS } from "../config";
import type { Row } from "../data";
import { provisionalReason } from "../eligibility";
import { formatDate, formatRange } from "../format";
import { LabLogo, useLabColor } from "./LabLogo";
import { BorrowedMark, MarkDots, MarkDotsKey, NewMark, ProvisionalMark } from "./ModelBadges";
import { ModelLink } from "./ModelLink";
import classes from "./ModelTable.module.css";

type SortKey = "rank" | "name" | "lab" | "released" | "eci" | "benchmarks" | "delta" | "weights";

function compare(a: Row, b: Row, key: SortKey): number {
  const x = a[key];
  const y = b[key];
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y);
}

function Delta({ value }: { value: number | null }) {
  if (value === null || Math.abs(value) < 0.05) {
    return (
      <Text size="sm" c="dimmed">
        {value === null ? "new" : "–"}
      </Text>
    );
  }
  return (
    <Text size="sm" fw={600} c={value > 0 ? "teal" : "red"} className="num">
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}
    </Text>
  );
}

/** The 90% interval on a shared scale: Progress sections for the gap, the interval up to
 * the estimate, a tick at the estimate, and the rest of the interval. */
function CiCapsule({ row, scale }: { row: Row; scale: (v: number) => number }) {
  const color = useLabColor()(row.lab);
  const low = scale(row.ci_low ?? row.eci);
  const mid = scale(row.eci);
  const high = scale(row.ci_high ?? row.eci);
  const tick = 3;
  return (
    <Progress.Root size={12} w={120} radius="xl" bg="var(--eci-grid)" aria-hidden>
      <Progress.Section value={low} color="transparent" />
      <Progress.Section value={Math.max(mid - tick / 2 - low, 0)} color={color} opacity={0.55} />
      <Progress.Section value={tick} color="var(--mantine-color-text)" />
      <Progress.Section value={Math.max(high - mid - tick / 2, 0)} color={color} opacity={0.55} />
    </Progress.Root>
  );
}

function SortIcon({ path }: { path: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--mantine-color-dimmed)"
      strokeWidth="2.2"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

/** Every scored variant, provisional ones included but unranked: searchable, sortable,
 * paginated. */
export function ModelTable({
  rows,
  hasPrevious,
  intervals = true,
}: {
  rows: Row[];
  hasPrevious: boolean;
  intervals?: boolean;
}) {
  const narrow = useMediaQuery("(max-width: 48em)") ?? false;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<DataTableSortStatus<Row>>({
    columnAccessor: "rank",
    direction: "asc",
  });

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q
      ? rows.filter((r) =>
          [r.name, r.group, r.lab, r.version].some((t) => t.toLowerCase().includes(q)),
        )
      : rows;
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...found].sort((a, b) => sign * compare(a, b, sort.columnAccessor as SortKey));
  }, [rows, query, sort]);

  const lastPage = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const records = sorted.slice((current - 1) * TABLE_PAGE_SIZE, current * TABLE_PAGE_SIZE);

  // One scale per page, so intervals stay readable and comparable within what is shown; a
  // little room at both ends so no bar looks clamped.
  const lows = records.map((r) => r.ci_low ?? r.eci);
  const highs = records.map((r) => r.ci_high ?? r.eci);
  const pad = (Math.max(...highs) - Math.min(...lows)) * 0.04 || 1;
  const min = Math.min(...lows) - pad;
  const max = Math.max(...highs) + pad;
  const scale = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <Stack gap="sm">
      <TextInput
        leftSection={
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        }
        size={narrow ? "md" : "sm"}
        maw={narrow ? undefined : 420}
        placeholder="Search models, variants or labs"
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setPage(1);
        }}
        aria-label="Search models, variants or labs"
      />
      {narrow && (
        <div className={`${classes.key} chrome`}>
          <MarkDotsKey />
        </div>
      )}
      <DataTable
        records={records}
        idAccessor="name"
        highlightOnHover
        withTableBorder
        borderRadius="md"
        classNames={{ pagination: `chrome ${classes.pagination}` }}
        verticalSpacing={narrow ? 10 : 8}
        horizontalSpacing={narrow ? 6 : "sm"}
        verticalAlign="center"
        sortStatus={sort}
        sortIcons={{
          sorted: <SortIcon path="M7 14l5-5 5 5" />,
          unsorted: <SortIcon path="M8 9l4-4 4 4M8 15l4 4 4-4" />,
        }}
        onSortStatusChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        totalRecords={sorted.length}
        recordsPerPage={TABLE_PAGE_SIZE}
        page={current}
        onPageChange={setPage}
        paginationText={({ from, to, totalRecords }) => `${from}–${to} of ${totalRecords} variants`}
        paginationSize="sm"
        noRecordsText="No variants match"
        minHeight={sorted.length ? undefined : 160}
        columns={[
          {
            accessor: "rank",
            title: "#",
            sortable: true,
            textAlign: "right",
            noWrap: true,
            render: (r) => (
              <Tooltip
                label={
                  r.rank === null
                    ? provisionalReason(r)
                    : r.rank_low === null || r.rank_high === null
                      ? "No rank interval"
                      : `90% rank interval ${formatRange(r.rank_low, r.rank_high)}`
                }
              >
                <Text size="sm" fw={700} className="num" c={r.tiedFirst ? "violet" : undefined}>
                  {r.rank === null ? "–" : r.tiedFirst ? "=1" : r.rank}
                </Text>
              </Tooltip>
            ),
          },
          {
            accessor: "name",
            title: "Model variant",
            sortable: true,
            noWrap: !narrow,
            render: (r) => (
              <Group gap={8} wrap="nowrap">
                <LabLogo lab={r.lab} />
                <Text size="sm" fw={600} className={narrow ? undefined : classes.name}>
                  <ModelLink name={r.name} />
                </Text>
                {narrow ? <MarkDots row={r} /> : r.isNew && <NewMark />}
                {r.rank === null && <ProvisionalMark row={r} />}
              </Group>
            ),
          },
          {
            accessor: "lab",
            title: "Lab",
            sortable: true,
            noWrap: true,
            visibleMediaQuery: "(min-width: 62em)",
          },
          {
            accessor: "released",
            title: "Released",
            sortable: true,
            noWrap: true,
            visibleMediaQuery: "(min-width: 48em)",
            render: (r) => formatDate(r.released),
          },
          {
            accessor: "eci",
            title: "ECI",
            sortable: true,
            textAlign: "right",
            render: (r) => (
              <Text size="sm" fw={800} className="num">
                {r.eci.toFixed(1)}
              </Text>
            ),
          },
          {
            accessor: "ci",
            title: intervals ? `90% CI (${min.toFixed(0)}–${max.toFixed(0)} scale)` : "Interval",
            noWrap: true,
            hidden: !intervals,
            visibleMediaQuery: "(min-width: 48em)",
            render: (r) => (
              <Group gap={10} wrap="nowrap">
                <CiCapsule row={r} scale={scale} />
                <Text size="sm" c="dimmed" className="num">
                  {r.ci_low === null || r.ci_high === null
                    ? "point estimate"
                    : `${r.ci_low.toFixed(1)}–${r.ci_high.toFixed(1)}`}
                </Text>
              </Group>
            ),
          },
          {
            accessor: "delta",
            title: "Δ",
            sortable: true,
            textAlign: "right",
            hidden: !hasPrevious,
            noWrap: true,
            render: (r) => <Delta value={r.delta} />,
          },
          {
            accessor: "benchmarks",
            title: "Benchmarks",
            sortable: true,
            textAlign: "right",
            noWrap: true,
            visibleMediaQuery: "(min-width: 48em)",
            render: (r) => (
              <Group gap={6} wrap="nowrap" justify="flex-end">
                {r.general_eci === r.eci && <BorrowedMark row={r} />}
                <span className="num">{r.benchmarks}</span>
              </Group>
            ),
          },
          {
            accessor: "weights",
            title: "Weights",
            sortable: true,
            // The last column takes the spare width, so the others hug their content.
            width: "100%",
            noWrap: true,
            visibleMediaQuery: "(min-width: 48em)",
            render: (r) => (
              <Tooltip label={r.accessibility ?? "Access not recorded by Epoch"}>
                <Badge size="sm" color={WEIGHTS[r.weights].color}>
                  {r.weights === "unknown"
                    ? (r.accessibility ?? "Unknown")
                    : WEIGHTS[r.weights].label}
                </Badge>
              </Tooltip>
            ),
          },
        ]}
      />
    </Stack>
  );
}
