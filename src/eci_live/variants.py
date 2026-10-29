"""Model variants: each `model_version` of Epoch's model table as its own entry.

eci-public aggregates every version of a model group into one entry (best score per
benchmark). Here each version is kept apart by handing `prepare_benchmark_data` a model table
in which every version is its own group, so normalisation, the date filter, supersession and
the best-of-repeats aggregation are still Epoch's code.
"""

import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from eci import download_benchmark_data, load_model_metadata, prepare_benchmark_data

from eci_live import domain, settings
from eci_live.refit import Fit, lab_of, rank_stats, weights_of
from eci_live.schema import ModelScore

# Effort ranks, lowest first. A version id without a setting (UNRECORDED) ranks just above
# "none". A thinking budget ("_16K") ranks above minimal and low (deliberately reduced
# reasoning); thinking at an unrecorded level ("_unknown", "_thinking", usually the
# provider's default) above the budgets; the provider's own medium and up above all of them
# (Anthropic's "high" has no budget cap).
NONE, UNRECORDED, BUDGET_BASE, THINKING = 0, 1, 10, 999
NAMED = {
    "none": NONE,
    "minimal": 2,
    "low": 3,
    "medium": 1000,
    "high": 1001,
    "xhigh": 1002,
    "max": 1003,
}
SUFFIX = re.compile(r"_(pro)?([a-z]+|\d+k)$", re.IGNORECASE)
NO_THINKING = re.compile(r"\(no thinking\)\s*$", re.IGNORECASE)


def effort(version: str, display_name: str | None) -> tuple[str | None, int, bool]:
    """(label, rank, pro) of a version's reasoning setting, from its id.

    Higher rank means more reasoning effort (see the ranks above).
    """
    match = SUFFIX.search(version)
    if match is None:
        if display_name and NO_THINKING.search(display_name):
            return "no thinking", NONE, False
        return None, UNRECORDED, False
    pro, level = bool(match.group(1)), match.group(2).lower()
    if level.endswith("k") and level[:-1].isdigit():
        label, rank = f"{level} thinking", min(BUDGET_BASE + int(level[:-1]), THINKING - 1)
    elif level in NAMED:
        label, rank = level, NAMED[level]
    elif level in ("unknown", "thinking"):
        label, rank = ("unknown thinking" if level == "unknown" else "thinking"), THINKING
    else:
        return None, UNRECORDED, False
    return (f"pro, {label}" if pro else label), rank, pro


def model_table(zip_path: Path) -> pd.DataFrame:
    """Epoch's model table, one row per version (the newest row if a version repeats)."""
    table: pd.DataFrame = load_model_metadata(download_benchmark_data(zip_path))
    newest_first = table.sort_values("date", ascending=False, kind="stable")
    return newest_first.drop_duplicates("model_version").reset_index(drop=True)


def fit_input(zip_path: Path, table: pd.DataFrame) -> pd.DataFrame:
    """`prepare_benchmark_data` with every version as its own group, and no minimum count
    (the page applies its own "min. benchmarks")."""
    own = table.assign(model_group=table["model_version"])
    data: pd.DataFrame = prepare_benchmark_data(
        zip_path, model_metadata=own, min_benchmarks_per_model=1
    )
    return data


@dataclass(frozen=True)
class Variants:
    table: pd.DataFrame  # Epoch's model table, one row per version
    data: pd.DataFrame  # the variants' fit input (`fit_input`)
    best: pd.Series  # (version, benchmark) -> 0-1 score


def load(zip_path: Path) -> Variants:
    table = model_table(zip_path)
    data = fit_input(zip_path, table)
    return Variants(table=table, data=data, best=domain.best_scores(data))


def scores(fit: Fit, variants: Variants) -> list[ModelScore]:
    """Every variant with at least one fitted benchmark, best first."""
    scored = domain.fixed_fit(
        fit, variants.best, None, domain.seed_for(0), settings.RESAMPLES_PER_DRAW
    )
    versions = [str(v) for v in scored.central.index]
    interval = scored.interval()
    ranked = scored.benchmarks.to_numpy() >= settings.RANK_MIN_BENCHMARKS
    stats: dict[str, dict[Any, Any]] = (
        {
            str(k): v
            for k, v in rank_stats(scored.samples[:, ranked], list(np.array(versions)[ranked]))
            .to_dict("index")
            .items()
        }
        if scored.samples is not None and ranked.any()
        else {}
    )
    display = names(variants.table, versions)
    meta = variants.table.set_index("model_version")
    out: list[ModelScore] = []
    for i, v in enumerate(versions):
        row = meta.loc[v]
        label, level, pro = effort(v, _text(row.get("display_name")))
        access = _access(row.get("accessibility"))
        rank = stats.get(v)
        out.append(
            ModelScore(
                version=v,
                name=display[v],
                group=_text(row["model_group"]) or v,
                effort=label,
                effort_rank=level,
                pro=pro,
                lab=lab_of(_access(row.get("organization"))),
                release_date=None if pd.isna(row["date"]) else row["date"].date().isoformat(),
                eci=round(float(scored.central[v]), 2),
                ci_low=None if interval is None else round(float(interval[0][i]), 2),
                ci_high=None if interval is None else round(float(interval[1][i]), 2),
                benchmarks=int(scored.benchmarks[v]),
                rank_low=None if rank is None else int(rank["rank_low"]),
                rank_high=None if rank is None else int(rank["rank_high"]),
                p_first=None if rank is None else float(rank["p_first"]),
                weights=weights_of(access),
                accessibility=access,
            )
        )
    return sorted(out, key=lambda m: (-m["eci"], m["name"]))


def _access(value: Any) -> str | None:
    """Epoch writes "Unknown" where a field isn't recorded."""
    text = _text(value)
    return None if text == "Unknown" else text


def _text(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    return text or None


def names(table: pd.DataFrame, versions: list[str]) -> dict[str, str]:
    """A unique display name per version: Epoch's display name, else the group's name; where
    that clashes, the group plus the effort; where that still clashes, plus the version id."""
    rows = table.set_index("model_version")
    first: dict[str, str] = {}
    labelled: dict[str, str] = {}
    for v in versions:
        group = _text(rows.at[v, "model_group"]) or v
        display = _text(rows.at[v, "display_name"]) if "display_name" in rows else None
        first[v] = display or group
        label = effort(v, display)[0]
        labelled[v] = f"{group} ({label})" if label else first[v]
    clash = Counter(first.values())
    second = {v: first[v] if clash[first[v]] == 1 else labelled[v] for v in versions}
    clash = Counter(second.values())
    return {v: second[v] if clash[second[v]] == 1 else f"{second[v]} · {v}" for v in versions}
