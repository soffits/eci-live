import assert from "node:assert/strict";
import { test } from "node:test";
import { legendEntries } from "./legend.ts";

// A palette shaped like config.ts: a few own colours, one shared by two names, and a grey
// fallback for every other lab (including "Unknown").
const OWN: Record<string, string> = {
  OpenAI: "#10A37F",
  Anthropic: "#D97757",
  "Google DeepMind": "#4285F4",
  Google: "#4285F4",
};
const GREY = "#94A3B8";
const colorOf = (lab: string) => OWN[lab] ?? GREY;
const hasOwnColor = (lab: string) => lab in OWN;

const LABS = ["OpenAI", "Unknown", "Google DeepMind", "Hugging Face", "Anthropic", "Google"];

test("every lab drawn has exactly one legend entry, in the colour of its dots", () => {
  const entries = legendEntries(LABS, colorOf, hasOwnColor);
  for (const lab of LABS) {
    const matching = entries.filter((e) => e.labs.includes(lab));
    assert.equal(matching.length, 1, `${lab} should have one entry`);
    assert.equal(matching[0]?.color, colorOf(lab), `${lab} entry colour`);
  }
});

test("no colour is named twice", () => {
  const colors = legendEntries(LABS, colorOf, hasOwnColor).map((e) => e.color);
  assert.equal(new Set(colors).size, colors.length);
});

test("fallback-coloured labs share one 'Other labs' entry, placed last", () => {
  const entries = legendEntries(LABS, colorOf, hasOwnColor);
  const last = entries.at(-1);
  assert.equal(last?.label, "Other labs");
  assert.deepEqual(last?.labs, ["Unknown", "Hugging Face"]);
});

test("labs sharing an own colour are named together", () => {
  const entries = legendEntries(LABS, colorOf, hasOwnColor);
  assert.deepEqual(
    entries.map((e) => e.label),
    ["OpenAI", "Google DeepMind / Google", "Anthropic", "Other labs"],
  );
});
