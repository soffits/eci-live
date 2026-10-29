import type { Row, Weights } from "./data";

export type WeightsFilter = "all" | Weights;

export interface Filters {
  weights: WeightsFilter;
  labs: string[];
  /** Inclusive release-month range, as months since year 0. */
  months: [number, number];
}

export function monthOf(time: number): number {
  const d = new Date(time);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function monthLabel(month: number): string {
  const date = new Date(Date.UTC(Math.floor(month / 12), month % 12));
  return date.toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function monthBounds(rows: Row[]): [number, number] {
  const months = rows.flatMap((r) => (r.released === null ? [] : [monthOf(r.released)]));
  return [Math.min(...months), Math.max(...months)];
}

export function activeFilterCount(f: Filters, bounds: [number, number]): number {
  const dates = f.months[0] !== bounds[0] || f.months[1] !== bounds[1];
  return Number(f.weights !== "all") + Number(f.labs.length > 0) + Number(dates);
}

export function applyFilters(rows: Row[], f: Filters, bounds: [number, number]): Row[] {
  const fullRange = f.months[0] === bounds[0] && f.months[1] === bounds[1];
  return rows.filter((r) => {
    if (f.weights !== "all" && r.weights !== f.weights) return false;
    if (f.labs.length > 0 && !f.labs.includes(r.lab)) return false;
    if (fullRange) return true;
    if (r.released === null) return false;
    const m = monthOf(r.released);
    return m >= f.months[0] && m <= f.months[1];
  });
}
