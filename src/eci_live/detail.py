"""Per-model detail pages: every raw result in the zip, and how the fit used them.

Which results entered the fit is read from `eci.prepare_benchmark_data` (the fit's own
input), and the benchmark parameters from `eci.fit_eci_model`; nothing here re-derives
the method. The central fit is deterministic, so it is re-run on the latest snapshot's
input and checked against that snapshot's published scores.
"""

import json
import math
import re
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from eci import (
    download_benchmark_data,
    fit_eci_model,
    load_benchmark_metadata,
    prepare_benchmark_data,
)
from eci.dataloader import BENCHMARK_METADATA_FILENAME, MODEL_METADATA_FILENAME

from eci_live.schema import (
    BenchmarkResult,
    FitTerm,
    HistoryPoint,
    ModelDetail,
    ModelVersion,
    Snapshot,
)

# Columns every benchmark file shares; they describe the model, not its score.
DESCRIPTIVE = frozenset(
    {
        "Model version",
        "Release date",
        "Organization",
        "Country",
        "Training compute (FLOP)",
        "Training compute notes",
        "id",
        "Notes",
        "Source",
        "Name",
        "Source link",
        "Log viewer",
        "Logs",
        "Started at",
    }
)
STDERR_COLUMN = re.compile(r"^(stderr|.*standard error|.* SE)$", re.IGNORECASE)
# Largest |central refit - published snapshot| ECI accepted (the snapshot rounds to 0.01).
REPRODUCE_TOLERANCE = 0.006

NOT_IN_INDEX = "This benchmark isn't part of the index."
REPLACED = "Replaced in the fit by {new}, a newer version of this benchmark."
BETTER_VERSION = "Another version of this model scored higher here; the fit keeps the best score."
SAME_SCORE = "Another version of this model has the same score; it is counted once."
NOT_IN_FIT = "Not in the fit's input."


class ReproduceError(RuntimeError):
    """The central refit doesn't reproduce the published snapshot."""


def _key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _title(stem: str) -> str:
    return stem.replace("_external", "").replace("_", " ").strip().title()


def _value(value: Any) -> Any:
    return None if value is None or (isinstance(value, float) and math.isnan(value)) else value


def _text(value: Any) -> str | None:
    value = _value(value)
    return None if value is None or str(value).strip() == "" else str(value)


def _float(value: Any, digits: int = 4) -> float | None:
    number = pd.to_numeric(_value(value), errors="coerce")
    return None if pd.isna(number) else round(float(number), digits)


def _day(value: Any) -> str | None:
    text = _text(value)
    if text is None:
        return None
    stamp = pd.to_datetime(text, errors="coerce", utc=True)
    return None if pd.isna(stamp) else stamp.date().isoformat()


Row = dict[str, Any]


def _rows(frame: pd.DataFrame) -> list[Row]:
    return [{str(k): v for k, v in r.items()} for r in frame.to_dict("records")]


def _newest(versions: pd.DataFrame, column: str) -> Any:
    """The newest version's value of `column`, skipping versions without one."""
    known = versions.dropna(subset=[column]).sort_values("date", ascending=False)
    return known[column].iloc[0] if len(known) else None


def _source(row: Row) -> tuple[str | None, str | None]:
    """(name, link) of an external result's source; some files put the link in `Source`."""
    source, url = _text(row["source"]), _text(row["source_url"])
    if source and source.startswith(("http://", "https://")):
        return None, url or source
    return source, url


def _sources(dfs: dict[str, pd.DataFrame], metadata: pd.DataFrame) -> list[dict[str, Any]]:
    """Where each benchmark's scores live. Metadata rows name their file and column;
    files the metadata doesn't reference are matched to a benchmark by name, and their
    score is the first numeric column that doesn't describe the model."""
    configs: list[dict[str, Any]] = []
    referenced = metadata.dropna(subset=["source_file"])
    for cfg in _rows(referenced):
        if cfg["source_file"] in dfs:
            configs.append(
                {
                    "file": cfg["source_file"],
                    "benchmark": cfg["benchmark"],
                    "column": cfg["score_column"],
                    "in_index": bool(cfg["in_eci"]),
                    "scale": float(cfg["scale"]),
                    "baseline": float(cfg["random_baseline"]),
                    "ceiling": float(cfg["score_ceiling"]),
                }
            )
    names = {_key(name): name for name in metadata["benchmark"]}
    for file, frame in dfs.items():
        if file in (BENCHMARK_METADATA_FILENAME, MODEL_METADATA_FILENAME):
            continue
        if file in set(referenced["source_file"]):
            continue
        numeric = [
            c
            for c in frame.columns
            if c not in DESCRIPTIVE
            and not STDERR_COLUMN.match(c)
            and pd.api.types.is_numeric_dtype(frame[c])
        ]
        if not numeric:
            continue
        stem = Path(file).stem
        configs.append(
            {
                "file": file,
                "benchmark": names.get(_key(stem.replace("_external", "")), _title(stem)),
                "column": numeric[0],
                "in_index": False,
            }
        )
    return configs


