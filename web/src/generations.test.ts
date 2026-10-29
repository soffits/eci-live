import assert from "node:assert/strict";
import { test } from "node:test";
import type { Row } from "./data.ts";
import { currentGeneration, lineOf } from "./generations.ts";
import { row } from "./testRows.ts";

const names = (rows: Row[]) => currentGeneration(rows).map((r) => r.name);

test("each line keeps only its newest version, even if an older one scored higher", () => {
  const old = row("Flash 3.7", "Lab A", "2025-01-01", 158);
  const newer = row("Flash 3.8", "Lab A", "2025-06-01", 157);
  assert.deepEqual(names([old, newer]), ["Flash 3.8"]);
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

test("Astra, Terra and Sol are separate lines; an older Sol is hidden", () => {
  const astra = row("GPT-6 Astra", "OpenAI", "2026-09-03", 168.9);
  const sol = row("GPT-6.1 Sol", "OpenAI", "2026-09-29", 168.2);
  const terra = row("GPT-6.1 Terra", "OpenAI", "2026-10-26", 168.4);
  const oldSol = row("GPT-5.6 Sol", "OpenAI", "2026-07-09", 162.7);
  assert.deepEqual(names([astra, sol, terra, oldSol]), [
    "GPT-6 Astra",
    "GPT-6.1 Sol",
    "GPT-6.1 Terra",
  ]);
});

test("keeps only each lab's four most recently released lines", () => {
  const rows = [
    row("X Codex 5.3", "Lab A", "2026-02-01", 157),
    row("X Pro 5.5", "Lab A", "2026-04-01", 163),
    row("X Luna 6", "Lab A", "2026-09-22", 156),
    row("X Sol 6.1", "Lab A", "2026-09-29", 168),
    row("X Terra 6.1", "Lab A", "2026-10-26", 168.4),
    row("X Astra 6", "Lab A", "2026-09-03", 169),
  ];
  assert.deepEqual(names(rows), ["X Luna 6", "X Sol 6.1", "X Terra 6.1", "X Astra 6"]);
});

test("lineOf drops versions and date tags but keeps size names", () => {
  assert.equal(lineOf("GPT-6.1 Sol"), lineOf("GPT-5.6 Sol"));
  assert.equal(lineOf("Qwen3.8 Max (0902)"), lineOf("Qwen 3.8 Max"));
  assert.notEqual(lineOf("GLM-5.3-Flash"), lineOf("GLM-5.3"));
  assert.notEqual(lineOf("Claude Opus 5.5"), lineOf("Claude Sonnet 5.5"));
});
