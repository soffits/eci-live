/** Round axis ticks: the largest "nice" step giving at least `minTicks` ticks over the span. */
export function niceTicks(low: number, high: number, minTicks = 4): number[] {
  const steps = [1, 2, 5, 10, 20, 25, 50];
  const span = high - low;
  const step = [...steps].reverse().find((s) => span / s >= minTicks) ?? 1;
  const first = Math.floor(low / step) * step;
  const ticks: number[] = [];
  for (let t = first; t < high + step; t += step) ticks.push(t);
  return ticks;
}
