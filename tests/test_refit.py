"""The chunked, parallel bootstrap: deterministic, and only eci-public's own fit inside."""

from pathlib import Path

import numpy as np
import pytest
from eci import fit_eci_model, prepare_benchmark_data
from eci.fitting import DEFAULT_ANCHOR_MODEL_HIGH, DEFAULT_ANCHOR_MODEL_LOW

from eci_live import refit, settings


def test_chunk_sizes_cover_every_sample_once() -> None:
    assert refit.chunk_sizes(500, 20) == [25] * 20
    assert refit.chunk_sizes(7, 3) == [3, 2, 2]
    assert refit.chunk_sizes(2, 5) == [1, 1]
    assert refit.chunk_sizes(0, 20) == []


def test_chunk_seeds_are_stable_and_distinct() -> None:
    seeds = refit.chunk_seeds(settings.BOOTSTRAP_SEED, 20)
    assert seeds == refit.chunk_seeds(settings.BOOTSTRAP_SEED, 20)
    assert len(set(seeds)) == 20
    assert seeds != refit.chunk_seeds(settings.BOOTSTRAP_SEED + 1, 20)


@pytest.fixture(scope="module")
def fits(synthetic_zip: Path) -> tuple[refit.Fit, refit.Fit]:
    """The same input fit in-process and across two worker processes."""
    return refit.fit(synthetic_zip, 8, workers=1), refit.fit(synthetic_zip, 8, workers=2)


def test_results_do_not_depend_on_the_number_of_workers(
    fits: tuple[refit.Fit, refit.Fit],
) -> None:
    serial, parallel = fits
    assert serial.draws is not None and parallel.draws is not None
    assert serial.draws.shape == (8, len(serial.names))
    assert np.array_equal(serial.draws, parallel.draws)
    assert serial.names == parallel.names
    assert serial.eci.equals(parallel.eci) and serial.edi.equals(parallel.edi)


def test_each_chunk_is_eci_publics_own_bootstrap(
    synthetic_zip: Path, fits: tuple[refit.Fit, refit.Fit]
) -> None:
    serial, _ = fits
    assert serial.draws is not None
    data = prepare_benchmark_data(synthetic_zip)
    sizes = refit.chunk_sizes(8, settings.BOOTSTRAP_CHUNKS)
    seeds = refit.chunk_seeds(settings.BOOTSTRAP_SEED, len(sizes))
    start = 0
    for size, seed in zip(sizes, seeds, strict=True):
        _, _, draws = fit_eci_model(data, bootstrap_samples=size, bootstrap_seed=seed)
        assert np.array_equal(serial.draws[start : start + size], draws["eci"])
        start += size
    central, _, _ = fit_eci_model(data, bootstrap_samples=0)
    assert np.allclose(serial.eci["eci"], central["eci"], rtol=0, atol=1e-9)


def test_intervals_are_the_bootstrap_quantiles_with_anchors_fixed(
    fits: tuple[refit.Fit, refit.Fit],
) -> None:
    serial, _ = fits
    assert serial.draws is not None
    scores = refit.fit_scores(serial)
    tail = (1 - settings.CI_LEVEL) / 2
    low, high = np.quantile(serial.draws, [tail, 1 - tail], axis=0)
    for name, lo, hi in zip(serial.names, low, high, strict=True):
        row = scores.loc[name]
        if name in (DEFAULT_ANCHOR_MODEL_LOW, DEFAULT_ANCHOR_MODEL_HIGH):
            assert np.isnan(row["eci_ci_low"]) and np.isnan(row["eci_ci_high"])
        else:
            assert (row["eci_ci_low"], row["eci_ci_high"]) == pytest.approx((lo, hi))
    assert {"rank_low", "rank_high", "p_first", "benchmarks"} <= set(scores.columns)


def test_no_bootstrap_means_one_central_fit(synthetic_zip: Path) -> None:
    result = refit.fit(synthetic_zip, 0)
    assert result.draws is None
    assert "eci_ci_low" not in refit.fit_scores(result).columns
