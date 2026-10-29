import type { Row } from "./data";

export function formatDate(time: number | string | null): string {
  if (time === null) return "unknown";
  return new Date(time).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatCi(row: Row): string {
  if (row.ci_low === null || row.ci_high === null) return "scale anchor (fixed)";
  return `90% CI ${row.ci_low.toFixed(1)}–${row.ci_high.toFixed(1)}`;
}
