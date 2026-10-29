import type { Row } from "./data";

/**
 * Which variant stands for its model when only one is shown: a non-pro variant (pro is a
 * separate compute mode) over a pro one, then the highest reasoning effort, then more
 * benchmarks, a newer release and the name. Effort decides, not the score.
 */
export function preferred(a: Row, b: Row): number {
  return (
    Number(a.pro) - Number(b.pro) ||
    b.effort_rank - a.effort_rank ||
    b.benchmarks - a.benchmarks ||
    (b.released ?? 0) - (a.released ?? 0) ||
    a.name.localeCompare(b.name)
  );
}

export interface Defaults {
  /** One variant per model group, in the input's order. */
  rows: Row[];
  /** Shown name -> higher-effort siblings passed over for having too few benchmarks. */
  skipped: Map<string, Row[]>;
}

/**
 * Each model's default variant: its highest-effort variant that is ranked on the board, or the
 * next one down when that misses the board's requirement. With `orProvisional`, a model with
 * no ranked variant still gets its highest-effort one (drawn as provisional), so the newest
 * models show up even before they have enough evidence; otherwise such models are left out.
 */
export function defaultVariants(rows: Row[], orProvisional = false): Defaults {
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  const chosen = new Set<Row>();
  const skipped = new Map<string, Row[]>();
  for (const members of groups.values()) {
    const ranked = members.filter((r) => r.rank !== null).sort(preferred)[0];
    const pick = ranked ?? (orProvisional ? [...members].sort(preferred)[0] : undefined);
    if (!pick) continue;
    chosen.add(pick);
    if (!ranked) continue;
    const passed = members
      .filter((r) => r.rank === null && r.pro === pick.pro && r.effort_rank > pick.effort_rank)
      .sort(preferred);
    if (passed.length > 0) skipped.set(pick.name, passed);
  }
  return { rows: rows.filter((r) => chosen.has(r)), skipped };
}

/** The other variants of a row's model, in default order. */
export function siblings(row: Row, rows: Row[]): Row[] {
  return rows.filter((r) => r.group === row.group && r.name !== row.name).sort(preferred);
}
