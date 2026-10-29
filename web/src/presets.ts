import type { CyberModel, FitData, Row, SiteData } from "./data";
import { capability, type Term } from "./refit.ts";

export type PresetId = "general" | "software" | "math" | "cyber" | "custom";
export const PRESET_IDS: PresetId[] = ["general", "software", "math", "cyber", "custom"];

/** Epoch's choices: 1 to 4 benchmarks, 2 by default for every selection but General. */
export const MIN_BENCHMARKS = [1, 2, 3, 4] as const;
export const DEFAULT_MIN_BENCHMARKS = 2;

export interface Selection {
  preset: PresetId;
  /** Benchmarks of a custom selection, by index-benchmark name. */
  custom: string[];
  minBenchmarks: number;
}

export interface PresetView {
  /** Rows scored on this selection, best first, ranked within it. */
  rows: Row[];
  label: string;
  /** Benchmarks the selection uses (empty for General: all of them). */
  benchmarks: string[];
  /** Whether the scores have intervals (custom selections are point estimates). */
  intervals: boolean;
  /** Scores are Epoch's published numbers rather than this refit's. */
  epochs: boolean;
}

export interface PresetOption {
  value: PresetId;
  label: string;
  short: string;
  disabled: boolean;
}

const SHORT: Record<PresetId, string> = {
  general: "General",
  software: "Software eng.",
  math: "Math",
  cyber: "Cyber",
  custom: "Custom",
};

export function presetOptions(site: SiteData, fit: FitData | null): PresetOption[] {
  const presets = new Map(site.latest.domains?.presets.map((p) => [p.id, p.label]));
  return PRESET_IDS.map((value) => {
    const label =
      value === "general"
        ? "General ECI"
        : value === "cyber"
          ? "Cyber ECI (Epoch's)"
          : value === "custom"
            ? "Custom selection"
            : (presets.get(value) ?? SHORT[value]);
    const disabled =
      (value === "software" || value === "math") && !presets.has(value)
        ? true
        : value === "cyber"
          ? !site.latest.cyber
          : value === "custom" && fit?.snapshot !== site.latest.id;
    return { value, label, short: SHORT[value], disabled };
  });
}

/** Rank rows within a selection: best first, numbered 1..n, no rank-interval data. */
function ranked(rows: Row[]): Row[] {
  return [...rows]
    .sort((a, b) => b.eci - a.eci)
    .map((r, i) => ({
      ...r,
      rank: i + 1,
      rank_low: null,
      rank_high: null,
      p_first: null,
      tiedFirst: false,
      delta: null,
    }));
}

function cyberRow(m: CyberModel, asOf: number, newWithinDays: number): Row {
  const released = m.release_date ? Date.parse(m.release_date) : null;
  return {
    name: m.name,
    lab: m.lab,
    release_date: m.release_date,
    eci: m.eci,
    ci_low: m.ci_low,
    ci_high: m.ci_high,
    benchmarks: m.benchmarks,
    rank_low: null,
    rank_high: null,
    p_first: null,
    weights: m.weights,
    accessibility: m.accessibility,
    official_eci: null,
    general_eci: null,
    country: m.country,
    training_compute_flop: null,
    rank: 0,
    released,
    isNew: released !== null && asOf - released <= newWithinDays * 86_400_000,
    onEpoch: true,
    tiedFirst: false,
    delta: null,
  };
}

/** Each model's fit-input terms on `benchmarks`, keyed by model name. */
export function customTerms(fit: FitData, benchmarks: string[]): Map<string, Term[]> {
  const wanted = new Set(benchmarks);
  const out = new Map<string, Term[]>();
  for (const [m, b, perf] of fit.results) {
    const bench = fit.benchmarks[b];
    const model = fit.models[m];
    if (!bench || !model || !wanted.has(bench.name)) continue;
    const terms = out.get(model.name) ?? [];
    terms.push({ perf, edi: bench.edi, slope: bench.slope });
    out.set(model.name, terms);
  }
  return out;
}

/**
 * The rows the page shows for a selection. General is the refit as published. Software
 * engineering and Math are the domain ECIs computed in CI, Cyber is Epoch's own table, and a
 * custom selection is refit here with the same solver (point estimates). All but General keep
 * only models with at least `minBenchmarks` of the selection's benchmarks.
 */
export function applyPreset(
  general: Row[],
  site: SiteData,
  fit: FitData | null,
  selection: Selection,
  newWithinDays: number,
): PresetView {
  const { preset, minBenchmarks } = selection;
  const byName = new Map(general.map((r) => [r.name, r]));
  const base: PresetView = {
    rows: general,
    label: "ECI",
    benchmarks: [],
    intervals: true,
    epochs: false,
  };
  if (preset === "software" || preset === "math") {
    const found = site.latest.domains?.presets.find((p) => p.id === preset);
    if (!found) return base;
    const rows = found.scores.flatMap((s) => {
      const row = byName.get(s.name);
      if (!row || s.benchmarks < minBenchmarks) return [];
      return [
        { ...row, eci: s.eci, ci_low: s.ci_low, ci_high: s.ci_high, benchmarks: s.benchmarks },
      ];
    });
    return { ...base, rows: ranked(rows), label: found.label, benchmarks: found.benchmarks };
  }
  if (preset === "cyber") {
    const cyber = site.latest.cyber;
    if (!cyber) return base;
    const asOf = Date.parse(site.latest.input.fetched_at);
    const rows = cyber.models.flatMap((m) => {
      if (m.benchmarks < minBenchmarks) return [];
      const row = m.general_name ? byName.get(m.general_name) : undefined;
      if (!row) return [cyberRow(m, asOf, newWithinDays)];
      return [
        { ...row, eci: m.eci, ci_low: m.ci_low, ci_high: m.ci_high, benchmarks: m.benchmarks },
      ];
    });
    return {
      ...base,
      rows: ranked(rows),
      label: "Cyber ECI",
      benchmarks: cyber.benchmarks,
      epochs: true,
    };
  }
  if (preset === "custom") {
    if (!fit || fit.snapshot !== site.latest.id) return base;
    const terms = customTerms(fit, selection.custom);
    const rows = [...terms].flatMap(([name, t]) => {
      const row = byName.get(name);
      const eci = t.length >= minBenchmarks ? capability(t) : null;
      if (!row || eci === null) return [];
      return [{ ...row, eci, ci_low: null, ci_high: null, benchmarks: t.length }];
    });
    return {
      ...base,
      rows: ranked(rows),
      label: "Custom ECI",
      benchmarks: selection.custom,
      intervals: false,
    };
  }
  return base;
}
