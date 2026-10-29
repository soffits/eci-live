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
 * A model is superseded when the same lab has released a newer model in the same line with
 * an ECI at least as high. Models without a release date or a known lab are never superseded.
 */
export function isSuperseded(row: Row, rows: Row[]): boolean {
  const released = row.released;
  if (released === null || row.lab === NO_LAB) return false;
  const line = lineOf(row.name);
  return rows.some(
    (other) =>
      other.lab === row.lab &&
      other.released !== null &&
      other.released > released &&
      other.eci >= row.eci &&
      lineOf(other.name) === line,
  );
}

/** Each lab's current generation: the rows no newer model of the same line matches. */
export function currentGeneration(rows: Row[]): Row[] {
  return rows.filter((r) => !isSuperseded(r, rows));
}
