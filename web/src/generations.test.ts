import assert from "node:assert/strict";
import { test } from "node:test";
import type { Row } from "./data.ts";
import { currentGeneration } from "./generations.ts";

function row(name: string, lab: string, released: string | null, eci: number): Row {
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
    rank: 0,
    released: released === null ? null : Date.parse(released),
    isNew: false,
    onEpoch: true,
    tiedFirst: false,
    delta: null,
  };
}

const names = (rows: Row[]) => currentGeneration(rows).map((r) => r.name);

test("hides a model once its lab releases a newer one that scores at least as high", () => {
  const old = row("A1", "Lab A", "2025-01-01", 150);
  const better = row("A2", "Lab A", "2025-06-01", 155);
  const equal = row("A3", "Lab A", "2025-09-01", 155);
  assert.deepEqual(names([old, better, equal]), ["A3"]);
});

test("keeps an older model that still beats its lab's newer releases", () => {
  const flagship = row("A1", "Lab A", "2025-01-01", 160);
  const smaller = row("A2", "Lab A", "2025-06-01", 150);
  assert.deepEqual(names([flagship, smaller]), ["A1", "A2"]);
});

test("only compares within a lab", () => {
  const a = row("A1", "Lab A", "2025-01-01", 150);
  const b = row("B1", "Lab B", "2025-06-01", 170);
  assert.deepEqual(names([a, b]), ["A1", "B1"]);
});

test("same release date is not newer", () => {
  const x = row("A1", "Lab A", "2025-06-01", 150);
  const y = row("A2", "Lab A", "2025-06-01", 160);
  assert.deepEqual(names([x, y]), ["A1", "A2"]);
});

test("models without a date or a known lab are never hidden", () => {
  const undated = row("A0", "Lab A", null, 140);
  const newer = row("A1", "Lab A", "2025-06-01", 160);
  const unknownOld = row("U1", "Unknown", "2024-01-01", 120);
  const unknownNew = row("U2", "Unknown", "2025-01-01", 130);
  assert.deepEqual(names([undated, newer, unknownOld, unknownNew]), ["A0", "A1", "U1", "U2"]);
});
