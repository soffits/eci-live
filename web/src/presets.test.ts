import assert from "node:assert/strict";
import { test } from "node:test";
import type { FitData, SiteData, Snapshot } from "./data.ts";
import { applyPreset, defaultMinBenchmarks, presetOptions } from "./presets.ts";
import { row } from "./testRows.ts";

const general = [
  row("A", "Lab", "2026-01-01", 150, 1, { tiedFirst: true, rank_low: 1, delta: 0.5 }),
  row("B", "Lab", "2026-02-01", 140, 2),
  row("C", "Lab", "2026-03-01", 145, 3, { benchmarks: 2 }),
];

const snapshot = {
  id: "s",
  input: { fetched_at: "2026-10-29T00:00:00Z" },
  domains: {
    presets: [
      {
        id: "software",
        label: "Software engineering ECI",
        domain: "Software engineering",
        benchmarks: ["X", "Y"],
        scores: [
          { version: "B", eci: 160, ci_low: 155, ci_high: 165, benchmarks: 2 },
          { version: "A", eci: 145, ci_low: 140, ci_high: 150, benchmarks: 1 },
        ],
      },
    ],
  },
} as unknown as Snapshot;
const site = { latest: snapshot } as SiteData;

const fit: FitData = {
  snapshot: "s",
  benchmarks: [
    { name: "X", edi: 140, slope: 0.1, domains: [] },
    { name: "Y", edi: 150, slope: 0.2, domains: [] },
  ],
  models: [
    { version: "A", country: null, training_compute_flop: null },
    { version: "B", country: null, training_compute_flop: null },
  ],
  results: [
    [0, 0, 1 / (1 + Math.exp(-0.1 * (150 - 140)))],
    [0, 1, 1 / (1 + Math.exp(-0.2 * (150 - 150)))],
    [1, 0, 1 / (1 + Math.exp(-0.1 * (140 - 140)))],
  ],
};

test("General is the index as published; thin variants stay, unranked", () => {
  const view = applyPreset(general, site, fit, { preset: "general", custom: [], minBenchmarks: 4 });
  assert.deepEqual(
    view.rows.map((r) => [r.name, r.rank]),
    [
      ["A", 1],
      ["C", null],
      ["B", 2],
    ],
  );
  // General keeps its rank intervals and change since the last snapshot.
  const a = view.rows[0];
  assert.ok(a?.tiedFirst && a.delta === 0.5);
  const loose = applyPreset(general, site, fit, {
    preset: "general",
    custom: [],
    minBenchmarks: 2,
  });
  assert.deepEqual(
    loose.rows.map((r) => r.rank),
    [1, 2, 3],
  );
});

test("a domain preset ranks its own scores and applies min. benchmarks", () => {
  const two = applyPreset(general, site, fit, { preset: "software", custom: [], minBenchmarks: 2 });
  assert.deepEqual(
    two.rows.map((r) => [r.name, r.eci, r.rank, r.general_eci]),
    [
      ["B", 160, 1, 140],
      ["A", 145, null, 150],
    ],
  );
  assert.ok(two.rows.every((r) => !r.tiedFirst && r.rank_low === null && r.delta === null));
  const one = applyPreset(general, site, fit, { preset: "software", custom: [], minBenchmarks: 1 });
  assert.deepEqual(
    one.rows.map((r) => r.rank),
    [1, 2],
  );
});

test("General asks for the fit's own minimum, the rest for Epoch's", () => {
  assert.equal(defaultMinBenchmarks("general"), 4);
  assert.equal(defaultMinBenchmarks("software"), 2);
});

test("a custom selection is scored in the browser, as point estimates", () => {
  const sel = { preset: "custom" as const, custom: ["X", "Y"], minBenchmarks: 1 };
  const view = applyPreset(general, site, fit, sel);
  assert.equal(view.intervals, false);
  const a = view.rows.find((r) => r.name === "A");
  assert.ok(a && Math.abs(a.eci - 150) < 1e-3 && a.ci_low === null && a.benchmarks === 2);
  const strict = applyPreset(general, site, fit, { ...sel, minBenchmarks: 2 });
  assert.deepEqual(
    strict.rows.filter((r) => r.rank !== null).map((r) => r.name),
    ["A"],
  );
});

test("options are disabled when their data is missing", () => {
  const bare = { latest: { id: "s" } } as SiteData;
  const off = presetOptions(bare, null)
    .filter((o) => o.disabled)
    .map((o) => o.value);
  assert.deepEqual(off, ["software", "math", "custom"]);
  assert.deepEqual(
    presetOptions(site, fit)
      .filter((o) => o.disabled)
      .map((o) => o.value),
    ["math"],
  );
});

test("General is all-round: a variant missing an area is provisional there, not on a domain", () => {
  const terra = row("B", "Lab", "2026-02-01", 140, 2, { missing_areas: ["Coding"] });
  const rows = [general[0], terra].filter((r) => r !== undefined);
  const board = applyPreset(rows, site, fit, { preset: "general", custom: [], minBenchmarks: 4 });
  const b = board.rows.find((r) => r.name === "B");
  assert.ok(b && b.rank === null && b.gaps.some((g) => g.includes("coding")));
  const sw = applyPreset(rows, site, fit, { preset: "software", custom: [], minBenchmarks: 2 });
  assert.equal(sw.rows.find((r) => r.name === "B")?.rank, 1);
});
