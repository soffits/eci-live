import assert from "node:assert/strict";
import { test } from "node:test";
import type { Row } from "./data.ts";
import { row } from "./testRows.ts";
import { defaultVariants, siblings } from "./variants.ts";

// Effort ranks as the pipeline writes them (src/eci_live/variants.py).
const EFFORT = {
  none: 0,
  unrecorded: 1,
  low: 3,
  k16: 26,
  unknown: 999,
  medium: 1000,
  high: 1001,
  max: 1003,
};

function variant(
  name: string,
  eci: number,
  effort: keyof typeof EFFORT,
  benchmarks: number,
  extra: Partial<Row> = {},
): Row {
  return row(name, "Lab", "2026-09-03", eci, benchmarks >= 4 ? 1 : null, {
    group: "Astra",
    effort,
    effort_rank: EFFORT[effort],
    benchmarks,
    ...extra,
  });
}

const names = (rows: Row[]) => defaultVariants(rows).rows.map((r) => r.name);

test("the highest effort stands for the model, not the best score", () => {
  const rows = [
    variant("Astra (low)", 171, "low", 6),
    variant("Astra (max)", 169, "max", 16),
    variant("Astra (high)", 170, "high", 7),
  ];
  assert.deepEqual(names(rows), ["Astra (max)"]);
  assert.equal(defaultVariants(rows).skipped.size, 0);
});

test("a top effort with too few benchmarks falls back to the next one, and says so", () => {
  const max = variant("Astra (max)", 172, "max", 2);
  const rows = [
    max,
    variant("Astra (high)", 170, "high", 7),
    variant("Astra (low)", 160, "low", 9),
  ];
  const { rows: shown, skipped } = defaultVariants(rows);
  assert.deepEqual(
    shown.map((r) => r.name),
    ["Astra (high)"],
  );
  assert.deepEqual(skipped.get("Astra (high)"), [max]);
});

test("pro is passed over unless it is the model's only ranked variant", () => {
  const pro = variant("Astra (pro, max)", 175, "max", 8, { pro: true });
  const high = variant("Astra (high)", 170, "high", 7);
  assert.deepEqual(names([pro, high]), ["Astra (high)"]);
  assert.deepEqual(names([pro, variant("Astra (low)", 150, "low", 2)]), ["Astra (pro, max)"]);
  // A thin pro sibling isn't reported as skipped for a non-pro pick.
  assert.equal(defaultVariants([variant("P", 175, "max", 2, { pro: true }), high]).skipped.size, 0);
});

test("unknown thinking ranks below medium but above budgets and low", () => {
  const rows = [
    variant("Astra (unknown thinking)", 160, "unknown", 5),
    variant("Astra (16k thinking)", 165, "k16", 5),
    variant("Astra (low)", 166, "low", 5),
  ];
  assert.deepEqual(names(rows), ["Astra (unknown thinking)"]);
  assert.deepEqual(names([...rows, variant("Astra (medium)", 150, "medium", 5)]), [
    "Astra (medium)",
  ]);
});

test("without effort levels, the variant with the most benchmarks, then the newest", () => {
  const a = variant("R1 · chutes", 150, "unrecorded", 5);
  const b = variant("R1", 149, "unrecorded", 9);
  assert.deepEqual(names([a, b]), ["R1"]);
  const older = variant("Old", 151, "unrecorded", 9, { released: Date.parse("2025-01-01") });
  assert.deepEqual(names([older, b]), ["R1"]);
});

test("one variant per model, models without a ranked variant drop out, order is kept", () => {
  const rows = [
    row("Other", "Lab", "2026-01-01", 180, 1),
    variant("Astra (high)", 170, "high", 7),
    row("Thin", "Lab", "2026-01-01", 165, null, { benchmarks: 2 }),
  ];
  assert.deepEqual(names(rows), ["Other", "Astra (high)"]);
});

test("siblings are the model's other variants in default order", () => {
  const max = variant("Astra (max)", 169, "max", 16);
  const high = variant("Astra (high)", 170, "high", 7);
  const low = variant("Astra (low)", 160, "low", 2);
  const other = row("Other", "Lab", null, 150, 2);
  assert.deepEqual(
    siblings(low, [low, other, high, max]).map((r) => r.name),
    ["Astra (max)", "Astra (high)"],
  );
});

test("with orProvisional, a model with no ranked variant still shows its top effort", () => {
  const rows = [variant("Terra (max)", 168, "max", 3), variant("Terra (low)", 150, "low", 2)];
  assert.deepEqual(names(rows), []);
  assert.deepEqual(
    defaultVariants(rows, true).rows.map((r) => r.name),
    ["Terra (max)"],
  );
});
