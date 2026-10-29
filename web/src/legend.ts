export interface LegendEntry {
  label: string;
  color: string;
  labs: string[];
  /** The catch-all entry for labs drawn in the shared fallback colour. */
  other: boolean;
}

/**
 * One legend entry per colour actually drawn, so every lab's dots have exactly one entry
 * of the same colour. Labs on the shared fallback colour become one "Other labs" entry,
 * placed last; labs that share a colour of their own (Google DeepMind and Google) share an
 * entry named after the first. `labs` come in display order.
 */
export function legendEntries(
  labs: string[],
  colorOf: (lab: string) => string,
  hasOwnColor: (lab: string) => boolean,
): LegendEntry[] {
  const byColor = new Map<string, string[]>();
  for (const lab of labs) {
    const color = colorOf(lab);
    byColor.set(color, [...(byColor.get(color) ?? []), lab]);
  }
  const entries = [...byColor].map(([color, group]) => {
    const other = !group.every(hasOwnColor);
    return { label: other ? "Other labs" : (group[0] ?? ""), color, labs: group, other };
  });
  return [...entries.filter((e) => !e.other), ...entries.filter((e) => e.other)];
}
