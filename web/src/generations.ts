import type { Row } from "./data";

/** Labs that are really "lab not recorded", so their models aren't one lab's line-up. */
const NO_LAB = "Unknown";

/**
 * A model's line within its lab: the name with version numbers and date tags removed, so
 * "GPT-6.1 Sol" and "GPT-5.6 Sol" share the line "gpt sol" while Astra, Terra and Sol stay
 * apart, and "GLM-5.3-Flash" stays apart from "GLM-5.3".
 */
export function lineOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/[a-z]?\d+(\.\d+)*[a-z]?\b/g, (m) => (/^[a-z]\d/.test(m) ? m.charAt(0) : " "))
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A model is superseded when the same lab has released a newer model in the same line, so each
 * line shows only its latest version. Lines come from the model group's name, so all
 * variants of a model share one. Models without a release date or a known lab never are.
 */
export function isSuperseded(row: Row, rows: Row[]): boolean {
  const released = row.released;
  if (released === null || row.lab === NO_LAB) return false;
  const line = lineOf(row.group);
  return rows.some(
    (other) =>
      other.lab === row.lab &&
      other.released !== null &&
      other.released > released &&
      lineOf(other.group) === line,
  );
}

/** How many of each lab's most recently updated lines count as its current line-up. */
export const LINES_PER_LAB = 4;

/**
 * Each lab's current generation: rows no newer model of the same line matches, from the
 * lab's LINES_PER_LAB most recently released lines, so retired lines (an old Codex or Pro)
 * drop out once the lab has moved on. Undated rows and unknown labs are always kept.
 */
export function currentGeneration(rows: Row[], linesPerLab = LINES_PER_LAB): Row[] {
  const kept = rows.filter((r) => !isSuperseded(r, rows));
  const lastRelease = new Map<string, Map<string, number>>();
  for (const r of kept) {
    if (r.released === null || r.lab === NO_LAB) continue;
    const lines = lastRelease.get(r.lab) ?? new Map<string, number>();
    const line = lineOf(r.group);
    lines.set(line, Math.max(lines.get(line) ?? r.released, r.released));
    lastRelease.set(r.lab, lines);
  }
  const recent = new Map<string, Set<string>>();
  for (const [lab, lines] of lastRelease) {
    const newest = [...lines.entries()].sort((a, b) => b[1] - a[1]).slice(0, linesPerLab);
    recent.set(lab, new Set(newest.map(([line]) => line)));
  }
  return kept.filter(
    (r) =>
      r.released === null || r.lab === NO_LAB || (recent.get(r.lab)?.has(lineOf(r.group)) ?? true),
  );
}
