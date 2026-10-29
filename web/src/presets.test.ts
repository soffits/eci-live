import assert from "node:assert/strict";
import { test } from "node:test";
import type { FitData, SiteData, Snapshot } from "./data.ts";
import { applyPreset, presetOptions } from "./presets.ts";
import { row } from "./testRows.ts";

const general = [row("A", "Lab", "2026-01-01", 150, 1), row("B", "Lab", "2026-02-01", 140, 2)];

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
          { name: "B", eci: 160, ci_low: 155, ci_high: 165, benchmarks: 2 },
          { name: "A", eci: 145, ci_low: 140, ci_high: 150, benchmarks: 1 },
        ],
      },
    ],
  },
  cyber: {
    benchmarks: ["CTF"],
    models: [
      {
        name: "Mythos",
        general_name: null,
        lab: "Lab",
        release_date: "2026-09-01",
        accessibility: null,
        weights: "unknown",
        country: null,
        eci: 170,
        ci_low: 165,
        ci_high: 175,
        benchmarks: 3,
      },
      {
        name: "A (cyber name)",
        general_name: "A",
        lab: "Lab",
        release_date: null,
        accessibility: null,
        weights: "closed",
        country: null,
        eci: 152,
        ci_low: 150,
        ci_high: 154,
        benchmarks: 2,
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
    { name: "A", country: null, training_compute_flop: null },
    { name: "B", country: null, training_compute_flop: null },
  ],
  results: [
    [0, 0, 1 / (1 + Math.exp(-0.1 * (150 - 140)))],
    [0, 1, 1 / (1 + Math.exp(-0.2 * (150 - 150)))],
    [1, 0, 1 / (1 + Math.exp(-0.1 * (140 - 140)))],
  ],
};

test("General is the refit as published", () => {
  const view = applyPreset(
    general,
    site,
    fit,
    { preset: "general", custom: [], minBenchmarks: 2 },
    30,
  );
  assert.deepEqual(view.rows, general);
});

test("a domain preset ranks its own scores and applies min. benchmarks", () => {
  const two = applyPreset(
    general,
    site,
    fit,
    { preset: "software", custom: [], minBenchmarks: 2 },
    30,
  );
  assert.deepEqual(
    two.rows.map((r) => [r.name, r.eci, r.rank, r.general_eci]),
    [["B", 160, 1, 140]],
  );
  const one = applyPreset(
    general,
    site,
    fit,
    { preset: "software", custom: [], minBenchmarks: 1 },
    30,
  );
  assert.deepEqual(
    one.rows.map((r) => r.name),
    ["B", "A"],
  );
});

test("Cyber is Epoch's table, including models without a general ECI", () => {
  const view = applyPreset(
    general,
    site,
    fit,
    { preset: "cyber", custom: [], minBenchmarks: 2 },
    30,
  );
  assert.ok(view.epochs);
  assert.deepEqual(
    view.rows.map((r) => [r.name, r.eci, r.general_eci]),
    [
      ["Mythos", 170, null],
      ["A", 152, 150],
    ],
  );
});

test("a custom selection is refit in the browser, as point estimates", () => {
  const sel = { preset: "custom" as const, custom: ["X", "Y"], minBenchmarks: 1 };
  const view = applyPreset(general, site, fit, sel, 30);
  assert.equal(view.intervals, false);
  const a = view.rows.find((r) => r.name === "A");
  assert.ok(a && Math.abs(a.eci - 150) < 1e-3 && a.ci_low === null && a.benchmarks === 2);
  const strict = applyPreset(general, site, fit, { ...sel, minBenchmarks: 2 }, 30);
  assert.deepEqual(
    strict.rows.map((r) => r.name),
    ["A"],
  );
});

test("options are disabled when their data is missing", () => {
  const bare = { latest: { id: "s" } } as SiteData;
  const off = presetOptions(bare, null)
    .filter((o) => o.disabled)
    .map((o) => o.value);
  assert.deepEqual(off, ["software", "math", "cyber", "custom"]);
  assert.deepEqual(
    presetOptions(site, fit)
      .filter((o) => o.disabled)
      .map((o) => o.value),
    ["math"],
  );
});
