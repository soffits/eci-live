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
from eci import (
    download_benchmark_data,
    load_benchmark_metadata,
    load_model_metadata,
    prepare_benchmark_data,
)

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


# Column of the variants' fit input naming the unrecorded-thinking version a borrowed row
# came from (None for a variant's own results).
BORROWED = "borrowed_from"


def _linked(benchmarks: set[str], supersede: dict[str, str]) -> set[str]:
    """`benchmarks` and every older or newer version of them (eci-public's supersession)."""
    linked = set(benchmarks)
    while True:
        more = {new for old, new in supersede.items() if old in linked} | {
            old for old, new in supersede.items() if new in linked
        }
        if more <= linked:
            return linked
        linked |= more


def top_variants(data: pd.DataFrame, table: pd.DataFrame) -> dict[str, str]:
    """Unrecorded-thinking version -> the sibling it is folded into.

    In each model group, the top variant is the non-pro one with the highest effort rank
    (then more benchmarks, a newer release, the version id), as the page prefers. When that
    is a labelled effort, which ranks above thinking at an unrecorded level, the group's
    non-pro unrecorded-thinking versions fold into it. Where an unrecorded one is itself the
    top (beside thinking budgets or versions without a setting, or alone), nothing folds.
    """
    meta = table.set_index("model_version")
    counts = data.groupby("Model")["benchmark"].nunique()
    groups: dict[str, list[str]] = {}
    for v in sorted(str(m) for m in counts.index):
        groups.setdefault(_text(meta.at[v, "model_group"]) or v, []).append(v)
    folded: dict[str, str] = {}
    for members in groups.values():
        level = {v: effort(v, _text(meta.at[v, "display_name"])) for v in members}
        plain = [v for v in members if not level[v][2]]
        if not plain:
            continue
        dates = {v: meta.at[v, "date"] for v in plain}
        top = max(
            plain,
            key=lambda v: (
                level[v][1],
                int(counts[v]),
                pd.Timestamp.min if pd.isna(dates[v]) else dates[v],
                v,
            ),
        )
        if level[top][1] != THINKING:
            folded |= {v: top for v in plain if level[v][1] == THINKING}
    return folded


def fold_unrecorded(
    data: pd.DataFrame, table: pd.DataFrame, supersede: dict[str, str]
) -> tuple[pd.DataFrame, dict[str, str]]:
    """The fit input with each folded unrecorded-thinking version's results moved to its top
    variant (`top_variants`), only for benchmarks the top variant has no result of its own
    (nor an older or newer version of one), marked in BORROWED; and the folded versions."""
    folded = top_variants(data, table)
    own = data[~data["Model"].isin(folded)].assign(**{BORROWED: None})
    borrowed = []
    for top in sorted(set(folded.values())):
        mine = own[own["Model"] == top]
        taken = _linked({str(b) for b in mine["benchmark"]}, supersede)
        sources = [v for v, t in folded.items() if t == top]
        rows = data[data["Model"].isin(sources) & ~data["benchmark"].isin(taken)]
        best = rows.sort_values(["performance", "Model"], ascending=[False, True])
        best = best.drop_duplicates("benchmark")
        borrowed.append(
            best.assign(
                **{BORROWED: best["Model"]},
                Model=top,
                model=top,
                model_version=top,
                model_id=mine["model_id"].iloc[0] if len(mine) else best["model_id"],
            )
        )
    out = pd.concat([own, *borrowed], ignore_index=True)
    return out, folded


@dataclass(frozen=True)
class Variants:
    table: pd.DataFrame  # Epoch's model table, one row per version
    data: pd.DataFrame  # the variants' fit input (`fit_input`, unrecorded thinking folded)
    best: pd.Series  # (version, benchmark) -> 0-1 score
    # Unrecorded-thinking version -> the top variant its results were folded into.
    folded: dict[str, str]


def load(zip_path: Path) -> Variants:
    table = model_table(zip_path)
    metadata = load_benchmark_metadata(download_benchmark_data(zip_path))
    supersede = {
        str(r["benchmark"]): str(r["superseded_by"])
        for r in metadata.dropna(subset=["superseded_by"]).to_dict("records")
        if str(r["superseded_by"])
    }
    data, folded = fold_unrecorded(fit_input(zip_path, table), table, supersede)
    return Variants(table=table, data=data, best=domain.best_scores(data), folded=folded)


def missing_areas(benchmarks: list[str], tags: dict[str, list[str]]) -> list[str]:
    """The CORE_AREAS none of `benchmarks` is tagged with."""
    seen = {t for b in benchmarks for t in tags.get(b, [])}
    return [area for area, domains in settings.CORE_AREAS if not seen & set(domains)]


def scores(fit: Fit, variants: Variants, tags: dict[str, list[str]] | None) -> list[ModelScore]:
    """Every variant with at least one fitted benchmark, best first. `tags` are the hub's
    domain tags per benchmark (None if unread: coverage unknown, nobody excluded for it)."""
    scored = domain.fixed_fit(
        fit, variants.best, None, domain.seed_for(0), settings.RESAMPLES_PER_DRAW
    )
    versions = [str(v) for v in scored.central.index]
    interval = scored.interval()
    fitted = set(fit.edi["benchmark"])
    used = {
        str(v): [str(b) for b in row.dropna().index if b in fitted]
        for v, row in variants.best.unstack().iterrows()
    }
    lent = variants.data[variants.data[BORROWED].notna() & variants.data["benchmark"].isin(fitted)]
    borrowed = lent.groupby("Model")["benchmark"].nunique()
    missing = {v: None if tags is None else missing_areas(used.get(v, []), tags) for v in versions}
    ranked = (scored.benchmarks.to_numpy() >= settings.RANK_MIN_BENCHMARKS) & np.array(
        [not missing[v] for v in versions]
    )
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
                borrowed=int(borrowed.get(v, 0)),
                rank_low=None if rank is None else int(rank["rank_low"]),
                rank_high=None if rank is None else int(rank["rank_high"]),
                p_first=None if rank is None else float(rank["p_first"]),
                weights=weights_of(access),
                accessibility=access,
                missing_areas=missing[v],
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
