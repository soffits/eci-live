"""Detail export on a small synthetic zip shaped like Epoch's."""

import math
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from eci import fit_eci_model, prepare_benchmark_data

from eci_live import detail, history
from eci_live.schema import ModelDetail, ModelScore, Snapshot

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


@pytest.fixture(scope="module")
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


def _snapshot(zip_path: Path, shift: float = 0.0) -> Snapshot:
    eci_df, _, _ = fit_eci_model(prepare_benchmark_data(zip_path), bootstrap_samples=0)
    models = [
        ModelScore(
            name=str(r.Model),
            lab="Lab",
            release_date="2025-01-01",
            eci=round(float(r.eci) + shift, 2),
            ci_low=None,
            ci_high=None,
            benchmarks=0,
            rank_low=None,
            rank_high=None,
            p_first=None,
            weights="closed",
            accessibility=None,
            official_eci=None,
        )
        for r in eci_df.itertuples()
    ]
    return Snapshot(
        schema=1,
        id="2026-01-01T0000Z-abcdef12",
        input={
            "url": "u",
            "sha256": "s",
            "fetched_at": "2026-01-01T00:00:00Z",
            "last_modified": None,
            "archive_url": None,
        },
        fit={
            "eci_public_commit": "c",
            "bootstrap_samples": 0,
            "bootstrap_seed": 0,
            "ci_level": 0.9,
        },
        build={"commit": None, "run_url": None},
        drift={"shared_models": 0, "max_abs": 0, "mean_abs": 0, "tolerance": 1},
        models=models,
    )


@pytest.fixture(scope="module")
def details(synthetic_zip: Path) -> tuple[Snapshot, dict[str, ModelDetail]]:
    snap = _snapshot(synthetic_zip)
    return snap, detail.build(synthetic_zip, [snap])


def test_predicted_scores_reproduce_from_exported_numbers(
    details: tuple[Snapshot, dict[str, ModelDetail]],
) -> None:
    snap, out = details
    eci = {m["name"]: m["eci"] for m in snap["models"]}
    for name, d in out.items():
        for term in d["fit"]:
            again = 1 / (1 + math.exp(-term["slope"] * (eci[name] - term["edi"])))
            assert again == pytest.approx(term["predicted"], abs=2e-3), (name, term)


def test_each_fit_term_is_one_used_result(details: tuple[Snapshot, dict[str, ModelDetail]]) -> None:
    _, out = details
    for d in out.values():
        used = [r for r in d["results"] if r["used"]]
        assert sorted(r["benchmark"] for r in used) == sorted(t["benchmark"] for t in d["fit"])
        actual = {t["benchmark"]: t["actual"] for t in d["fit"]}
        for r in used:
            assert r["normalized"] == pytest.approx(actual[r["benchmark"]], abs=1e-4)


def test_unused_results_say_why(details: tuple[Snapshot, dict[str, ModelDetail]]) -> None:
    _, out = details
    twin_alpha = [r for r in out["Twin"]["results"] if r["benchmark"] == "Alpha"]
    assert [r["used"] for r in twin_alpha] == [True, False]
    assert twin_alpha[1]["version"] == "twin-mini"
    assert twin_alpha[1]["reason"] == detail.BETTER_VERSION

    old = next(r for r in out["Model A"]["results"] if r["benchmark"] == "Old Bench")
    assert old["reason"] == "Replaced in the fit by New Bench, a newer version of this benchmark."
    # Model C has only the old version, so it counts.
    assert next(r for r in out["Model C"]["results"] if r["benchmark"] == "Old Bench")["used"]

    side = next(r for r in out["Model A"]["results"] if r["benchmark"] == "Side-Quest")
    assert side["reason"] == detail.NOT_IN_INDEX
    assert (side["score"], side["score_column"], side["source_url"]) == (
        71.5,
        "Score",
        "https://example.org/board",
    )


def test_model_facts_and_thin_evidence(details: tuple[Snapshot, dict[str, ModelDetail]]) -> None:
    _, out = details
    assert len(out[THIN]["fit"]) == 4
    a = out["Model A"]
    assert (a["organization"], a["country"], a["training_compute_flop"]) == ("Lab", "Nowhere", 1e25)
    assert [v["version"] for v in out["Twin"]["versions"]] == ["twin", "twin-mini"]
    assert a["history"][0]["eci"] == next(
        m["eci"] for m in details[0]["models"] if m["name"] == "Model A"
    )


def test_refuses_to_publish_when_the_refit_does_not_reproduce(synthetic_zip: Path) -> None:
    with pytest.raises(detail.ReproduceError):
        detail.build(synthetic_zip, [_snapshot(synthetic_zip, shift=0.5)])


def test_write_replaces_old_files(
    tmp_path: Path, details: tuple[Snapshot, dict[str, ModelDetail]]
) -> None:
    _, out = details
    (tmp_path / "stale.json").write_text("{}")
    slugs = history.slugs(list(out))
    assert detail.write(out, slugs, tmp_path) == len(out)
    assert sorted(p.stem for p in tmp_path.glob("*.json")) == sorted(slugs.values())


def test_stderr_is_matched_to_the_score_and_put_on_its_scale() -> None:
    frame = pd.DataFrame(
        {
            "Pass@1 score": [0.5, 0.6],
            "Pass@1 Standard Error": [5.0, 4.0],
            "Mean Standard Error": [9.0, 9.0],
        }
    )
    stderr = detail._stderr(frame, "Pass@1 score", frame["Pass@1 score"])
    assert stderr.tolist() == pytest.approx([0.05, 0.04])
    plain = pd.DataFrame({"Best score": [0.5], "stderr": [0.02], "Other SE": [0.9]})
    assert detail._stderr(plain, "Best score", plain["Best score"]).tolist() == [0.02]


def test_slugs_are_url_safe_and_unique() -> None:
    assert history.slugs(["GPT-5.1 (high)", "GPT 5.1 high", "Ünïcode"]) == {
        "GPT-5.1 (high)": "gpt-5-1-high",
        "GPT 5.1 high": "gpt-5-1-high-2",
        "Ünïcode": "n-code",
    }
