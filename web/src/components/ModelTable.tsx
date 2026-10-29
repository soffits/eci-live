import { Badge, Group, Stack, Text, TextInput } from "@mantine/core";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import type { Row } from "../data";
import { formatDate } from "../format";
import { LabLogo } from "./LabLogo";
import { ModelBadges } from "./ModelBadges";

const WEIGHTS = {
  open: { label: "Open", color: "teal" },
  closed: { label: "Closed", color: "gray" },
  unknown: { label: "Other", color: "yellow" },
} as const;

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
  if (value === null)
    return (
      <Text size="xs" c="dimmed">
        –
      </Text>
    );
  if (Math.abs(value) < 0.05)
    return (
      <Text size="xs" c="dimmed">
        0.0
      </Text>
    );
  return (
    <Text size="xs" fw={600} c={value > 0 ? "teal" : "red"}>
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}
    </Text>
  );
}

/** Every scored model: searchable, sortable. */
export function ModelTable({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DataTableSortStatus<Row>>({
    columnAccessor: "rank",
    direction: "asc",
  });

  const records = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q
      ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.lab.toLowerCase().includes(q))
      : rows;
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...found].sort((a, b) => sign * compare(a, b, sort.columnAccessor as SortKey));
  }, [rows, query, sort]);

  return (
    <Stack gap="sm">
      <TextInput
        placeholder="Search models or labs"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        aria-label="Search models or labs"
        radius="xl"
      />
      <DataTable
        records={records}
        idAccessor="name"
        height={620}
        highlightOnHover
        verticalSpacing="xs"
        sortStatus={sort}
        onSortStatusChange={setSort}
        noRecordsText="No models match"
        columns={[
          { accessor: "rank", title: "#", sortable: true, width: 52, textAlign: "right" },
          {
            accessor: "name",
            title: "Model",
            sortable: true,
            render: (r) => (
              <Group gap={8} wrap="nowrap">
                <LabLogo lab={r.lab} />
                <Stack gap={2}>
                  <Text size="sm" fw={600}>
                    {r.name}
                  </Text>
                  <ModelBadges row={r} />
                </Stack>
              </Group>
            ),
          },
          { accessor: "lab", title: "Lab", sortable: true, visibleMediaQuery: "(min-width: 48em)" },
          {
            accessor: "released",
            title: "Released",
            sortable: true,
            visibleMediaQuery: "(min-width: 36em)",
            render: (r) => formatDate(r.released),
          },
          {
            accessor: "eci",
            title: "ECI",
            sortable: true,
            textAlign: "right",
            render: (r) => (
              <Stack gap={0} align="flex-end">
                <Text size="sm" fw={800} ff="monospace">
                  {r.eci.toFixed(1)}
                </Text>
                <Text size="xs" c="dimmed" ff="monospace" style={{ whiteSpace: "nowrap" }}>
                  {r.ci_low === null || r.ci_high === null
                    ? "anchor"
                    : `${r.ci_low.toFixed(1)}–${r.ci_high.toFixed(1)}`}
                </Text>
              </Stack>
            ),
          },
          {
            accessor: "delta",
            title: "Δ",
            sortable: true,
            textAlign: "right",
            visibleMediaQuery: "(min-width: 48em)",
            render: (r) => <Delta value={r.delta} />,
          },
          {
            accessor: "benchmarks",
            title: "Benchmarks",
            sortable: true,
            textAlign: "right",
            visibleMediaQuery: "(min-width: 48em)",
          },
          {
            accessor: "weights",
            title: "Weights",
            visibleMediaQuery: "(min-width: 36em)",
            render: (r) => (
              <Badge
                size="sm"
                variant="light"
                color={WEIGHTS[r.weights].color}
                title={r.accessibility ?? undefined}
              >
                {WEIGHTS[r.weights].label}
              </Badge>
            ),
          },
        ]}
      />
    </Stack>
  );
}
