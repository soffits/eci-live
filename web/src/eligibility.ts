import type { Row } from "./data";

/**
 * What a variant lacks to be ranked on a board: too few of the board's benchmarks, and on
 * the General (all-round) board any core area its benchmarks don't cover. Empty when it
 * qualifies. The one rule every board, chart and table uses.
 */
export function gapsOf(
  row: Pick<Row, "benchmarks" | "missing_areas">,
  minBenchmarks: number,
  allRound: boolean,
): string[] {
  const gaps: string[] = [];
  if (row.benchmarks < minBenchmarks) {
    gaps.push(`${row.benchmarks} of the ${minBenchmarks} benchmarks needed`);
  }
  if (allRound && row.missing_areas && row.missing_areas.length > 0) {
    gaps.push(`no ${row.missing_areas.join(", ").toLowerCase()} benchmark`);
  }
  return gaps;
}

/** A ranked row qualifies for its board; a provisional one is shown only if picked. */
export function isProvisional(row: Pick<Row, "gaps">): boolean {
  return row.gaps.length > 0;
}

/** Why a row is provisional, as one sentence for a tooltip. */
export function provisionalReason(row: Pick<Row, "gaps">): string {
  return `Provisional: ${row.gaps.join("; ")}. Its score is a rough estimate from the benchmarks it has, and it isn't ranked.`;
}
