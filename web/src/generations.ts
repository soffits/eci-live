import type { Row } from "./data";

/** Labs that are really "lab not recorded", so their models aren't one lab's line-up. */
const NO_LAB = "Unknown";

/**
 * A model is superseded when the same lab has released a newer model with an ECI at least
 * as high. Models without a release date or a known lab are never superseded.
 */
export function isSuperseded(row: Row, rows: Row[]): boolean {
  const released = row.released;
  if (released === null || row.lab === NO_LAB) return false;
  return rows.some(
    (other) =>
      other.lab === row.lab &&
      other.released !== null &&
      other.released > released &&
      other.eci >= row.eci,
  );
}

/** Each lab's current generation: the rows no newer model from the same lab matches. */
export function currentGeneration(rows: Row[]): Row[] {
  return rows.filter((r) => !isSuperseded(r, rows));
}
