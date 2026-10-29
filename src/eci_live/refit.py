"""A thin layer over Epoch's `eci` package: fit, then attach display metadata."""

import zipfile
from pathlib import Path
from typing import Any

import pandas as pd
from eci import download_benchmark_data, fit_eci_model, load_model_metadata, prepare_benchmark_data

from eci_live import settings
from eci_live.schema import ModelScore, Weights

CLOSED_ACCESS = frozenset({"API access", "Hosted access (no API)", "Unreleased"})


def fit_scores(zip_path: Path, bootstrap_samples: int) -> pd.DataFrame:
    """Refit ECI. One row per model, indexed by Epoch's model name."""
    data = prepare_benchmark_data(zip_path)
    eci_df: pd.DataFrame
    eci_df, _, _ = fit_eci_model(
        data,
        bootstrap_samples=bootstrap_samples,
        bootstrap_seed=settings.BOOTSTRAP_SEED,
        ci_level=settings.CI_LEVEL,
    )
    per_model = data.groupby("Model").agg(benchmarks=("benchmark", "nunique"), date=("date", "max"))
    columns = ["eci", "eci_ci_low", "eci_ci_high"] if bootstrap_samples else ["eci"]
    return eci_df.set_index("Model")[columns].join(per_model)


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


def _number(value: Any) -> float | None:
    return None if value is None else round(float(value), 2)


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
                weights=weights_of(access),
                accessibility=access,
                official_eci=official_eci,
            )
        )
    return scores
