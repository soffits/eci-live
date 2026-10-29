"""Capability with fixed benchmark parameters: the variant scores and the domain ECIs.

eci-public has no function for this step, so it is written here, following Epoch's method
page for domain ECIs and the solver its ECI page runs: benchmark difficulty and slope are
fixed at the general (group-level) fit's, already on the ECI scale, and each model's
capability alone is refit, by least squares, on its own results. The general index scores
every model variant this way on all benchmarks; a domain ECI on the domain's benchmarks.
`web/src/refit.ts` is the same solver for custom selections in the browser.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar

from eci_live import settings
from eci_live.refit import Fit
from eci_live.schema import DomainScore

CLIP = 1e-3  # scores are clipped into [CLIP, 1 - CLIP], as in the general fit
BOUNDS = (-100.0, 300.0)
MAX_ITER = 200
TOL = 1e-9
BACKTRACK = 5
WORSE = 1 + 1e-12


def _sigmoid(x: np.ndarray) -> np.ndarray:
    out: np.ndarray = 1.0 / (1.0 + np.exp(-np.clip(x, -500, 500)))
    return out


def _evaluate(
    x: np.ndarray, perf: np.ndarray, edi: np.ndarray, slope: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Squared error, its gradient and Gauss-Newton curvature, per row."""
    s = _sigmoid(slope * (x[:, None] - edi))
    r = perf - s
    d = slope * s * (1 - s)
    return (r * r).sum(1), (-2 * r * d).sum(1), (2 * d * d).sum(1)


def capability(
    perf: np.ndarray, edi: np.ndarray, slope: np.ndarray, start: float | None = None
) -> np.ndarray:
    """Least-squares capability for each row of (rows, benchmarks) arrays.

    Starts from the slope-weighted inverse of the logistic (or `start` if it fits better),
    then damped Newton steps within BOUNDS; rows that don't converge fall back to a
    bounded scalar search.
    """
    p = np.clip(perf, CLIP, 1 - CLIP)
    w = slope * slope
    x = np.clip((w * (edi + np.log(p / (1 - p)) / slope)).sum(1) / w.sum(1), *BOUNDS)
    loss, grad, hess = _evaluate(x, p, edi, slope)
    if start is not None:
        alt = np.full_like(x, np.clip(start, *BOUNDS))
        alt_loss, alt_grad, alt_hess = _evaluate(alt, p, edi, slope)
        better = alt_loss < loss
        x, loss = np.where(better, alt, x), np.where(better, alt_loss, loss)
        grad, hess = np.where(better, alt_grad, grad), np.where(better, alt_hess, hess)
    max_step = 4 / slope.min(1)
    converged = np.zeros(len(x), dtype=bool)
    stopped = np.zeros(len(x), dtype=bool)
    for _ in range(MAX_ITER):
        active = ~converged & ~stopped & np.isfinite(loss) & (hess >= 1e-15)
        stopped |= ~converged & ~active
        if not active.any():
            break
        idx = np.flatnonzero(active)
        step = np.clip(grad[idx] / hess[idx], -max_step[idx], max_step[idx])
        new = np.clip(x[idx] - step, *BOUNDS)
        n_loss, n_grad, n_hess = _evaluate(new, p[idx], edi[idx], slope[idx])
        for _ in range(BACKTRACK):
            worse = n_loss > loss[idx] * WORSE
            if not worse.any():
                break
            step[worse] *= 0.5
            new[worse] = np.clip(x[idx][worse] - step[worse], *BOUNDS)
            w_loss, w_grad, w_hess = _evaluate(
                new[worse], p[idx][worse], edi[idx][worse], slope[idx][worse]
            )
            n_loss[worse], n_grad[worse], n_hess[worse] = w_loss, w_grad, w_hess
        failed = n_loss > loss[idx] * WORSE
        stopped[idx[failed]] = True
        ok = idx[~failed]
        moved = np.abs(x[ok] - new[~failed])
        x[ok], loss[ok] = new[~failed], n_loss[~failed]
        grad[ok], hess[ok] = n_grad[~failed], n_hess[~failed]
        converged[ok[moved < TOL]] = True
    for i in np.flatnonzero(~converged):
        pi, ei, si = p[i], edi[i], slope[i]
        result = minimize_scalar(
            lambda c, pi=pi, ei=ei, si=si: float(((pi - _sigmoid(si * (c - ei))) ** 2).sum()),
            bounds=BOUNDS,
            method="bounded",
            options={"xatol": 1e-8, "maxiter": 10_000},
        )
        x[i] = result.x
    out: np.ndarray = x
    return out


