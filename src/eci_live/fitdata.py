"""`fit.json`: benchmark parameters and the fit's input, for the views beyond the leaderboard.

The page needs them for the "Interpreting the ECI" curves, custom benchmark selections
(refit in the browser with the same solver as `domain.py`) and the training compute view.
Written from the latest snapshot's central fit, which `detail.build` has just checked
against the snapshot.
"""

import json

from eci_live import domain
from eci_live.refit import Fit
from eci_live.schema import FitBenchmark, FitData, FitModel, ModelDetail, Snapshot


def build(result: Fit, latest: Snapshot, details: dict[str, ModelDetail]) -> FitData:
    tags = {b["benchmark"]: b for b in latest.get("domains", {}).get("benchmarks", [])}
    benchmarks = [
        FitBenchmark(
            name=str(r["benchmark"]),
            edi=round(float(r["edi"]), 3),
            slope=round(float(r["discriminability_scaled"]), 5),
            domains=tags[str(r["benchmark"])]["domains"] if str(r["benchmark"]) in tags else [],
        )
        for r in result.edi.sort_values("benchmark").to_dict("records")
    ]
    names = [m["name"] for m in latest["models"]]
    model_index = {n: i for i, n in enumerate(names)}
    bench_index = {b["name"]: i for i, b in enumerate(benchmarks)}
    best = domain.best_scores(result.data).reset_index()
    results = [
        (
            model_index[str(r["Model"])],
            bench_index[str(r["benchmark"])],
            round(float(r["performance"]), 4),
        )
        for r in best.to_dict("records")
        if str(r["Model"]) in model_index
    ]
    return FitData(
        snapshot=latest["id"],
        benchmarks=benchmarks,
        models=[
            FitModel(
                name=n,
                country=details[n]["country"] if n in details else None,
                training_compute_flop=details[n]["training_compute_flop"] if n in details else None,
            )
            for n in names
        ],
        results=results,
    )


def dump(data: FitData) -> str:
    return json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n"
