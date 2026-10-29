"""Epoch's published Cyber ECI.

Epoch builds it from a separate joint fit of the general benchmarks and 34 cyber benchmarks
on an older, unpublished snapshot of the general data, so it can't be reproduced from the
zip. It is fetched with its provenance and shown as Epoch's own numbers.
"""

from pathlib import Path
from typing import Any

import pandas as pd

from eci_live import settings, source
from eci_live.refit import lab_of, weights_of
from eci_live.schema import Cyber, CyberModel


def _text(value: Any) -> str | None:
    return None if pd.isna(value) or str(value).strip() in ("", "Unknown") else str(value)


def _number(value: Any) -> float | None:
    return None if pd.isna(value) else round(float(str(value)), 2)


def parse(scores: pd.DataFrame, results: pd.DataFrame) -> tuple[list[str], list[CyberModel]]:
    counts = results.groupby("Model")["benchmark"].nunique()
    models = [
        CyberModel(
            name=str(r["Model"]),
            general_name=_text(r["general_model_name"]),
            lab=lab_of(_text(r["Organization"])),
            release_date=_text(r["date"]),
            accessibility=_text(r["Model accessibility"]),
            weights=weights_of(_text(r["Model accessibility"])),
            country=_text(r["Country (of organization)"]),
            eci=round(float(r["eci"]), 2),
            ci_low=_number(r["eci_ci_low"]),
            ci_high=_number(r["eci_ci_high"]),
            benchmarks=int(counts.get(r["Model"], 0)),
        )
        for r in scores.to_dict("records")
    ]
    benchmarks = sorted(str(b) for b in results["benchmark"].unique())
    return benchmarks, sorted(models, key=lambda m: -m["eci"])


def fetch(work_dir: Path) -> Cyber:
    scores_path = work_dir / settings.CYBER_SCORES_ASSET
    results_path = work_dir / settings.CYBER_RESULTS_ASSET
    scores_info = source.download(settings.CYBER_SCORES_URL, scores_path)
    results_info = source.download(settings.CYBER_RESULTS_URL, results_path)
    benchmarks, models = parse(pd.read_csv(scores_path), pd.read_csv(results_path))
    return Cyber(scores=scores_info, results=results_info, benchmarks=benchmarks, models=models)