def _stderr(frame: pd.DataFrame, score_column: str, score: pd.Series) -> pd.Series:
    """The score's standard error on the score's own scale, or NaN. Prefers the column
    named after the score ("Pass@1 score" -> "Pass@1 Standard Error"), then `stderr`.
    Sources that give fractions with errors in percentage points are rescaled."""
    candidates = [c for c in frame.columns if STDERR_COLUMN.match(c)]
    head = score_column.split()[0].lower()
    column = next(
        (c for c in candidates if c.lower().startswith(head)),
        next(
            (c for c in candidates if c.lower() == "stderr"),
            candidates[0] if len(candidates) == 1 else None,
        ),
    )
    if column is None:
        return pd.Series(np.nan, index=frame.index)
    stderr = pd.to_numeric(frame[column], errors="coerce")
    if score.max() <= 1 and stderr.median() > 1:
        stderr = stderr / 100
    return stderr


def _log_url(frame: pd.DataFrame) -> pd.Series:
    """Epoch's log viewer link where it ran the benchmark, else the raw log file."""
    viewer = frame.get("Log viewer", pd.Series(np.nan, index=frame.index))
    logs = frame.get("Logs", pd.Series(np.nan, index=frame.index))
    combined: pd.Series = viewer.astype(object).where(viewer.notna(), logs)
    return combined


def raw_results(dfs: dict[str, pd.DataFrame], metadata: pd.DataFrame) -> pd.DataFrame:
    """Every scored row in the zip, one per (model version, benchmark, row)."""
    frames = []
    for cfg in _sources(dfs, metadata):
        frame = dfs[cfg["file"]]
        if cfg["column"] not in frame.columns:
            continue
        score = pd.to_numeric(frame[cfg["column"]], errors="coerce")
        ids = (
            frame["id"].astype(str)
            if "id" in frame.columns
            else pd.Series([f"{cfg['file']}#{i}" for i in frame.index], index=frame.index)
        )
        rows = pd.DataFrame(
            {
                "id": ids,
                "version": frame["Model version"],
                "benchmark": cfg["benchmark"],
                "score": score,
                "score_column": cfg["column"],
                "stderr": _stderr(frame, cfg["column"], score),
                "log_url": _log_url(frame),
                "source": frame.get("Source"),
                "source_url": frame.get("Source link"),
                "run_at": frame.get("Started at"),
                "in_index": cfg["in_index"],
            }
        )
        if cfg["in_index"]:
            # The 0-1 score the fit sees: random baseline -> 0, ceiling -> 1, clipped.
            raw = score * cfg["scale"]
            span = cfg["ceiling"] - cfg["baseline"]
            rows["normalized"] = ((raw - cfg["baseline"]) / span).clip(0.0, 1.0)
        else:
            rows["normalized"] = np.nan
        rows = rows.dropna(subset=["version", "score"])
        frames.append(rows[np.isfinite(rows["score"])])
    combined: pd.DataFrame = pd.concat(frames, ignore_index=True)
    return combined


def _decide(
    results: pd.DataFrame, fit_input: pd.DataFrame, supersede: dict[str, str]
) -> list[tuple[bool, str | None]]:
    """For one model's rows: which one the fit used per benchmark, and why the others
    weren't. `fit_input` is this model's rows of `prepare_benchmark_data`."""
    used_perf = {str(r["benchmark"]): float(r["performance"]) for r in _rows(fit_input)}
    claimed: set[str] = set()
    out: list[tuple[bool, str | None]] = []
    for row in _rows(results):
        bench = str(row["benchmark"])
        if not row["in_index"]:
            out.append((False, NOT_IN_INDEX))
        elif bench not in used_perf:
            new = supersede.get(bench)
            out.append((False, REPLACED.format(new=new) if new in used_perf else NOT_IN_FIT))
        elif not math.isclose(float(row["normalized"]), used_perf[bench], abs_tol=1e-9):
            out.append((False, BETTER_VERSION))
        elif bench not in claimed:
            claimed.add(bench)
            out.append((True, None))
        else:
            out.append((False, SAME_SCORE))
    missing = set(used_perf) - claimed
    if missing:
        raise ValueError(f"fit input rows without a matching raw result: {sorted(missing)}")
    return out


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def predicted(eci: float, edi: float, slope: float) -> float:
    """The fit's logistic prediction of a 0-1 score, on the ECI scale."""
    return _sigmoid(slope * (eci - edi))


