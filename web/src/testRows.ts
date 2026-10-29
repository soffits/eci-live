import type { Row } from "./data.ts";

/** A minimal scored variant for tests; its own model group unless `extra` says otherwise. */
export function row(
  name: string,
  lab: string,
  released: string | null,
  eci: number,
  rank: number | null = 0,
  extra: Partial<Row> = {},
): Row {
  return {
    version: name,
    name,
    group: name,
    effort: null,
    effort_rank: 1,
    pro: false,
    lab,
    release_date: released,
    eci,
    ci_low: eci - 2,
    ci_high: eci + 2,
    benchmarks: 10,
    rank_low: null,
    rank_high: null,
    p_first: null,
    weights: "closed",
    accessibility: null,
    missing_areas: [],
    borrowed: 0,
    general_eci: eci,
    country: null,
    training_compute_flop: null,
    rank,
    gaps: rank === null ? ["too few"] : [],
    released: released === null ? null : Date.parse(released),
    isNew: false,
    tiedFirst: false,
    delta: null,
    ...extra,
  };
}
