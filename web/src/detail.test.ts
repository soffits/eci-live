import assert from "node:assert/strict";
import { test } from "node:test";
import type { BenchmarkResult } from "./data.ts";
import { curve, fitPoints, formatFlop, isThin, predictedScore, splitResults } from "./detail.ts";

// Rows exported by the pipeline (models/gpt-6-astra.json, models/beam-1-0.json) for the
// snapshot of 2026-10-29, with the published ECIs 168.89 and 150.17.
const ASTRA = 168.89;
const ASTRA_FIT = [
  {
    benchmark: "Mystery Game Puzzles",
    edi: 163.072,
    slope: 0.16599,
    actual: 0.8237,
    predicted: 0.7242,
  },
  { benchmark: "SpireClimb", edi: 175.811, slope: 0.23887, actual: 0.2567, predicted: 0.1606 },
  { benchmark: "WeirdML", edi: 145.65, slope: 0.08069, actual: 0.9357, predicted: 0.867 },
];
const BEAM = 150.17;
const BEAM_FIT = [
  { benchmark: "ARC-AGI-2", edi: 153.648, slope: 0.26961, actual: 0.2347, predicted: 0.2812 },
];

test("the page's logistic reproduces the pipeline's predicted scores", () => {
  for (const [eci, fit] of [
    [ASTRA, ASTRA_FIT],
    [BEAM, BEAM_FIT],
  ] as const) {
    for (const t of fit) {
      assert.ok(Math.abs(predictedScore(eci, t) - t.predicted) < 2e-3, t.benchmark);
    }
  }
});

test("fit points sit on the shared curve at their predicted score", () => {
  for (const p of fitPoints(ASTRA, ASTRA_FIT)) {
    const onCurve = 1 / (1 + Math.exp(-p.x));
    assert.ok(Math.abs(onCurve - p.predicted) < 1e-12);
    assert.ok(Math.abs(p.pull - (p.actual - p.predicted)) < 1e-12);
  }
  const [first, last] = [curve(-4, 4, 8)[0], curve(-4, 4, 8).at(-1)];
  assert.deepEqual([first?.x, last?.x], [-4, 4]);
});

test("thin evidence: the index minimum and one more", () => {
  assert.deepEqual([4, 5, 6].map(isThin), [true, true, false]);
});

test("results split into used and unused, grouped by reason", () => {
  const r = (benchmark: string, used: boolean, reason: string | null): BenchmarkResult => ({
    id: benchmark,
    benchmark,
    version: "v",
    score: 0.5,
    score_column: "Score",
    stderr: null,
    log_url: null,
    source: null,
    source_url: null,
    run_at: null,
    normalized: null,
    used,
    reason,
  });
  const out = splitResults([
    r("B", true, null),
    r("A", true, null),
    r("X", false, "Not in index"),
    r("W", false, "Not in index"),
    r("Y", false, "Better version"),
  ]);
  assert.deepEqual(
    out.used.map((x) => x.benchmark),
    ["A", "B"],
  );
  assert.deepEqual(
    out.unused.map((g) => [g.reason, g.results.map((x) => x.benchmark)]),
    [
      ["Not in index", ["W", "X"]],
      ["Better version", ["Y"]],
    ],
  );
});

test("training compute reads as a power of ten", () => {
  assert.equal(formatFlop(9.4e26), "9.4 × 10²⁶ FLOP");
  assert.equal(formatFlop(1e25), "1.0 × 10²⁵ FLOP");
});
