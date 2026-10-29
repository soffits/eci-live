import assert from "node:assert/strict";
import { test } from "node:test";
import { capability, type Term } from "./refit.ts";

const terms = (rows: [number, number, number][]): Term[] =>
  rows.map(([perf, edi, slope]) => ({ perf, edi, slope }));

// The same rows as tests/test_domain.py: Epoch's published fit on 2026-10-29 and the value
// epoch.ai/eci showed (integers, the page's precision).
const EPOCH_PAGE: [string, [number, number, number][], number][] = [
  [
    "Claude Opus 5.5",
    [
      [0.5464, 163.888379, 0.074234],
      [0.62331, 164.667475, 0.147668],
      [0.774, 164.948483, 0.202191],
      [0.553677, 167.615895, 0.158238],
    ],
    169,
  ],
  [
    "Mixtral 8x22B",
    [
      [0.075, 145.731714, 0.19806],
      [0.0317, 145.633901, 0.080727],
    ],
    104,
  ],
  [
    "GPT-6.1 Sol",
    [
      [1.0, 158.320044, 0.246309],
      [0.98615, 150.142452, 0.167806],
      [1.0, 137.163938, 0.224137],
      [0.99, 156.104122, 0.292357],
    ],
    178,
  ],
  [
    "Mistral 7B v0.3",
    [
      [0.03682, 127.999344, 0.196834],
      [0.00178, 137.163938, 0.224137],
    ],
    111,
  ],
];

for (const [name, rows, shown] of EPOCH_PAGE) {
  test(`reproduces Epoch's page for ${name}`, () => {
    assert.equal(Math.round(capability(terms(rows)) ?? Number.NaN), shown);
  });
}

test("recovers a noiseless capability", () => {
  const rows: [number, number][] = [
    [100, 0.1],
    [120, 0.2],
    [140, 0.15],
    [150, 0.3],
  ];
  const exact = rows.map(([edi, slope]) => ({
    perf: 1 / (1 + Math.exp(-slope * (133 - edi))),
    edi,
    slope,
  }));
  assert.ok(Math.abs((capability(exact) ?? 0) - 133) < 1e-6);
});

test("no results, no score", () => {
  assert.equal(capability([]), null);
});
