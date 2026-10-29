"""Variant scores: each model version scored with the group-level fit's parameters."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from eci import fit_eci_model, prepare_benchmark_data
from scipy.optimize import minimize_scalar

from eci_live import domain, refit, settings, variants


@pytest.mark.parametrize(
    ("version", "display", "expected"),
    [
        ("gpt-6-astra_max", "GPT-6 Astra (max)", ("max", 1003, False)),
        ("gpt-5-2025-08-07_minimal", None, ("minimal", 2, False)),
        ("claude-opus-4-5-20251101_16K", None, ("16k thinking", 26, False)),
        ("claude-opus-4-5-20251101", "Claude Opus 4.5 (no thinking)", ("no thinking", 0, False)),
        ("gpt-6-astra_unknown", None, ("unknown thinking", 999, False)),
        ("DeepSeek-V3.1_thinking", None, ("thinking", 999, False)),
        ("gpt-5.6-sol_promax", "GPT-5.6 Sol (pro, max)", ("pro, max", 1003, True)),
        ("Mistral-Large-Instruct-2407", None, (None, 1, False)),
        ("some_model_name", None, (None, 1, False)),
    ],
)
def test_effort_is_read_from_the_version_id(
    version: str, display: str | None, expected: tuple[str | None, int, bool]
) -> None:
    assert variants.effort(version, display) == expected


def test_effort_order() -> None:
    order = ["_none", "", "_minimal", "_low", "_8K", "_64K", "_unknown", "_medium", "_high"]
    ranks = [variants.effort(f"m{s}", None)[1] for s in [*order, "_xhigh", "_max"]]
    assert ranks == sorted(ranks) and len(set(ranks)) == len(ranks)


def test_names_use_display_names_and_resolve_clashes() -> None:
    table = pd.DataFrame(
        {
            "model_version": ["o_max", "o_high", "o_none", "solo", "p/r1", "r1"],
            "model_group": ["Opus", "Opus", "Opus", "Solo", "R1", "R1"],
            "display_name": ["Opus", "Opus", "Opus (none)", None, "R1", "R1"],
        }
    )
    assert variants.names(table, list(table["model_version"])) == {
        "o_max": "Opus (max)",
        "o_high": "Opus (high)",
        "o_none": "Opus (none)",
        "solo": "Solo",
        "p/r1": "R1 · p/r1",
        "r1": "R1 · r1",
    }


@pytest.fixture(scope="module")
def central(synthetic_zip: Path) -> refit.Fit:
    return refit.fit(synthetic_zip, 0)


@pytest.fixture(scope="module")
def found(synthetic_zip: Path) -> variants.Variants:
    return variants.load(synthetic_zip)


def test_group_level_fit_is_eci_publics_own(synthetic_zip: Path, central: refit.Fit) -> None:
    eci_df, edi_df, _ = fit_eci_model(prepare_benchmark_data(synthetic_zip), bootstrap_samples=0)
    assert central.eci.equals(eci_df) and central.edi.equals(edi_df)


def test_variant_input_is_epochs_preparation_per_version(
    central: refit.Fit, found: variants.Variants
) -> None:
    # Twin's group row on Alpha is the better of its two versions; each variant keeps its own.
    group = central.data.set_index(["Model", "benchmark"])["performance"]
    assert found.best[("twin", "Alpha")] == group[("Twin", "Alpha")]
    assert found.best[("twin-mini", "Alpha")] < group[("Twin", "Alpha")]
    # Supersession and normalisation are eci-public's: Model A's Old Bench is replaced.
    assert ("model-a", "Old Bench") not in found.best.index
    assert ("model-c", "Old Bench") in found.best.index


def test_a_variant_score_reproduces_from_the_fixed_benchmark_parameters(
    central: refit.Fit, found: variants.Variants
) -> None:
    params = central.edi.set_index("benchmark")
    scores = {m["version"]: m for m in variants.scores(central, found, None)}
    for version, row in found.best.unstack().iterrows():
        have = row.dropna()
        perf = np.clip(have.to_numpy(float), 1e-3, 1 - 1e-3)
        edi = params.loc[have.index, "edi"].to_numpy(float)
        slope = params.loc[have.index, "discriminability_scaled"].to_numpy(float)
        best = minimize_scalar(
            lambda c, p=perf, e=edi, s=slope: float(
                ((p - 1 / (1 + np.exp(-s * (c - e)))) ** 2).sum()
            ),
            bounds=(0, 300),
            method="bounded",
            options={"xatol": 1e-9},
        )
        assert scores[str(version)]["eci"] == pytest.approx(best.x, abs=0.01), version
        assert scores[str(version)]["benchmarks"] == len(have)


def test_a_group_with_one_variant_keeps_its_score(
    central: refit.Fit, found: variants.Variants
) -> None:
    groups = central.eci.set_index("Model")["eci"]
    scores = variants.scores(central, found, None)
    # (Fold's group fit has the unknown version's better Alpha; its top variant keeps its own.)
    single = [
        m
        for m in scores
        if sum(o["group"] == m["group"] for o in scores) == 1
        and m["version"] not in found.folded.values()
    ]
    assert len(single) >= 6
    # The joint fit's L2 penalty pulls capabilities slightly toward the middle; with this
    # zip's ~20 parameters that is up to ~0.4 ECI (on Epoch's real data, median 0.006).
    for m in single:
        assert m["eci"] == pytest.approx(groups[m["group"]], abs=0.5), m["name"]


def test_variants_get_intervals_and_only_well_evidenced_ones_get_ranks(
    synthetic_zip: Path, found: variants.Variants
) -> None:
    fit = refit.fit(synthetic_zip, 20, workers=1)
    scores = variants.scores(fit, found, None)
    assert scores == variants.scores(fit, found, None)
    assert [m["eci"] for m in scores] == sorted((m["eci"] for m in scores), reverse=True)
    by_version = {m["version"]: m for m in scores}
    mini = by_version["twin-mini"]
    assert (mini["name"], mini["group"], mini["benchmarks"]) == ("Twin (mini)", "Twin", 1)
    assert mini["rank_low"] is None and mini["p_first"] is None
    ranked = [m for m in scores if m["rank_low"] is not None]
    assert all(m["benchmarks"] >= settings.RANK_MIN_BENCHMARKS for m in ranked)
    assert sum(m["p_first"] or 0 for m in ranked) == pytest.approx(1, abs=0.01)
    for m in scores:
        assert m["ci_low"] is not None and m["ci_high"] is not None
        assert m["ci_low"] <= m["eci"] + 1e-6 <= m["ci_high"] + 2e-6


def test_fixed_fit_samples_are_joint_draws(synthetic_zip: Path, found: variants.Variants) -> None:
    fit = refit.fit(synthetic_zip, 4, workers=1)
    scored = domain.fixed_fit(fit, found.best, None, seed=1, resamples=3)
    assert scored.samples is not None
    assert scored.samples.shape == (4 * 3, len(scored.central))
    assert domain.fixed_fit(fit, found.best, None, seed=1, resamples=0).samples is None


def test_missing_areas_follow_the_hub_tags() -> None:
    tags = {
        "FrontierMath": ["Mathematics", "Agent"],
        "GPQA": ["Science"],
        "SWE": ["Software engineering", "Agent"],
        "Puzzles": ["Games"],
    }
    assert variants.missing_areas(["FrontierMath", "GPQA", "Puzzles"], tags) == ["Coding"]
    assert variants.missing_areas(["FrontierMath", "GPQA", "SWE"], tags) == []
    assert variants.missing_areas(["Puzzles", "Unknown"], tags) == [
        area for area, _ in settings.CORE_AREAS
    ]


def test_only_all_round_variants_get_ranks(synthetic_zip: Path, found: variants.Variants) -> None:
    fit = refit.fit(synthetic_zip, 8, workers=1)
    # Everything but Delta covers everything; Delta alone is the only coding benchmark.
    tags = {
        "Winogrande": ["Mathematics", "Agent", "World knowledge"],
        "Alpha": ["Mathematics", "Agent", "World knowledge"],
        "Beta": ["Mathematics", "Agent", "World knowledge"],
        "Gamma": ["Mathematics", "Agent", "World knowledge"],
        "Delta": ["Software engineering"],
    }
    scores = {m["version"]: m for m in variants.scores(fit, found, tags)}
    # Thin has four benchmarks but not Delta, so no coding: shown, not ranked.
    assert scores["thin"]["missing_areas"] == ["Coding"]
    assert scores["thin"]["rank_low"] is None and scores["thin"]["p_first"] is None
    assert scores["model-a"]["missing_areas"] == [] and scores["model-a"]["rank_low"] is not None
    unknown = variants.scores(fit, found, None)
    assert all(m["missing_areas"] is None for m in unknown)


# Benchmarks behind three variants' scores in the snapshot of 2026-10-29 (benchmark_data.zip
# a479b336) and the hub's tags for them that day.
HUB_TAGS = {
    "APEX-Agents": ["Agent"],
    "ARC-AGI": ["Conceptual reasoning"],
    "ARC-AGI-2": ["Conceptual reasoning"],
    "Balrog": ["Games", "Long context"],
    "Chess Puzzles": ["Games"],
    "DTBench": ["Conceptual reasoning"],
    "EBR-bench": ["Games", "Agent"],
    "FrontierCode": ["Software engineering", "Agent"],
    "FrontierMath-Tier-4-v2-Private": ["Mathematics", "Agent"],
    "FrontierMath-Tiers-1-3-v2-Private": ["Mathematics", "Agent"],
    "FrontierSWE": ["Software engineering", "Agent"],
    "Furniture Assembly": ["Multimodal", "Conceptual reasoning", "Agent"],
    "GPQA diamond": ["Science"],
    "LMCA": ["Conceptual reasoning"],
    "Mystery Game Puzzles": ["Games"],
    "OTIS Mock AIME 2024-2025": ["Mathematics"],
    "SimpleQA Verified": ["World knowledge"],
    "SpireClimb": ["Games", "Multimodal", "Agent"],
    "WeirdML": ["Software engineering"],
}
COUNTED = {
    "GPT-6.1 Terra (max)": [
        "EBR-bench", "Mystery Game Puzzles", "FrontierMath-Tier-4-v2-Private",
        "FrontierMath-Tiers-1-3-v2-Private", "OTIS Mock AIME 2024-2025", "Furniture Assembly",
        "GPQA diamond", "APEX-Agents", "SimpleQA Verified",
    ],
    "GPT-6 Astra (max)": [
        "Mystery Game Puzzles", "SpireClimb", "WeirdML", "SimpleQA Verified",
        "FrontierMath-Tier-4-v2-Private", "FrontierMath-Tiers-1-3-v2-Private", "EBR-bench",
        "Chess Puzzles", "OTIS Mock AIME 2024-2025", "Balrog", "GPQA diamond", "ARC-AGI",
        "FrontierSWE", "ARC-AGI-2", "FrontierCode", "Furniture Assembly",
    ],
    "GPT-6 Sol (max)": [
        "FrontierMath-Tier-4-v2-Private", "FrontierMath-Tiers-1-3-v2-Private", "EBR-bench",
        "SpireClimb", "DTBench", "OTIS Mock AIME 2024-2025", "FrontierCode",
        "Furniture Assembly", "GPQA diamond", "SimpleQA Verified", "Mystery Game Puzzles",
        "LMCA", "ARC-AGI", "Chess Puzzles", "ARC-AGI-2", "APEX-Agents",
    ],
}  # fmt: skip


def test_terra_is_not_all_round_today_but_astra_and_sol_are() -> None:
    def ranked(name: str) -> bool:
        counted = COUNTED[name]
        enough = len(counted) >= settings.RANK_MIN_BENCHMARKS
        return enough and not variants.missing_areas(counted, HUB_TAGS)

    assert variants.missing_areas(COUNTED["GPT-6.1 Terra (max)"], HUB_TAGS) == ["Coding"]
    assert not ranked("GPT-6.1 Terra (max)")
    assert ranked("GPT-6 Astra (max)") and ranked("GPT-6 Sol (max)")


def _input(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    """A variants' fit input (as `fit_input` returns it) from (version, benchmark, score)."""
    ids = {v: f"m{i}" for i, v in enumerate(dict.fromkeys(v for v, _, _ in rows))}
    return pd.DataFrame(
        [
            {"model_id": ids[v], "performance": p, "benchmark": b, "model": v}
            | {"model_version": v, "Model": v}
            for v, b, p in rows
        ]
    )


