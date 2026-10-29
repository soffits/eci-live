"""Shared fixtures: a small synthetic zip shaped like Epoch's."""

import math
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Benchmarks in the index: (name, difficulty, discriminability, random baseline).
BENCHMARKS = [
    ("Winogrande", -1.0, 1.0, 0.5),
    ("Alpha", -0.5, 1.4, 0.0),
    ("Beta", 0.0, 1.1, 0.25),
    ("Gamma", 0.5, 1.6, 0.0),
    ("Delta", 1.0, 1.2, 0.0),
    ("Old Bench", 0.2, 1.3, 0.0),
    ("New Bench", 0.4, 1.3, 0.0),
]
# Model group -> latent capability. Epoch's anchors must be present.
MODELS = {
    "Claude 3.5 Sonnet": -0.5,
    "GPT-5": 0.8,
    "Model A": 1.2,
    "Model B": 0.2,
    "Model C": -1.0,
    "Model D": 0.5,
    "Model E": -0.2,
    "Twin": 0.9,
}
THIN = "Thin"  # only four benchmarks, the fit's minimum


def _score(
    capability: float, difficulty: float, slope: float, baseline: float, noise: float
) -> float:
    perf = 1 / (1 + math.exp(-slope * (capability - difficulty))) + noise
    return baseline + min(max(perf, 0.02), 0.98) * (1 - baseline)


def _version(group: str) -> str:
    return group.lower().replace(" ", "-").replace(".", "")


@pytest.fixture(scope="session")
def synthetic_zip(tmp_path_factory: pytest.TempPathFactory) -> Path:
    rng = np.random.default_rng(7)
    path = tmp_path_factory.mktemp("zip") / "benchmark_data.zip"
    rows: dict[str, list[dict[str, object]]] = {name: [] for name, *_ in BENCHMARKS}
    for group, capability in {**MODELS, THIN: 0.1}.items():
        benches = BENCHMARKS[:4] if group == THIN else BENCHMARKS
        for name, difficulty, slope, baseline in benches:
            # Only some models have the old benchmark; Model A has both old and new.
            if name == "Old Bench" and group not in ("Model A", "Model C", "Model E"):
                continue
            if name == "New Bench" and group in ("Model C", "Model E"):
                continue
            score = _score(capability, difficulty, slope, baseline, rng.normal(0, 0.03))
            rows[name].append(
                {
                    "Model version": _version(group),
                    name: score,
                    "stderr": 0.01,
                    "Log viewer": "https://logs/x",
                }
            )
    # Twin has a second version that does worse on Alpha: the fit keeps the best.
    rows["Alpha"].append({"Model version": "twin-mini", "Alpha": 0.05, "stderr": 0.02})
    metadata = pd.DataFrame(
        [
            {
                "benchmark": name,
                "in_eci": True,
                "source_file": f"{_version(name)}.csv",
                "score_column": name,
                "scale": 1.0,
                "random_baseline": baseline,
                "score_ceiling": 1.0,
                "release_date": "2023-06-01",
                "superseded_by": "New Bench" if name == "Old Bench" else None,
            }
            for name, _, _, baseline in BENCHMARKS
        ]
        + [{"benchmark": "Side-Quest", "in_eci": False, "source_file": None}]
    )
    groups = [*MODELS, THIN]
    model_table = pd.DataFrame(
        [
            {
                "model_version": _version(g),
                "model_group": g,
                "date": "2025-01-01",
                "display_name": f"{g} (max)",
                "organization": "Lab",
                "country": "Nowhere",
                "accessibility": "API access",
                "training_compute_flop": 1e25 if g == "Model A" else None,
            }
            for g in groups
        ]
        + [
            {
                "model_version": "twin-mini",
                "model_group": "Twin",
                "date": "2025-01-01",
                "display_name": "Twin (mini)",
            }
        ]
    )
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("benchmark_metadata.csv", metadata.to_csv(index=False))
        zf.writestr("model_metadata.csv", model_table.to_csv(index=False))
        for name, *_ in BENCHMARKS:
            zf.writestr(f"{_version(name)}.csv", pd.DataFrame(rows[name]).to_csv(index=False))
        # A file the metadata doesn't reference: matched to "Side-Quest" by name.
        zf.writestr(
            "side_quest_external.csv",
            pd.DataFrame(
                [{"Model version": "model-a", "Source": "https://example.org/board", "Score": 71.5}]
            ).to_csv(index=False),
        )
    return path
