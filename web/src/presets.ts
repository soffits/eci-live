import type { FitData, Row, SiteData } from "./data";
import { gapsOf } from "./eligibility.ts";
import { capability, type Term } from "./refit.ts";

export type PresetId = "general" | "software" | "math" | "custom";
export const PRESET_IDS: PresetId[] = ["general", "software", "math", "custom"];

export const MIN_BENCHMARKS = [1, 2, 3, 4, 6, 8] as const;

/** General: 4, the fit's own minimum for a model and the rank intervals' threshold, so a
 * variant with one or two results can't top the board. Domains and custom sets: 2, as on
 * Epoch's page, since a domain has only a handful of benchmarks. */
export function defaultMinBenchmarks(preset: PresetId): number {
  return preset === "general" ? 4 : 2;
}

export interface Selection {
  preset: PresetId;
  /** Benchmarks of a custom selection, by index-benchmark name. */
  custom: string[];
  minBenchmarks: number;
}

export interface PresetView {
  /** Every variant scored on this selection, best first. Those with at least the minimum
   * number of benchmarks are ranked 1..n; thinner ones have rank null. */
  rows: Row[];
  label: string;
  /** Benchmarks the selection uses (empty for General: all of them). */
  benchmarks: string[];
  /** Whether the scores have intervals (custom selections are point estimates). */
  intervals: boolean;
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
  custom: "Custom",
};

export function presetOptions(site: SiteData, fit: FitData | null): PresetOption[] {
  const presets = new Map(site.latest.domains?.presets.map((p) => [p.id, p.label]));
  return PRESET_IDS.map((value) => {
    const label =
      value === "general"
        ? "General ECI"
        : value === "custom"
          ? "Custom selection"
          : (presets.get(value) ?? SHORT[value]);
    const disabled =
      value === "software" || value === "math"
        ? !presets.has(value)
        : value === "custom" && fit?.snapshot !== site.latest.id;
    return { value, label, short: SHORT[value], disabled };
  });
}

/** Best first; qualifying rows (eligibility.ts) numbered 1..n, the rest unranked. General is
 * the all-round board. A selection other than General has no rank intervals or change since
 * the last snapshot. */
export function ranked(rows: Row[], min: number, general = false): Row[] {
  let place = 0;
  return [...rows]
    .sort((a, b) => b.eci - a.eci)
    .map((r) => {
      const gaps = gapsOf(r, min, general);
      const rank = gaps.length === 0 ? ++place : null;
      return general
        ? { ...r, rank, gaps }
        : {
            ...r,
            rank,
            gaps,
            rank_low: null,
            rank_high: null,
            p_first: null,
            tiedFirst: false,
            delta: null,
          };
    });
}

/** Each variant's fit-input terms on `benchmarks`, keyed by model version. */
export function customTerms(fit: FitData, benchmarks: string[]): Map<string, Term[]> {
  const wanted = new Set(benchmarks);
  const out = new Map<string, Term[]>();
  for (const [m, b, perf] of fit.results) {
    const bench = fit.benchmarks[b];
    const model = fit.models[m];
    if (!bench || !model || !wanted.has(bench.name)) continue;
    const terms = out.get(model.version) ?? [];
    terms.push({ perf, edi: bench.edi, slope: bench.slope });
    out.set(model.version, terms);
  }
  return out;
}

/**
 * The rows the page shows for a selection. General is the index as published. Software
 * engineering and Math are the domain ECIs computed in CI, and a custom selection is scored
 * here with the same solver (point estimates). Every selection ranks only variants with at
 * least `minBenchmarks` of its benchmarks.
 */
export function applyPreset(
  general: Row[],
  site: SiteData,
  fit: FitData | null,
  selection: Selection,
): PresetView {
  const { preset, minBenchmarks } = selection;
  const byVersion = new Map(general.map((r) => [r.version, r]));
  const base: PresetView = {
    rows: ranked(general, minBenchmarks, true),
    label: "ECI",
    benchmarks: [],
    intervals: true,
  };
  if (preset === "software" || preset === "math") {
    const found = site.latest.domains?.presets.find((p) => p.id === preset);
    if (!found) return base;
    const rows = found.scores.flatMap((s) => {
      const row = byVersion.get(s.version);
      if (!row) return [];
      return [
        { ...row, eci: s.eci, ci_low: s.ci_low, ci_high: s.ci_high, benchmarks: s.benchmarks },
      ];
    });
    return {
      ...base,
      rows: ranked(rows, minBenchmarks),
      label: found.label,
      benchmarks: found.benchmarks,
    };
  }
  if (preset === "custom") {
    if (!fit || fit.snapshot !== site.latest.id) return base;
    const terms = customTerms(fit, selection.custom);
    const rows = [...terms].flatMap(([version, t]) => {
      const row = byVersion.get(version);
      const eci = capability(t);
      if (!row || eci === null) return [];
      return [{ ...row, eci, ci_low: null, ci_high: null, benchmarks: t.length }];
    });
    return {
      ...base,
      rows: ranked(rows, minBenchmarks),
      label: "Custom ECI",
      benchmarks: selection.custom,
      intervals: false,
    };
  }
  return base;
}
