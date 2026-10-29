import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_PROVISIONAL_BENCHMARKS, showsByDefault } from "./eligibility.ts";

test("ranked rows always show; provisional ones need some evidence", () => {
  assert.equal(showsByDefault({ gaps: [], benchmarks: 1 }), true);
  assert.equal(showsByDefault({ gaps: ["no coding benchmark"], benchmarks: 2 }), false);
  assert.equal(
    showsByDefault({ gaps: ["no coding benchmark"], benchmarks: MIN_PROVISIONAL_BENCHMARKS }),
    true,
  );
});
