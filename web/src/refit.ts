// The domain-ECI solver for custom benchmark selections, the same as the pipeline's
// `src/eci_live/domain.py` (Epoch's domain-specific method): benchmark difficulty and slope
// stay at the general fit's, and only the model's capability is refit by least squares.

export interface Term {
  /** The 0-1 score the fit sees. */
  perf: number;
  edi: number;
  slope: number;
}

const CLIP = 1e-3;
const BOUNDS: [number, number] = [-100, 300];
const MAX_ITER = 200;
const TOL = 1e-9;
const BACKTRACK = 5;
const WORSE = 1 + 1e-12;

const clamp = (x: number) => Math.min(BOUNDS[1], Math.max(BOUNDS[0], x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));

function evaluate(x: number, terms: Term[]): { loss: number; grad: number; hess: number } {
  let loss = 0;
  let grad = 0;
  let hess = 0;
  for (const { perf, edi, slope } of terms) {
    const s = sigmoid(slope * (x - edi));
    const r = perf - s;
    const d = slope * s * (1 - s);
    loss += r * r;
    grad += -2 * r * d;
    hess += 2 * d * d;
  }
  return { loss, grad, hess };
}

/** Bounded golden-section search, the fallback when Newton steps stall. */
function golden(f: (x: number) => number): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let [a, b] = BOUNDS;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  for (let i = 0; i < 200 && b - a > 1e-8; i++) {
    if (f(c) < f(d)) b = d;
    else a = c;
    c = b - ratio * (b - a);
    d = a + ratio * (b - a);
  }
  return (a + b) / 2;
}

/** A model's capability on the ECI scale from its results on the chosen benchmarks. */
export function capability(input: Term[]): number | null {
  if (input.length === 0) return null;
  const terms = input.map((t) => ({ ...t, perf: Math.min(1 - CLIP, Math.max(CLIP, t.perf)) }));
  let weight = 0;
  let sum = 0;
  for (const { perf, edi, slope } of terms) {
    weight += slope * slope;
    sum += slope * slope * (edi + Math.log(perf / (1 - perf)) / slope);
  }
  let x = clamp(sum / weight);
  let current = evaluate(x, terms);
  const maxStep = 4 / Math.min(...terms.map((t) => t.slope));
  for (let i = 0; i < MAX_ITER; i++) {
    if (!Number.isFinite(current.loss) || current.hess < 1e-15) break;
    let step = Math.max(-maxStep, Math.min(maxStep, current.grad / current.hess));
    let next = clamp(x - step);
    let trial = evaluate(next, terms);
    for (let j = 0; j < BACKTRACK && trial.loss > current.loss * WORSE; j++) {
      step /= 2;
      next = clamp(x - step);
      trial = evaluate(next, terms);
    }
    if (trial.loss > current.loss * WORSE) break;
    const moved = Math.abs(x - next);
    x = next;
    current = trial;
    if (moved < TOL) return x;
  }
  return golden((c) => evaluate(c, terms).loss);
}
