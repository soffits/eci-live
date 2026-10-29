import type { Row } from "./data.ts";

/** A minimal scored model for tests. */
export function row(
  name: string,
  lab: string,
  released: string | null,
  eci: number,
  rank = 0,
): Row {
  return {
    name,
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
    official_eci: eci,
    rank,
    released: released === null ? null : Date.parse(released),
    isNew: false,
    onEpoch: true,
    tiedFirst: false,
    delta: null,
  };
}
