"""Domain ECIs, by Epoch's domain-specific method.

eci-public has no function for this step, so it is written here, following Epoch's method
page and the solver its ECI page runs: benchmark difficulty and slope are fixed at the
general fit's (already on the ECI scale) and each model's capability alone is refit, by
least squares, on its results in the chosen benchmarks. `web/src/refit.ts` is the same
solver for custom selections in the browser.
"""

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


def domain_seed(index: int) -> int:
    """Seed of the index-th preset's resampling, derived from BOOTSTRAP_SEED after the
    general bootstrap's chunk seeds (SeedSequence children don't depend on how many)."""
    child = np.random.SeedSequence(settings.BOOTSTRAP_SEED).spawn(
        settings.BOOTSTRAP_CHUNKS + index + 1
    )[-1]
    return int(child.generate_state(1)[0])


def best_scores(data: pd.DataFrame) -> pd.Series:
    """The fit's input as one 0-1 score per (model, benchmark)."""
    scores: pd.Series = data.groupby(["Model", "benchmark"])["performance"].max()
    return scores


def scores(fit: Fit, benchmarks: list[str], seed: int, resamples: int) -> list[DomainScore]:
    """Domain ECI of every model with at least one of `benchmarks`, with the 5,000-sample
    interval when the fit has bootstrap draws (CI_LEVEL quantiles)."""
    params = fit.edi.set_index("benchmark")
    table = best_scores(fit.data).unstack()
    chosen = [b for b in benchmarks if b in table.columns]
    rng = np.random.default_rng(seed)
    col = {b: i for i, b in enumerate(fit.benchmarks)}
    tail = (1 - settings.CI_LEVEL) / 2
    out: list[DomainScore] = []
    for name, row in table[chosen].iterrows():
        have = row.dropna()
        if have.empty:
            continue
        names = list(have.index)
        perf = have.to_numpy(float)
        edi = params.loc[names, "edi"].to_numpy(float)
        slope = params.loc[names, "discriminability_scaled"].to_numpy(float)
        central = float(capability(perf[None], edi[None], slope[None])[0])
        low = high = None
        if fit.edi_draws is not None and fit.slope_draws is not None:
            draws = len(fit.edi_draws)
            k = len(names)
            cols = np.array([col[b] for b in names])
            pick = rng.integers(0, k, size=(draws, resamples, k))
            rows = np.arange(draws)[:, None, None]
            e = fit.edi_draws[rows, cols[pick]].reshape(-1, k)
            s = fit.slope_draws[rows, cols[pick]].reshape(-1, k)
            samples = capability(perf[pick].reshape(-1, k), e, s, start=central)
            low, high = (round(float(v), 2) for v in np.quantile(samples, [tail, 1 - tail]))
        out.append(
            DomainScore(
                name=str(name),
                eci=round(central, 2),
                ci_low=low,
                ci_high=high,
                benchmarks=len(names),
            )
        )
    return sorted(out, key=lambda m: -m["eci"])