def build(zip_path: Path, snapshots: list[Snapshot]) -> dict[str, ModelDetail]:
    """Detail data for every model of the latest snapshot, keyed by model name."""
    latest = snapshots[-1]
    dfs = download_benchmark_data(zip_path)
    metadata = load_benchmark_metadata(dfs)
    fit_input = prepare_benchmark_data(zip_path)
    eci_df, edi_df, _ = fit_eci_model(fit_input, bootstrap_samples=0)

    central = eci_df.set_index("Model")["eci"]
    published = {m["name"]: m["eci"] for m in latest["models"]}
    off = {
        n: round(float(central[n]), 3)
        for n in published
        if abs(central[n] - published[n]) > REPRODUCE_TOLERANCE
    }
    if off or set(central.index) != set(published):
        raise ReproduceError(f"central refit differs from snapshot {latest['id']}: {off}")

    params = {
        str(r["benchmark"]): (float(r["edi"]), float(r["discriminability_scaled"]))
        for r in _rows(edi_df)
    }
    supersede = {
        str(r["benchmark"]): str(r["superseded_by"])
        for r in _rows(metadata.dropna(subset=["superseded_by"]))
        if str(r["superseded_by"])
    }
    versions = (
        dfs[MODEL_METADATA_FILENAME]
        .dropna(subset=["model_version", "model_group"])
        .sort_values("model_version")
    )
    results = raw_results(dfs, metadata)
    results = results.merge(
        versions[["model_version", "model_group"]], left_on="version", right_on="model_version"
    )
    # Best score first, so the row the fit used is the first match in each benchmark.
    results = results.sort_values(
        ["benchmark", "normalized", "score"], ascending=[True, False, False]
    )

    history: dict[str, list[HistoryPoint]] = {}
    for snap in snapshots:
        for m in snap["models"]:
            history.setdefault(m["name"], []).append(
                HistoryPoint(
                    snapshot=snap["id"],
                    fetched_at=snap["input"]["fetched_at"],
                    eci=m["eci"],
                    ci_low=m["ci_low"],
                    ci_high=m["ci_high"],
                )
            )

    details: dict[str, ModelDetail] = {}
    for name in published:
        own = fit_input[fit_input["Model"] == name]
        rows = results[results["model_group"] == name]
        decisions = _decide(rows, own, supersede)
        mine = versions[versions["model_group"] == name]
        eci = float(central[name])
        terms = []
        for r in _rows(own):
            bench = str(r["benchmark"])
            edi, slope = params[bench]
            terms.append(
                FitTerm(
                    benchmark=bench,
                    edi=round(edi, 3),
                    slope=round(slope, 5),
                    actual=round(float(r["performance"]), 4),
                    predicted=round(predicted(eci, edi, slope), 4),
                )
            )
        details[name] = ModelDetail(
            name=name,
            snapshot=latest["id"],
            organization=_text(_newest(mine, "organization")),
            country=_text(_newest(mine, "country")),
            training_compute_flop=_float(_newest(mine, "training_compute_flop"), 0),
            versions=[
                ModelVersion(
                    version=str(v["model_version"]),
                    display_name=_text(v["display_name"]),
                    release_date=_day(v["date"]),
                )
                for v in _rows(mine)
            ],
            history=history.get(name, []),
            fit=sorted(terms, key=lambda t: t["actual"] - t["predicted"], reverse=True),
            results=[
                BenchmarkResult(
                    id=str(r["id"]),
                    benchmark=str(r["benchmark"]),
                    version=str(r["version"]),
                    score=round(float(r["score"]), 4),
                    score_column=str(r["score_column"]),
                    stderr=_float(r["stderr"]),
                    log_url=_text(r["log_url"]),
                    source=_source(r)[0],
                    source_url=_source(r)[1],
                    run_at=_day(r["run_at"]),
                    normalized=_float(r["normalized"]),
                    used=used,
                    reason=reason,
                )
                for r, (used, reason) in zip(_rows(rows), decisions, strict=True)
            ],
        )
    return details


def write(details: dict[str, ModelDetail], slugs: dict[str, str], out_dir: Path) -> int:
    """One JSON per model in `out_dir`, replacing any from an earlier run."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.json"):
        old.unlink()
    for name, detail in details.items():
        text = json.dumps(detail, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        (out_dir / f"{slugs[name]}.json").write_text(text + "\n")
    return len(details)
