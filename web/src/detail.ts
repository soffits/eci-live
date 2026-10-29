import type { BenchmarkResult, FitTerm } from "./data";

/** At most this many benchmarks in the fit counts as thin evidence (the index needs 4). */
export const THIN_EVIDENCE_BENCHMARKS = 5;

export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** The fit's prediction of a 0-1 score: logistic(slope × (ECI − EDI)). */
export function predictedScore(eci: number, term: Pick<FitTerm, "edi" | "slope">): number {
  return logistic(term.slope * (eci - term.edi));
}

export interface FitPoint {
  benchmark: string;
  /** How far the model sits above the benchmark's difficulty, in the curve's units. */
  x: number;
  actual: number;
  predicted: number;
  /** Actual minus predicted: positive pulls the ECI up. */
  pull: number;
}

/** Each fitted benchmark as a point against the one logistic curve all of them share. */
export function fitPoints(eci: number, fit: FitTerm[]): FitPoint[] {
  return fit.map((t) => {
    const predicted = predictedScore(eci, t);
    return {
      benchmark: t.benchmark,
      x: t.slope * (eci - t.edi),
      actual: t.actual,
      predicted,
      pull: t.actual - predicted,
    };
  });
}

/** The logistic curve sampled across [from, to]. */
export function curve(from: number, to: number, steps = 60): { x: number; y: number }[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const x = from + ((to - from) * i) / steps;
    return { x, y: logistic(x) };
  });
}

export function isThin(benchmarksInFit: number): boolean {
  return benchmarksInFit <= THIN_EVIDENCE_BENCHMARKS;
}

/** Results the fit used, by benchmark, and the rest grouped under their reason. */
export function splitResults(results: BenchmarkResult[]): {
  used: BenchmarkResult[];
  unused: { reason: string; results: BenchmarkResult[] }[];
} {
  const byName = (a: BenchmarkResult, b: BenchmarkResult) =>
    a.benchmark.localeCompare(b.benchmark) || a.version.localeCompare(b.version);
  const groups = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    if (r.used) continue;
    const reason = r.reason ?? "Not in the fit's input.";
    groups.set(reason, [...(groups.get(reason) ?? []), r]);
  }
  return {
    used: results.filter((r) => r.used).sort(byName),
    unused: [...groups]
      .map(([reason, rs]) => ({ reason, results: rs.sort(byName) }))
      .sort((a, b) => b.results.length - a.results.length),
  };
}

/** Training compute as e.g. "9.4 × 10²⁶ FLOP". */
export function formatFlop(flop: number): string {
  const exponent = Math.floor(Math.log10(flop));
  const mantissa = flop / 10 ** exponent;
  const superscript = String(exponent).replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)] ?? d);
  return `${mantissa.toFixed(1)} × 10${superscript} FLOP`;
}

/** Actual minus predicted in whole percentage points, from the rounded percentages the
 * table shows, so the three columns always agree. */
export function pullPoints(actual: number, predicted: number): number {
  return Math.round(actual * 100) - Math.round(predicted * 100);
}

// The pipeline's fixed reasons (src/eci_live/detail.py), as titles for a group of results.
const GROUP_TITLES: Record<string, string> = {
  "This benchmark isn't part of the index.": "Benchmarks outside the index",
  "Another version of this model scored higher here; the fit keeps the best score.":
    "Lower scores of another version (the fit keeps each benchmark's best)",
  "Another version of this model has the same score; it is counted once.":
    "Same score as another version (counted once)",
  "Not in the fit's input.": "Not in the fit's input",
};

/** A title for a group of unused results; "Replaced in the fit by …" stays as written. */
export function groupTitle(reason: string): string {
  return GROUP_TITLES[reason] ?? reason.replace(/\.$/, "");
}

/** A version's readable setting, e.g. "unknown thinking" for "GPT-6 Astra (unknown thinking)". */
export function versionLabel(
  version: string,
  versions: { version: string; display_name: string | null }[],
  model: string,
): string {
  const display = versions.find((v) => v.version === version)?.display_name;
  if (!display) return version;
  const setting = display.startsWith(model) ? display.slice(model.length).trim() : display;
  return setting.replace(/^\((.*)\)$/, "$1") || display;
}

/** A raw score with precision fitted to its scale, so a column's decimals line up. */
export function formatScore(value: number, scale: number): string {
  const digits = scale <= 1 ? 3 : scale < 100 ? 1 : 0;
  return value.toLocaleString("en", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