def _table(groups: dict[str, list[str]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"model_version": v, "model_group": g, "display_name": None}
            | {"date": pd.Timestamp("2026-01-01")}
            for g, versions in groups.items()
            for v in versions
        ]
    )


# GPT-6.1 Sol's versions in the snapshot of 2026-10-29: its coding results are under the
# medium and xhigh labels, which are never borrowed; its unknown one has only ProofBench.
SOL = {
    "gpt-6.1-sol_max": [
        "APEX-Agents", "ARC-AGI", "ARC-AGI-2", "Chess Puzzles", "DTBench", "EBR-bench",
        "FrontierMath-Tier-4-v2-Private", "FrontierMath-Tiers-1-3-v2-Private",
        "Furniture Assembly", "GPQA diamond", "LMCA", "Mystery Game Puzzles",
        "OTIS Mock AIME 2024-2025", "SimpleQA Verified", "SpireClimb",
    ],
    "gpt-6.1-sol_medium": ["ARC-AGI", "ARC-AGI-2", "FrontierCode"],
    "gpt-6.1-sol_xhigh": ["ARC-AGI", "ARC-AGI-2", "WeirdML v3"],
    "gpt-6.1-sol_unknown": ["ProofBench"],
}  # fmt: skip
SOL_TAGS = HUB_TAGS | {
    "ProofBench": ["Mathematics", "Agent"],
    "GSO-Bench": ["Software engineering"],
}


