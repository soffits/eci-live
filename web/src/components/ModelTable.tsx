import { Badge, Group, Progress, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import { TABLE_PAGE_SIZE, WEIGHTS } from "../config";
import type { Row } from "../data";
import { formatDate, formatRange } from "../format";
import { LabLogo, useLabColor } from "./LabLogo";
import { NewMark, PreviewMark } from "./ModelBadges";
import { ModelLink } from "./ModelLink";

type SortKey = "rank" | "name" | "lab" | "released" | "eci" | "benchmarks" | "delta";

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
      <Text size="xs" c="dimmed">
        {value === null ? "new" : "0.0"}
      </Text>
    );
  }
  return (
    <Text size="xs" fw={600} c={value > 0 ? "teal" : "red"} className="num">
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
  const tick = 2.5;
  return (
    <Progress.Root size={10} w={120} radius="xl" aria-hidden>
      <Progress.Section value={low} color="transparent" />
      <Progress.Section
        value={Math.max(mid - tick / 2 - low, 0)}
        color={color}
        opacity="var(--eci-capsule-opacity)"
      />
      <Progress.Section value={tick} color={color} />
      <Progress.Section
        value={Math.max(high - mid - tick / 2, 0)}
        color={color}
        opacity="var(--eci-capsule-opacity)"
      />
    </Progress.Root>
  );
}

/** Every scored model: searchable, sortable, paginated. */
export function ModelTable({ rows, hasPrevious }: { rows: Row[]; hasPrevious: boolean }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<DataTableSortStatus<Row>>({
    columnAccessor: "rank",
    direction: "asc",
  });

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q
      ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.lab.toLowerCase().includes(q))
      : rows;
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...found].sort((a, b) => sign * compare(a, b, sort.columnAccessor as SortKey));
  }, [rows, query, sort]);

  const lastPage = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const records = sorted.slice((current - 1) * TABLE_PAGE_SIZE, current * TABLE_PAGE_SIZE);

  // One scale per page, so intervals stay readable and comparable within what is shown.
  const lows = records.map((r) => r.ci_low ?? r.eci);
  const highs = records.map((r) => r.ci_high ?? r.eci);
  const min = Math.min(...lows);
  const span = Math.max(...highs) - min || 1;
  const scale = (v: number) => ((v - min) / span) * 100;

  return (
    <Stack gap="sm">
      <TextInput
        placeholder="Search models or labs"
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setPage(1);
        }}
        aria-label="Search models or labs"
      />
      <DataTable
        records={records}
        idAccessor="name"
        highlightOnHover
        classNames={{ pagination: "chrome" }}
        verticalSpacing={8}
        verticalAlign="center"
        sortStatus={sort}
        onSortStatusChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        totalRecords={sorted.length}
        recordsPerPage={TABLE_PAGE_SIZE}
        page={current}
        onPageChange={setPage}
        paginationText={({ from, to, totalRecords }) => `${from}–${to} of ${totalRecords} models`}
        paginationSize="sm"
        noRecordsText="No models match"
        minHeight={sorted.length ? undefined : 160}
        columns={[
          {
            accessor: "rank",
            title: "#",
            sortable: true,
            width: 56,
            textAlign: "right",
            render: (r) => (
              <Tooltip
                label={
                  r.rank_low === null || r.rank_high === null
                    ? "No rank interval"
                    : `90% rank interval ${formatRange(r.rank_low, r.rank_high)}`
                }
              >
                <Text size="sm" fw={700} className="num" c={r.tiedFirst ? "violet" : undefined}>
                  {r.tiedFirst ? "=1" : r.rank}
                </Text>
              </Tooltip>
            ),
          },
          {
            accessor: "name",
            title: "Model",
            sortable: true,
            render: (r) => (
              <Group gap={8} wrap="nowrap" align="flex-start">
                <LabLogo lab={r.lab} />
                <Group gap="2px 6px">
                  <Text size="sm" fw={600}>
                    <ModelLink name={r.name} />
                  </Text>
                  {r.isNew && <NewMark />}
                  {!r.onEpoch && <PreviewMark row={r} compact />}
                </Group>
              </Group>
            ),
          },
          { accessor: "lab", title: "Lab", sortable: true, visibleMediaQuery: "(min-width: 62em)" },
          {
            accessor: "released",
            title: "Released",
            sortable: true,
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
            title: "90% CI",
            visibleMediaQuery: "(min-width: 36em)",
            render: (r) => (
              <Group gap={10} wrap="nowrap">
                <CiCapsule row={r} scale={scale} />
                <Text size="xs" c="dimmed" className="num" style={{ whiteSpace: "nowrap" }}>
                  {r.ci_low === null || r.ci_high === null
                    ? "anchor"
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
            render: (r) => <Delta value={r.delta} />,
          },
          {
            accessor: "benchmarks",
            title: "Benchmarks",
            sortable: true,
            textAlign: "right",
            visibleMediaQuery: "(min-width: 62em)",
            render: (r) => <span className="num">{r.benchmarks}</span>,
          },
          {
            accessor: "weights",
            title: "Weights",
            visibleMediaQuery: "(min-width: 48em)",
            render: (r) => (
              <Tooltip label={r.accessibility ?? "Access not recorded by Epoch"}>
                <Badge
                  size="sm"
                  variant={WEIGHTS[r.weights].variant}
                  color={WEIGHTS[r.weights].color}
                >
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
