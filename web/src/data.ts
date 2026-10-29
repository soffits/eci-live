// Shape of eci.json, written by the Python pipeline (src/eci_live/schema.py).

export type Weights = "open" | "closed" | "unknown";

/** One model variant: an Epoch model version (a reasoning setting, provider or mode). */
export interface ModelScore {
  version: string;
  /** Unique display name. */
  name: string;
  /** Epoch's model group; its variants are siblings. */
  group: string;
  /** The reasoning setting from the version id ("max", "16k thinking", "pro, max"). */
  effort: string | null;
  /** Higher is more reasoning effort (src/eci_live/variants.py). */
  effort_rank: number;
  /** Pro mode (parallel sampling) rather than an effort level. */
  pro: boolean;
  lab: string;
  release_date: string | null;
  eci: number;
  ci_low: number | null;
  ci_high: number | null;
  benchmarks: number;
  /** How many of `benchmarks` are borrowed: the model's results at an unrecorded thinking
   * setting, on benchmarks this, its top variant, has none of its own. */
  borrowed: number;
  /** 90% interval of the rank and the share of draws ranking it first, among variants with
   * at least `fit.rank_min_benchmarks` benchmarks; null for thinner ones. */
  rank_low: number | null;
  rank_high: number | null;
  p_first: number | null;
  weights: Weights;
  accessibility: string | null;
  /** Core areas its benchmarks don't cover (empty: all-round); null if coverage is unknown. */
  missing_areas: string[] | null;
}

/** An area the General (all-round) index needs covered, as hub domain tags. */
export interface CoreArea {
  name: string;
  domains: string[];
}

/** A model group in the group-level fit that sets the scale and benchmark parameters. */
export interface GroupScore {
  name: string;
  eci: number;
  ci_low: number | null;
  ci_high: number | null;
  benchmarks: number;
}

/** An index benchmark and the domain tags Epoch's benchmark hub gives it. */
export interface DomainBenchmark {
  benchmark: string;
  hub_id: string | null;
  domains: string[];
  percentage: boolean;
  listed: boolean;
}

export interface DomainScore {
  version: string;
  eci: number;
  ci_low: number | null;
  ci_high: number | null;
  benchmarks: number;
}

export interface Preset {
  id: string;
  label: string;
  domain: string;
  benchmarks: string[];
  scores: DomainScore[];
}

export interface InputInfo {
  url: string;
  sha256: string;
  fetched_at: string;
  last_modified: string | null;
  archive_url: string | null;
}

export interface Domains {
  hub_page: string;
  hub_module: InputInfo;
  resamples_per_draw: number;
  seed: number;
  benchmarks: DomainBenchmark[];
  presets: Preset[];
}

export interface Snapshot {
  schema: number;
  id: string;
  input: InputInfo;
  fit: {
    eci_public_commit: string;
    bootstrap_samples: number;
    bootstrap_seed: number;
    bootstrap_chunks: number;
    ci_level: number;
    /** Resamples of a variant's own results per bootstrap draw, for its interval. */
    resamples_per_draw: number;
    /** Rank intervals count variants with at least this many benchmarks. */
    rank_min_benchmarks: number;
  };
  build: { commit: string | null; run_url: string | null };
  /** Variants, best first. */
  models: ModelScore[];
  groups: GroupScore[];
  core_areas: CoreArea[];
  /** Absent when the hub couldn't be read. */
  domains?: Domains;
  /** Unrecorded-thinking version -> the top variant its results were folded into. */
  folded: Record<string, string>;
}

export interface SiteData {
  latest: Snapshot;
  snapshots: { id: string; fetched_at: string; sha256: string }[];
  /** Keyed by model version. */
  previous_eci: Record<string, number>;
  first_seen: Record<string, string>;
  /** Model version -> file stem of its detail data, `models/<slug>.json`. */
  slugs: Record<string, string>;
  /** Slug a folded version's page had -> the slug of the variant it was folded into. */
  redirects: Record<string, string>;
}

// Detail pages (src/eci_live/schema.py, ModelDetail and friends).

