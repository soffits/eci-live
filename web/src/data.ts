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

export interface Snapshot {
  schema: number;
  id: string;
  input: {
    url: string;
    sha256: string;
    fetched_at: string;
    last_modified: string | null;
    archive_url: string | null;
  };
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

/** A model as the page shows it: the published score plus derived flags. */
export interface Row extends ModelScore {
  rank: number;
  released: number | null;
  isNew: boolean;
  onEpoch: boolean;
  /** The bootstrap can't rule out that this model is the true #1. */
  tiedFirst: boolean;
  delta: number | null;
}

const DAY_MS = 86_400_000;

export function toRows(data: SiteData, newWithinDays: number): Row[] {
  const asOf = Date.parse(data.latest.input.fetched_at);
  return data.latest.models.map((m, i) => {
    const released = m.release_date ? Date.parse(m.release_date) : null;
    const previous = data.previous_eci[m.name];
    return {
      ...m,
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

export async function loadSiteData(): Promise<SiteData> {
  const response = await fetch(`${import.meta.env.BASE_URL}eci.json`);
  if (!response.ok) throw new Error(`eci.json: HTTP ${response.status}`);
  return response.json();
}