def _sol(unknown: list[str]) -> tuple[pd.DataFrame, dict[str, str]]:
    versions = SOL | {"gpt-6.1-sol_unknown": unknown}
    data = _input([(v, b, 0.5) for v, benches in versions.items() for b in benches])
    return variants.fold_unrecorded(data, _table({"GPT-6.1 Sol": list(versions)}), {})


def test_the_top_variant_borrows_unknown_thinking_results_and_counts_them_for_coverage() -> None:
    data, folded = _sol(SOL["gpt-6.1-sol_unknown"])
    assert folded == {"gpt-6.1-sol_unknown": "gpt-6.1-sol_max"}
    assert "gpt-6.1-sol_unknown" not in set(data["Model"])
    top = data[data["Model"] == "gpt-6.1-sol_max"]
    lent = top[top[variants.BORROWED].notna()]
    assert list(lent["benchmark"]) == ["ProofBench"]
    assert set(lent[variants.BORROWED]) == {"gpt-6.1-sol_unknown"}
    # Lower efforts keep only their own results.
    assert len(data[data["Model"] == "gpt-6.1-sol_xhigh"]) == 2 + 1
    # ProofBench isn't coding, so Sol (max) stays short of all-round today...
    assert variants.missing_areas(list(top["benchmark"]), SOL_TAGS) == ["Coding"]
    # ...and would be all-round if its unknown runs included a coding benchmark.
    data, _ = _sol(["ProofBench", "GSO-Bench"])
    top = data[data["Model"] == "gpt-6.1-sol_max"]
    assert variants.missing_areas(list(top["benchmark"]), SOL_TAGS) == []


