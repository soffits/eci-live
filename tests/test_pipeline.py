from pathlib import Path

import numpy as np
import pytest

from eci_live import history, refit, settings
from eci_live.schema import ModelScore, Snapshot


def model(version: str, eci: float) -> ModelScore:
    return ModelScore(
        version=version,
        name=version.upper(),
        group="G",
        effort=None,
        effort_rank=1,
        pro=False,
        lab="Lab",
        release_date="2026-01-01",
        eci=eci,
        ci_low=eci - 2,
        ci_high=eci + 2,
        benchmarks=5,
        borrowed=0,
        rank_low=None,
        rank_high=None,
        p_first=None,
        weights="closed",
        accessibility="API access",
        missing_areas=[],
    )


def snapshot(
    fetched_at: str, sha: str, models: list[ModelScore], schema: int = settings.SCHEMA_VERSION
) -> Snapshot:
    return Snapshot(
        schema=schema,
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
            "bootstrap_chunks": 0,
            "ci_level": 0.9,
            "resamples_per_draw": 1,
            "rank_min_benchmarks": 4,
        },
        build={"commit": None, "run_url": None},
        models=models,
        groups=[],
        core_areas=[],
        folded={},
    )


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
    old = snapshot("2026-10-28T05:00:00Z", "aaaa0000", [model("a_max", 150.0)])
    new = snapshot("2026-10-29T05:00:00Z", "bbbb0000", [model("a_max", 151.0), model("b/c", 160.0)])
    for snap in (new, old):
        history.save(tmp_path, snap)
    loaded = history.load(tmp_path)
    assert [s["id"] for s in loaded] == [old["id"], new["id"]]

    site = history.site_data(loaded)
    assert site["latest"]["id"] == new["id"]
    assert site["previous_eci"] == {"a_max": 150.0}
    assert site["first_seen"] == {"a_max": "2026-10-28T05:00:00Z", "b/c": "2026-10-29T05:00:00Z"}
    assert site["slugs"] == {"a_max": "a-max", "b/c": "b-c"}
    assert site["redirects"] == {}


def test_folded_versions_old_pages_redirect_to_their_top_variant() -> None:
    snap = snapshot("2026-10-29T05:00:00Z", "bbbb0000", [model("a_max", 151.0)])
    # A folded version whose top variant isn't published has no page to land on.
    snap["folded"] = {"a_unknown": "a_max", "z_unknown": "z_max"}
    site = history.site_data([snap])
    assert site["slugs"] == {"a_max": "a-max"}
    assert site["redirects"] == {"a-unknown": "a-max"}


def test_snapshots_of_an_older_schema_are_not_variant_history() -> None:
    groups = snapshot("2026-10-28T05:00:00Z", "aaaa0000", [model("A", 150.0)], schema=1)
    new = snapshot("2026-10-28T06:00:00Z", "aaaa0000", [model("a_max", 151.0)])
    # The same input as a group-level snapshot still needs a variant snapshot.
    assert not history.has_input([groups], "aaaa0000")
    assert history.has_input([groups, new], "aaaa0000")
    site = history.site_data([groups, new])
    assert site["latest"]["id"] == new["id"]
    assert site["previous_eci"] == {} and list(site["first_seen"]) == ["a_max"]
    assert len(site["snapshots"]) == 2
    with pytest.raises(ValueError, match="current schema"):
        history.site_data([groups])