/** One row of the zip: a model version's score on a benchmark. */
export interface BenchmarkResult {
  /** Epoch's record id, or `<file>#<row>` for files without one. */
  id: string;
  benchmark: string;
  score: number;
  score_column: string;
  stderr: number | null;
  log_url: string | null;
  source: string | null;
  source_url: string | null;
  run_at: string | null;
  /** The 0-1 score the fit sees, for index benchmarks. */
  normalized: number | null;
  used: boolean;
  /** Why a result didn't enter the fit, in plain words. */
  reason: string | null;
  /** The unrecorded-thinking version that ran it, when it isn't this variant's own. */
  borrowed_from: string | null;
}

/** One benchmark in this model's fit. */
export interface FitTerm {
  benchmark: string;
  edi: number;
  slope: number;
  actual: number;
  predicted: number;
  /** The unrecorded-thinking version the score was borrowed from, if any. */
  borrowed_from: string | null;
}

export interface HistoryPoint {
  snapshot: string;
  fetched_at: string;
  eci: number;
  ci_low: number | null;
  ci_high: number | null;
}

export interface ModelDetail {
  version: string;
  name: string;
  snapshot: string;
  organization: string | null;
  country: string | null;
  training_compute_flop: number | null;
  history: HistoryPoint[];
  fit: FitTerm[];
  results: BenchmarkResult[];
}

// fit.json (src/eci_live/schema.py, FitData).

export interface FitBenchmark {
  name: string;
  edi: number;
  slope: number;
  domains: string[];
}

export interface FitData {
  snapshot: string;
  benchmarks: FitBenchmark[];
  models: { version: string; country: string | null; training_compute_flop: number | null }[];
  /** [model index, benchmark index, 0-1 score]: each variant's input. */
  results: [number, number, number][];
}

/** A variant as the page shows it: the published score plus derived flags. */
export interface Row extends ModelScore {
  /** The general ECI, also when `eci` holds a domain or custom score. */
  general_eci: number | null;
  country: string | null;
  training_compute_flop: number | null;
  /** Place among the board's qualifying variants; null for the rest. */
  rank: number | null;
  /** What it lacks to qualify for the board (eligibility.ts); empty when it does. */
  gaps: string[];
  released: number | null;
  isNew: boolean;
  /** The bootstrap can't rule out that this model is the true #1. */
  tiedFirst: boolean;
  delta: number | null;
}

const DAY_MS = 86_400_000;

export function toRows(data: SiteData, newWithinDays: number, fit?: FitData | null): Row[] {
  const asOf = Date.parse(data.latest.input.fetched_at);
  const facts = new Map(
    fit?.snapshot === data.latest.id ? fit.models.map((m) => [m.version, m]) : [],
  );
  return data.latest.models.map((m, i) => {
    const released = m.release_date ? Date.parse(m.release_date) : null;
    const previous = data.previous_eci[m.version];
    return {
      ...m,
      general_eci: m.eci,
      country: facts.get(m.version)?.country ?? null,
      training_compute_flop: facts.get(m.version)?.training_compute_flop ?? null,
      rank: i + 1,
      gaps: [],
      released,
      isNew: released !== null && asOf - released <= newWithinDays * DAY_MS,
      tiedFirst: m.rank_low === 1,
      delta: previous === undefined ? null : m.eci - previous,
    };
  });
}

export async function loadDetail(slug: string): Promise<ModelDetail> {
  const response = await fetch(`${import.meta.env.BASE_URL}models/${slug}.json`);
  if (!response.ok) throw new Error(`models/${slug}.json: HTTP ${response.status}`);
  return response.json();
}

/** The explore views' data; null if it is missing, so the rest of the page still works. */
export async function loadFitData(): Promise<FitData | null> {
  const response = await fetch(`${import.meta.env.BASE_URL}fit.json`);
  return response.ok ? response.json() : null;
}

export async function loadSiteData(): Promise<SiteData> {
  const response = await fetch(`${import.meta.env.BASE_URL}eci.json`);
  if (!response.ok) throw new Error(`eci.json: HTTP ${response.status}`);
  return response.json();
}
