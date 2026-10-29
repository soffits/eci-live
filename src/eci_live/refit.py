"""A thin layer over Epoch's `eci` package: fit, then attach display metadata."""

import os
import zipfile
from collections.abc import Iterator
from concurrent.futures import ProcessPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass
from itertools import repeat
from multiprocessing import get_context
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from eci import download_benchmark_data, fit_eci_model, load_model_metadata, prepare_benchmark_data
from eci.fitting import DEFAULT_ANCHOR_MODEL_HIGH, DEFAULT_ANCHOR_MODEL_LOW

from eci_live import settings
from eci_live.schema import ModelScore, Weights

CLOSED_ACCESS = frozenset({"API access", "Hosted access (no API)", "Unreleased"})


@dataclass(frozen=True)
class Fit:
    """One run of the pinned fit: its input, the central estimates and the bootstrap."""

    data: pd.DataFrame  # the fit's input, from `prepare_benchmark_data`
    eci: pd.DataFrame  # central model scores (eci-public's `eci_df`)
    edi: pd.DataFrame  # central benchmark difficulty and slope (eci-public's `edi_df`)
    draws: np.ndarray | None  # bootstrap ECIs, one row per refit, columns in `names` order
    names: list[str]


def chunk_sizes(samples: int, chunks: int) -> list[int]:
    """Split `samples` refits into at most `chunks` near-equal, non-empty chunks."""
    base, extra = divmod(samples, chunks)
    return [size for i in range(chunks) if (size := base + (i < extra)) > 0]


def chunk_seeds(seed: int, chunks: int) -> list[int]:
    """Independent, reproducible seeds for each chunk, derived from the one configured seed."""
    return [int(s.generate_state(1)[0]) for s in np.random.SeedSequence(seed).spawn(chunks)]


BLAS_THREAD_VARIABLES = ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS")


@contextmanager
def _one_blas_thread_in_children() -> Iterator[None]:
    """Spawned workers read these at start-up; the parent's BLAS is already set up. A
    refit is sparse, interpreter-bound work, so extra BLAS threads per worker would only
    oversubscribe the cores the workers already fill."""
    saved = {name: os.environ.get(name) for name in BLAS_THREAD_VARIABLES}
    os.environ.update(dict.fromkeys(BLAS_THREAD_VARIABLES, "1"))
    try:
        yield
    finally:
        for name, value in saved.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


def _chunk(data: pd.DataFrame, size: int, seed: int) -> tuple[pd.DataFrame, pd.DataFrame, Any]:
    """One call of eci-public's own fit with `size` bootstrap refits."""
    eci_df, edi_df, draws = fit_eci_model(
        data, bootstrap_samples=size, bootstrap_seed=seed, ci_level=settings.CI_LEVEL
    )
    return eci_df, edi_df, draws


def fit(zip_path: Path, bootstrap_samples: int, workers: int | None = None) -> Fit:
    """Run the pinned fit, with the bootstrap split into BOOTSTRAP_CHUNKS seeded chunks.

    eci-public refits serially on one core; the chunks are independent calls of its public
    `fit_eci_model`, run in parallel processes. The chunk count and seeds are fixed, so
    the draws depend only on the input and the seed, not on how many cores ran them.
    Every chunk's central fit is the same deterministic fit; chunk 0's is used.
    """
    data = prepare_benchmark_data(zip_path)
    sizes = chunk_sizes(bootstrap_samples, settings.BOOTSTRAP_CHUNKS)
    if not sizes:
        eci_df, edi_df, _ = fit_eci_model(data, bootstrap_samples=0)
        return Fit(data, eci_df, edi_df, None, [])
    seeds = chunk_seeds(settings.BOOTSTRAP_SEED, len(sizes))
    workers = min(workers or os.process_cpu_count() or 1, len(sizes))
    if workers == 1:
        parts = list(map(_chunk, repeat(data), sizes, seeds))
    else:
        with (
            _one_blas_thread_in_children(),
            ProcessPoolExecutor(workers, mp_context=get_context("spawn")) as pool,
        ):
            parts = list(pool.map(_chunk, repeat(data), sizes, seeds))
    eci_df, edi_df, first = parts[0]
    central = eci_df.set_index("Model")["eci"]
    for other, _, draws in parts[1:]:
        if draws["model_names"] != first["model_names"] or not np.allclose(
            other.set_index("Model")["eci"].reindex(central.index), central, rtol=0, atol=1e-9
        ):
            raise RuntimeError("bootstrap chunks disagree on the central fit")
    return Fit(
        data=data,
        eci=eci_df,
        edi=edi_df,
        draws=np.concatenate([draws["eci"] for _, _, draws in parts]),
        names=list(first["model_names"]),
    )


