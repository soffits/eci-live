"""Detail export on a small synthetic zip shaped like Epoch's."""

import math
from pathlib import Path

import pandas as pd
import pytest

from eci_live import detail, history, refit, settings, variants
from eci_live.schema import ModelDetail, Snapshot

THIN = "thin"  # the synthetic zip's model with only four benchmarks (conftest.py)
Fitted = tuple[refit.Fit, variants.Variants]


@pytest.fixture(scope="module")
def fitted(synthetic_zip: Path) -> Fitted:
    return refit.fit(synthetic_zip, 0), variants.load(synthetic_zip)


def _snapshot(fitted: Fitted, shift: float = 0.0, group_shift: float = 0.0) -> Snapshot:
    result, found = fitted
    models = [m | {"eci": round(m["eci"] + shift, 2)} for m in variants.scores(result, found, None)]
    groups = [g | {"eci": round(g["eci"] + group_shift, 2)} for g in refit.group_scores(result)]
    return Snapshot(
        schema=settings.SCHEMA_VERSION,
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
            "bootstrap_chunks": 0,
            "ci_level": 0.9,
            "resamples_per_draw": 1,
            "rank_min_benchmarks": 4,
        },
        build={"commit": None, "run_url": None},
        models=models,
        groups=groups,
        core_areas=[],
    )


@pytest.fixture(scope="module")
def details(synthetic_zip: Path, fitted: Fitted) -> tuple[Snapshot, dict[str, ModelDetail]]:
    snap = _snapshot(fitted)
    return snap, detail.build(synthetic_zip, [snap], *fitted)


def test_predicted_scores_reproduce_from_exported_numbers(
    details: tuple[Snapshot, dict[str, ModelDetail]],
) -> None:
    snap, out = details
    eci = {m["version"]: m["eci"] for m in snap["models"]}
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
    # Each variant's page has only its own results.
    assert [r["benchmark"] for r in out["twin-mini"]["results"]] == ["Alpha"]
    assert [r["used"] for r in out["twin"]["results"] if r["benchmark"] == "Alpha"] == [True]
    beta = [r for r in out["model-a"]["results"] if r["benchmark"] == "Beta"]
    assert [r["used"] for r in beta] == [True, False]
    assert beta[1]["reason"] == detail.BETTER_RESULT

    old = next(r for r in out["model-a"]["results"] if r["benchmark"] == "Old Bench")
    assert old["reason"] == "Replaced in the fit by New Bench, a newer version of this benchmark."
    # Model C has only the old version, so it counts.
    assert next(r for r in out["model-c"]["results"] if r["benchmark"] == "Old Bench")["used"]

    side = next(r for r in out["model-a"]["results"] if r["benchmark"] == "Side-Quest")
    assert side["reason"] == detail.NOT_IN_INDEX
    assert (side["score"], side["score_column"], side["source_url"]) == (
        71.5,
        "Score",
        "https://example.org/board",
    )


def test_model_facts_and_thin_evidence(details: tuple[Snapshot, dict[str, ModelDetail]]) -> None:
    _, out = details
    assert len(out[THIN]["fit"]) == 4
    a = out["model-a"]
    assert (a["organization"], a["country"], a["training_compute_flop"]) == ("Lab", "Nowhere", 1e25)
    # twin-mini records no organization; its group's other version does.
    assert out["twin-mini"]["organization"] == "Lab"
    assert (a["name"], a["version"]) == ("Model A (max)", "model-a")
    assert a["history"][0]["eci"] == next(
        m["eci"] for m in details[0]["models"] if m["version"] == "model-a"
    )


@pytest.mark.parametrize(("shift", "group_shift"), [(0.5, 0.0), (0.0, 0.5)])
def test_refuses_to_publish_when_the_refit_does_not_reproduce(
    synthetic_zip: Path, fitted: Fitted, shift: float, group_shift: float
) -> None:
    with pytest.raises(detail.ReproduceError):
        detail.build(synthetic_zip, [_snapshot(fitted, shift, group_shift)], *fitted)


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
    assert history.slugs(["gpt-5.1_high", "gpt-5-1-high", "chutes/Ünïcode"]) == {
        "gpt-5.1_high": "gpt-5-1-high",
        "gpt-5-1-high": "gpt-5-1-high-2",
        "chutes/Ünïcode": "chutes-n-code",
    }
