from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from eci_live import history, refit
from eci_live.drift import DriftError, check_drift
from eci_live.schema import ModelScore, Snapshot


def model(name: str, eci: float, official: float | None = None) -> ModelScore:
    return ModelScore(
        name=name,
        lab="Lab",
        release_date="2026-01-01",
        eci=eci,
        ci_low=eci - 2,
        ci_high=eci + 2,
        benchmarks=5,
        rank_low=None,
        rank_high=None,
        p_first=None,
        weights="closed",
        accessibility="API access",
        official_eci=official,
    )


def snapshot(fetched_at: str, sha: str, models: list[ModelScore]) -> Snapshot:
    return Snapshot(
        schema=1,
        id=history.snapshot_id(fetched_at, sha),
        input={
            "url": "u",
            "sha256": sha,
            "fetched_at": fetched_at,
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


def test_drift_within_tolerance_reports_stats() -> None:
    info = check_drift(
        [model("a", 150.0, 150.4), model("b", 140.0, 139.8), model("new", 160.0)],
        {"a", "b"},
        tolerance=1.0,
    )
    assert info == {"shared_models": 2, "max_abs": 0.4, "mean_abs": 0.3, "tolerance": 1.0}


def test_drift_beyond_tolerance_fails() -> None:
    with pytest.raises(DriftError, match=r"b \(3\.00\)"):
        check_drift([model("a", 150.0, 150.0), model("b", 143.0, 140.0)], {"a", "b"}, 1.0)


def test_drift_fails_when_published_model_disappears() -> None:
    with pytest.raises(DriftError, match="missing from refit"):
        check_drift([model("a", 150.0, 150.0)], {"a", "gone"}, 1.0)


@pytest.mark.parametrize(
    ("access", "expected"),
    [
        ("Open weights (restricted use)", "open"),
        ("API access", "closed"),
        ("Unreleased", "closed"),
        ("Limited access", "unknown"),
        (None, "unknown"),
    ],
)
def test_weights_follow_epochs_accessibility_groups(access: str | None, expected: str) -> None:
    assert refit.weights_of(access) == expected


def test_lab_is_first_listed_organization() -> None:
    assert refit.lab_of("Google DeepMind,Google") == "Google DeepMind"
    assert refit.lab_of(None) == "Unknown"


def test_model_scores_prefer_published_metadata_and_flag_unpublished() -> None:
    fit = pd.DataFrame(
        {
            "eci": [150.0, 155.0],
            "eci_ci_low": [148.0, None],
            "eci_ci_high": [152.0, None],
            "benchmarks": [6, 4],
            "date": pd.to_datetime(["2026-01-02", "2026-10-20"]),
        },
        index=pd.Index(["Known", "Fresh"], name="Model"),
    )
    official = pd.DataFrame(
        {
            "eci": [150.3],
            "date": ["2026-01-01"],
            "Organization": ["OpenAI"],
            "Model accessibility": ["API access"],
        },
        index=pd.Index(["Known"], name="Model"),
    )
    versions = pd.DataFrame(
        {
            "organization": ["DeepSeek,Peking University"],
            "accessibility": ["Open weights (unrestricted)"],
        },
        index=pd.Index(["Fresh"], name="model_group"),
    )
    fresh, known = refit.model_scores(fit, official, versions)
    assert (fresh["name"], fresh["lab"], fresh["weights"], fresh["official_eci"]) == (
        "Fresh",
        "DeepSeek",
        "open",
        None,
    )
    assert fresh["release_date"] == "2026-10-20"
    assert fresh["ci_low"] is None
    assert (known["lab"], known["release_date"], known["official_eci"]) == (
        "OpenAI",
        "2026-01-01",
        150.3,
    )


def test_rank_stats_give_rank_intervals_and_chance_of_first() -> None:
    draws = np.array([[3.0, 2.0, 1.0], [2.0, 3.0, 1.0], [3.0, 2.0, 1.0], [3.0, 1.0, 2.0]])
    stats = refit.rank_stats(draws, ["a", "b", "c"])
    assert stats["p_first"].to_dict() == {"a": 0.75, "b": 0.25, "c": 0.0}
    intervals = stats[["rank_low", "rank_high"]].to_dict("index")
    assert intervals["a"] == {"rank_low": 1, "rank_high": 2}
    assert intervals["c"] == {"rank_low": 2, "rank_high": 3}


def test_snapshot_id_is_sortable_and_tag_safe() -> None:
    assert (
        history.snapshot_id("2026-10-29T03:29:18Z", "b149788ecf06") == "2026-10-29T0329Z-b149788e"
    )


def test_history_round_trip_and_site_data(tmp_path: Path) -> None:
    old = snapshot("2026-10-28T05:00:00Z", "aaaa0000", [model("a", 150.0)])
    new = snapshot("2026-10-29T05:00:00Z", "bbbb0000", [model("a", 151.0), model("b", 160.0)])
    for snap in (new, old):
        history.save(tmp_path, snap)
    loaded = history.load(tmp_path)
    assert [s["id"] for s in loaded] == [old["id"], new["id"]]

    site = history.site_data(loaded)
    assert site["latest"]["id"] == new["id"]
    assert site["previous_eci"] == {"a": 150.0}
    assert site["first_seen"] == {"a": "2026-10-28T05:00:00Z", "b": "2026-10-29T05:00:00Z"}