def fit_scores(result: Fit) -> pd.DataFrame:
    """One row per model, indexed by Epoch's model name: ECI, its interval, rank stats."""
    per_model = result.data.groupby("Model").agg(
        benchmarks=("benchmark", "nunique"), date=("date", "max")
    )
    scores = result.eci.set_index("Model")[["eci"]]
    if result.draws is not None:
        # The same quantile interval eci-public reports; anchors are fixed, not estimated.
        tail = (1 - settings.CI_LEVEL) / 2
        low, high = np.quantile(result.draws, [tail, 1 - tail], axis=0)
        ci = pd.DataFrame(
            {"eci_ci_low": low, "eci_ci_high": high}, index=pd.Index(result.names, name="Model")
        )
        anchors = ci.index.isin([DEFAULT_ANCHOR_MODEL_LOW, DEFAULT_ANCHOR_MODEL_HIGH])
        ci.loc[anchors, ["eci_ci_low", "eci_ci_high"]] = np.nan
        scores = scores.join(ci).join(rank_stats(result.draws, result.names))
    return scores.join(per_model)


def rank_stats(eci_draws: np.ndarray, names: list[str]) -> pd.DataFrame:
    """Rank uncertainty from the bootstrap: each model's CI_LEVEL rank interval and
    the share of refits in which it ranks first."""
    ranks = (-eci_draws).argsort(axis=1).argsort(axis=1) + 1
    tail = (1 - settings.CI_LEVEL) / 2
    low, high = np.quantile(ranks, [tail, 1 - tail], axis=0)
    return pd.DataFrame(
        {
            "rank_low": np.floor(low).astype(int),
            "rank_high": np.ceil(high).astype(int),
            "p_first": (ranks == 1).mean(axis=0).round(3),
        },
        index=pd.Index(names, name="Model"),
    )


def official_scores(zip_path: Path) -> pd.DataFrame:
    """Epoch's own published scores shipped in the zip, indexed by model name."""
    with zipfile.ZipFile(zip_path) as zf, zf.open(settings.OFFICIAL_SCORES_MEMBER) as f:
        return pd.read_csv(f).set_index("Model")


def version_metadata(zip_path: Path) -> pd.DataFrame:
    """Newest model version per model group, as listed in the zip's model table."""
    table: pd.DataFrame = load_model_metadata(download_benchmark_data(zip_path))
    newest_first = table.sort_values("date", ascending=False)
    return (
        newest_first.dropna(subset=["model_group"])
        .drop_duplicates("model_group")
        .set_index("model_group")
    )


def weights_of(accessibility: str | None) -> Weights:
    if accessibility is None:
        return "unknown"
    if accessibility.startswith("Open weights"):
        return "open"
    return "closed" if accessibility in CLOSED_ACCESS else "unknown"


def lab_of(organization: str | None) -> str:
    return organization.split(",")[0].strip() if organization else "Unknown"


Record = dict[str, Any]


def _records(frame: pd.DataFrame) -> dict[str, Record]:
    """Rows keyed by index, with every missing value as None."""
    clean = frame.astype(object).where(frame.notna(), None)
    return {
        str(key): {str(k): v for k, v in row.items()} for key, row in clean.to_dict("index").items()
    }


def _text(value: Any) -> str | None:
    return None if value in (None, "", "Unknown") else str(value)


def _number(value: Any, digits: int = 2) -> float | None:
    return None if value is None else round(float(value), digits)


def _whole(value: Any) -> int | None:
    return None if value is None else int(value)


def _day(value: Any) -> str | None:
    return None if value is None else pd.Timestamp(value).date().isoformat()


def model_scores(
    fit: pd.DataFrame, official: pd.DataFrame, versions: pd.DataFrame
) -> list[ModelScore]:
    """Merge the refit with display metadata.

    Epoch's published row wins where it exists; models Epoch hasn't published yet
    fall back to their newest version in the model table.
    """
    published, newest = _records(official), _records(versions)
    scores: list[ModelScore] = []
    for name, row in _records(fit.sort_values("eci", ascending=False)).items():
        if name in published:
            meta = published[name]
            organization, access = meta["Organization"], _text(meta["Model accessibility"])
            release_date, official_eci = meta["date"], _number(meta["eci"])
        else:
            meta = newest.get(name, {})
            organization, access = meta.get("organization"), _text(meta.get("accessibility"))
            release_date, official_eci = row["date"], None
        scores.append(
            ModelScore(
                name=name,
                lab=lab_of(_text(organization)),
                release_date=_day(release_date),
                eci=round(float(row["eci"]), 2),
                ci_low=_number(row.get("eci_ci_low")),
                ci_high=_number(row.get("eci_ci_high")),
                benchmarks=int(row["benchmarks"]),
                rank_low=_whole(row.get("rank_low")),
                rank_high=_whole(row.get("rank_high")),
                p_first=_number(row.get("p_first"), digits=3),
                weights=weights_of(access),
                accessibility=access,
                official_eci=official_eci,
            )
        )
    return scores