def test_a_labelled_score_is_never_replaced_by_a_borrowed_one() -> None:
    data = _input(
        [
            ("m_max", "A", 0.2),
            ("m_max", "Old", 0.3),
            ("m_unknown", "A", 0.9),
            ("m_unknown", "New", 0.9),
            ("m_unknown", "B", 0.4),
            ("m_thinking", "B", 0.6),
        ]
    )
    table = _table({"M": ["m_max", "m_unknown", "m_thinking"]})
    out, folded = variants.fold_unrecorded(data, table, {"Old": "New"})
    assert folded == {"m_unknown": "m_max", "m_thinking": "m_max"}
    best = domain.best_scores(out)
    # Its own A stays; New replaces its own Old, so it isn't borrowed either; the better of
    # the two unknown runs fills B.
    assert best["m_max"].to_dict() == {"A": 0.2, "B": 0.6, "Old": 0.3}
    assert out.set_index("benchmark").at["B", variants.BORROWED] == "m_thinking"


@pytest.mark.parametrize(
    "versions",
    [
        ["k_unknown"],  # only an unknown version: it is the model's entry
        ["k_unknown", "k_32K"],  # a thinking budget ranks below unrecorded thinking
        ["k_thinking", "k"],  # so does a version without a setting
        ["k_prounknown", "k_max"],  # pro is a mode of its own, not an effort level
    ],
)
def test_an_unknown_variant_that_is_its_models_top_is_unchanged(versions: list[str]) -> None:
    data = _input([(v, b, 0.5) for v in versions for b in ("A", "B")])
    out, folded = variants.fold_unrecorded(data, _table({"K": versions}), {})
    assert folded == {}
    assert out.drop(columns=variants.BORROWED).equals(data)
    assert out[variants.BORROWED].isna().all()


def test_folded_versions_are_not_variants_and_borrowed_ones_are_counted(
    central: refit.Fit, found: variants.Variants
) -> None:
    assert found.folded == {"fold_unknown": "fold_max"}
    scores = {m["version"]: m for m in variants.scores(central, found, None)}
    assert "fold_unknown" not in scores
    assert "fold_unknown" not in found.best.index.get_level_values(0)
    assert scores["fold_max"]["borrowed"] == 1 and scores["fold_max"]["benchmarks"] == 5
    assert found.best[("fold_max", "Alpha")] == 0.5
    assert all(m["borrowed"] == 0 for v, m in scores.items() if v != "fold_max")
