import { ACCESS_COLORS, COUNTRY_COLORS, WEIGHTS } from "./config";
import type { Row } from "./data";

export type ColorBy = "lab" | "country" | "access";
export const COLOR_BY: { value: ColorBy; label: string }[] = [
  { value: "lab", label: "Lab" },
  { value: "country", label: "Country" },
  { value: "access", label: "Access" },
];

const OTHER_COUNTRY = "Other or not recorded";

/** A model's country: the first listed organisation's. */
export function countryOf(row: Row): string {
  const first = row.country?.split(",")[0]?.trim();
  return first && first in COUNTRY_COLORS ? first : OTHER_COUNTRY;
}

const shade = (name: string) => `var(--mantine-color-${name}-filled)`;

export interface KeyEntry {
  label: string;
  color: string;
}

/** Colour of a row under the country or access colouring (labs use their own colours). */
export function groupColor(row: Row, by: Exclude<ColorBy, "lab">): string {
  if (by === "access") return shade(ACCESS_COLORS[row.weights]);
  const country = countryOf(row);
  return shade(COUNTRY_COLORS[country] ?? "gray");
}

/** The key for country or access colouring, listing only groups present in `rows`. */
export function groupKey(rows: Row[], by: Exclude<ColorBy, "lab">): KeyEntry[] {
  if (by === "access") {
    return (Object.keys(ACCESS_COLORS) as (keyof typeof ACCESS_COLORS)[])
      .filter((w) => rows.some((r) => r.weights === w))
      .map((w) => ({ label: WEIGHTS[w].label, color: shade(ACCESS_COLORS[w]) }));
  }
  const present = new Set(rows.map(countryOf));
  return [...Object.keys(COUNTRY_COLORS), OTHER_COUNTRY]
    .filter((c) => present.has(c))
    .map((c) => ({
      label: c === "United States of America" ? "United States" : c,
      color: shade(COUNTRY_COLORS[c] ?? "gray"),
    }));
}
