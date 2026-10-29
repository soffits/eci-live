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
}

/** A model as the page shows it: the published score plus derived flags. */
export interface Row extends ModelScore {
  rank: number;
  released: number | null;
  isNew: boolean;
  onEpoch: boolean;
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
      delta: previous === undefined ? null : m.eci - previous,
    };
  });
}

export async function loadSiteData(): Promise<SiteData> {
  const response = await fetch(`${import.meta.env.BASE_URL}eci.json`);
  if (!response.ok) throw new Error(`eci.json: HTTP ${response.status}`);
  return response.json();
}
