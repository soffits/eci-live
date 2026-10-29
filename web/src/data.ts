// Shape of eci.json, written by the Python pipeline (src/eci_live/schema.py).

export type Weights = "open" | "closed" | "unknown";

export interface ModelScore {
  name: string;
  lab: string;
  release_date: string | null;
  eci: number;
  ci_low: number | null;
  ci_high: number | null;
  benchmarks: number;
  /** 90% bootstrap interval of the model's rank, and the share of refits ranking it first. */
  rank_low: number | null;
  rank_high: number | null;
  p_first: number | null;
  weights: Weights;
  accessibility: string | null;
  official_eci: number | null;
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
  name: string;
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

export interface CyberModel {
  name: string;
  general_name: string | null;
  lab: string;
  release_date: string | null;
  accessibility: string | null;
  weights: Weights;
  country: string | null;
  eci: number;
  ci_low: number | null;
  ci_high: number | null;
  benchmarks: number;
}

/** Epoch's own published Cyber ECI, shown as Epoch's numbers. */
export interface Cyber {
  scores: InputInfo;
  results: InputInfo;
  benchmarks: string[];
  models: CyberModel[];
}

export interface Snapshot {
  schema: number;
  id: string;
  input: InputInfo;
  fit: {
    eci_public_commit: string;
    bootstrap_samples: number;
    bootstrap_seed: number;
    /** Seeded chunks the bootstrap ran in; absent on snapshots from before chunking. */
    bootstrap_chunks?: number;
    ci_level: number;
  };
  build: { commit: string | null; run_url: string | null };
  drift: { shared_models: number; max_abs: number; mean_abs: number; tolerance: number };
  models: ModelScore[];
  /** Absent on snapshots from before domain ECIs, or when the hub couldn't be read. */
  domains?: Domains;
  cyber?: Cyber;
}

export interface SiteData {
  latest: Snapshot;
  snapshots: { id: string; fetched_at: string; sha256: string }[];
  previous_eci: Record<string, number>;
  first_seen: Record<string, string>;
  /** Model name -> file stem of its detail data, `models/<slug>.json`. */
  slugs: Record<string, string>;
}

// Detail pages (src/eci_live/schema.py, ModelDetail and friends).

export interface ModelVersion {
  version: string;
  display_name: string | null;
  release_date: string | null;
}

/** One row of the zip: a model version's score on a benchmark. */
export interface BenchmarkResult {
  /** Epoch's record id, or `<file>#<row>` for files without one. */
  id: string;
  benchmark: string;
  version: string;
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
}

/** One benchmark in this model's fit. */
export interface FitTerm {
  benchmark: string;
  edi: number;
  slope: number;
  actual: number;
  predicted: number;
}

export interface HistoryPoint {
  snapshot: string;
  fetched_at: string;
  eci: number;
  ci_low: number | null;
  ci_high: number | null;
}

export interface ModelDetail {
  name: string;
  snapshot: string;
  organization: string | null;
  country: string | null;
  training_compute_flop: number | null;
  versions: ModelVersion[];
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
  models: { name: string; country: string | null; training_compute_flop: number | null }[];
  /** [model index, benchmark index, 0-1 score]: the fit's input. */
  results: [number, number, number][];
}

/** A model as the page shows it: the published score plus derived flags. */
export interface Row extends ModelScore {
  /** The general ECI, also when `eci` holds a domain or custom score. */
  general_eci: number | null;
  country: string | null;
  training_compute_flop: number | null;
  rank: number;
  released: number | null;
  isNew: boolean;
  onEpoch: boolean;
  /** The bootstrap can't rule out that this model is the true #1. */
  tiedFirst: boolean;
  delta: number | null;
}

const DAY_MS = 86_400_000;

export function toRows(data: SiteData, newWithinDays: number, fit?: FitData | null): Row[] {
  const asOf = Date.parse(data.latest.input.fetched_at);
  const facts = new Map(fit?.snapshot === data.latest.id ? fit.models.map((m) => [m.name, m]) : []);
  return data.latest.models.map((m, i) => {
    const released = m.release_date ? Date.parse(m.release_date) : null;
    const previous = data.previous_eci[m.name];
    return {
      ...m,
      general_eci: m.eci,
      country: facts.get(m.name)?.country ?? null,
      training_compute_flop: facts.get(m.name)?.training_compute_flop ?? null,
      rank: i + 1,
      released,
      isNew: released !== null && asOf - released <= newWithinDays * DAY_MS,
      onEpoch: m.official_eci !== null,
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
