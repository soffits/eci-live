import type { Row } from "./data";

/**
 * The chart's rows: the top models plus any variants the user picked that aren't already
 * among them, best first. `added` names the picked rows the chart wouldn't otherwise show.
 */
export function withPicked(
  top: Row[],
  all: Row[],
  picked: string[],
): { rows: Row[]; added: Set<string> } {
  const shown = new Set(top.map((r) => r.name));
  const wanted = new Set(picked);
  const extra = all.filter((r) => wanted.has(r.name) && !shown.has(r.name));
  return {
    rows: [...top, ...extra].sort((a, b) => b.eci - a.eci),
    added: new Set(extra.map((r) => r.name)),
  };
}
