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