def seed_for(index: int) -> int:
    """Seed of the index-th fixed-parameter scoring (0: the general variant scores, then one
    per domain preset), derived from BOOTSTRAP_SEED after the general bootstrap's chunk seeds
    (SeedSequence children don't depend on how many are spawned)."""
    child = np.random.SeedSequence(settings.BOOTSTRAP_SEED).spawn(
        settings.BOOTSTRAP_CHUNKS + index + 1
    )[-1]
    return int(child.generate_state(1)[0])


def best_scores(data: pd.DataFrame) -> pd.Series:
    """A fit input as one 0-1 score per (model, benchmark)."""
    scores: pd.Series = data.groupby(["Model", "benchmark"])["performance"].max()
    return scores


@dataclass(frozen=True)
class Scored:
    """Capabilities refit with the general fit's benchmark parameters held fixed."""

    central: pd.Series  # model -> ECI
    benchmarks: pd.Series  # model -> how many benchmarks its score rests on
    # (draws x resamples, models), columns in `central` order. Row d * resamples + r uses
    # bootstrap draw d for every model, so a row is one joint draw (for rank intervals).
    samples: np.ndarray | None

    def interval(self) -> tuple[np.ndarray, np.ndarray] | None:
        if self.samples is None:
            return None
        tail = (1 - settings.CI_LEVEL) / 2
        low, high = np.quantile(self.samples, [tail, 1 - tail], axis=0)
        return low, high


def fixed_fit(
    fit: Fit, scores: pd.Series, benchmarks: list[str] | None, seed: int, resamples: int
) -> Scored:
    """Refit each model's capability alone on its `scores` (best per model and benchmark),
    using only `benchmarks` (all fitted ones if None). Intervals, when the fit has bootstrap
    draws: for each draw's difficulty and slope, `resamples` resamples of the model's own
    results (draws x resamples samples, as Epoch does for its domain ECIs); none if
    `resamples` is 0."""
    params = fit.edi.set_index("benchmark")
    table = scores.unstack()
    wanted = list(params.index) if benchmarks is None else benchmarks
    chosen = [b for b in wanted if b in table.columns and b in params.index]
    rng = np.random.default_rng(seed)
    col = {b: i for i, b in enumerate(fit.benchmarks)}
    with_draws = fit.edi_draws is not None and fit.slope_draws is not None and resamples > 0
    central: dict[str, float] = {}
    counts: dict[str, int] = {}
    samples: list[np.ndarray] = []
    for name, row in table[chosen].iterrows():
        have = row.dropna()
        if have.empty:
            continue
        names = list(have.index)
        perf = have.to_numpy(float)
        edi = params.loc[names, "edi"].to_numpy(float)
        slope = params.loc[names, "discriminability_scaled"].to_numpy(float)
        point = float(capability(perf[None], edi[None], slope[None])[0])
        central[str(name)], counts[str(name)] = point, len(names)
        if with_draws:
            assert fit.edi_draws is not None and fit.slope_draws is not None
            draws, k = len(fit.edi_draws), len(names)
            cols = np.array([col[b] for b in names])
            pick = rng.integers(0, k, size=(draws, resamples, k))
            rows = np.arange(draws)[:, None, None]
            e = fit.edi_draws[rows, cols[pick]].reshape(-1, k)
            s = fit.slope_draws[rows, cols[pick]].reshape(-1, k)
            samples.append(capability(perf[pick].reshape(-1, k), e, s, start=point))
    return Scored(
        central=pd.Series(central, dtype=float),
        benchmarks=pd.Series(counts, dtype=int),
        samples=np.column_stack(samples) if samples else None,
    )


def scores(
    fit: Fit, best: pd.Series, benchmarks: list[str], seed: int, resamples: int
) -> list[DomainScore]:
    """Domain ECI of every model (variant) in `best` with at least one of `benchmarks`, with
    the CI_LEVEL interval when the fit has bootstrap draws."""
    scored = fixed_fit(fit, best, benchmarks, seed, resamples)
    interval = scored.interval()
    out = [
        DomainScore(
            version=str(name),
            eci=round(float(eci), 2),
            ci_low=None if interval is None else round(float(interval[0][i]), 2),
            ci_high=None if interval is None else round(float(interval[1][i]), 2),
            benchmarks=int(scored.benchmarks.iloc[i]),
        )
        for i, (name, eci) in enumerate(scored.central.items())
    ]
    return sorted(out, key=lambda m: -m["eci"])
