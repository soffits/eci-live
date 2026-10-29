import assert from "node:assert/strict";
import { test } from "node:test";
import { withPicked } from "./pick.ts";
import { row } from "./testRows.ts";

const a = row("A", "Lab A", "2025-01-01", 170, 1);
const b = row("B", "Lab B", "2025-01-01", 165, 2);
const c = row("C", "Lab A", "2024-01-01", 160, 3);
const d = row("D", "Lab C", "2024-01-01", 150, 4);
const all = [a, b, c, d];

test("adds picked models outside the top, best first, and marks them", () => {
  const { rows, added } = withPicked([a, b], all, ["D", "C"]);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["A", "B", "C", "D"],
  );
  assert.deepEqual([...added].sort(), ["C", "D"]);
});

test("a picked model already in the top is shown once and not marked", () => {
  const { rows, added } = withPicked([a, b], all, ["A"]);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["A", "B"],
  );
  assert.equal(added.size, 0);
});

test("a picked model hidden from the top slots in at its score", () => {
  const { rows } = withPicked([a, d], all, ["B"]);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["A", "B", "D"],
  );
});

test("unknown names, such as a stale shared link, are ignored", () => {
  const { rows, added } = withPicked([a], all, ["Retired model"]);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["A"],
  );
  assert.equal(added.size, 0);
});
