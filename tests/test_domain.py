"""Domain ECIs: the solver, the presets from hub tags, and fit.json."""

from pathlib import Path

import numpy as np
import pytest
from eci import download_benchmark_data, load_benchmark_metadata

from eci_live import detail, domain, fitdata, hub, refit, settings, source, variants
from eci_live.schema import FitInfo, Snapshot

# Rows of Epoch's own published fit (benchmark_data.zip, epoch_capabilities_index/, 2026-10-29):
# a model's (0-1 score, edi, slope) on a preset's benchmarks, and the value epoch.ai/eci showed
# for it that day (integers, the page's precision).
EPOCH_PAGE = [
    (
        "Claude Opus 5.5",
        [
            (0.5464, 163.888379, 0.074234),
            (0.62331, 164.667475, 0.147668),
            (0.774, 164.948483, 0.202191),
            (0.553677, 167.615895, 0.158238),
        ],
        169,
    ),
    (
        "Claude Fable 5.1",
        [
            (0.5091, 163.888379, 0.074234),
            (0.562908, 164.667475, 0.147668),
            (0.8824, 159.222825, 0.206165),
            (0.733, 164.948483, 0.202191),
            (0.929, 145.633901, 0.080727),
            (0.483636, 167.615895, 0.158238),
        ],
        168,
    ),
    ("Mixtral 8x22B", [(0.075, 145.731714, 0.19806), (0.0317, 145.633901, 0.080727)], 104),
    (
        "GPT-6.1 Sol",
        [
            (1.0, 158.320044, 0.246309),
            (0.98615, 150.142452, 0.167806),
            (1.0, 137.163938, 0.224137),
            (0.99, 156.104122, 0.292357),
        ],
        178,
    ),
    ("Mistral 7B v0.3", [(0.03682, 127.999344, 0.196834), (0.00178, 137.163938, 0.224137)], 111),
]


@pytest.mark.parametrize(("name", "rows", "shown"), EPOCH_PAGE)
def test_solver_reproduces_epochs_page(
    name: str, rows: list[tuple[float, float, float]], shown: int
) -> None:
    perf, edi, slope = (np.array([list(c)]) for c in zip(*rows, strict=True))
    assert round(float(domain.capability(perf, edi, slope)[0])) == shown, name


def test_solver_recovers_a_noiseless_capability() -> None:
    edi = np.array([[100.0, 120.0, 140.0, 150.0]])
    slope = np.array([[0.1, 0.2, 0.15, 0.3]])
    perf = 1 / (1 + np.exp(-slope * (133.0 - edi)))
    assert domain.capability(perf, edi, slope)[0] == pytest.approx(133.0, abs=1e-6)


@pytest.fixture(scope="module")
def fit(synthetic_zip: Path) -> refit.Fit:
    return refit.fit(synthetic_zip, 20, workers=1)


@pytest.fixture(scope="module")
def found(synthetic_zip: Path) -> variants.Variants:
    return variants.load(synthetic_zip)


def test_every_benchmark_reproduces_the_group_point_estimates(fit: refit.Fit) -> None:
    every = list(fit.edi["benchmark"])
    central = refit.Fit(fit.data, fit.eci, fit.edi, None, [])
    general = fit.eci.set_index("Model")["eci"]
    best = domain.best_scores(fit.data)
    for score in domain.scores(central, best, every, seed=0, resamples=1):
        assert score["eci"] == pytest.approx(general[score["version"]], abs=0.5)
        assert score["ci_low"] is None


def test_domain_scores_are_per_variant_with_intervals_and_counts(
    fit: refit.Fit, found: variants.Variants
) -> None:
    chosen = ["Alpha", "Gamma", "Delta"]
    seed = domain.seed_for(1)
    scores = domain.scores(fit, found.best, chosen, seed, resamples=3)
    assert scores == domain.scores(fit, found.best, chosen, seed, resamples=3)
    assert [s["eci"] for s in scores] == sorted((s["eci"] for s in scores), reverse=True)
    for s in scores:
        assert s["ci_low"] is not None and s["ci_high"] is not None
        assert s["ci_low"] <= s["eci"] + 1e-6 and s["eci"] <= s["ci_high"] + 1e-6
        assert 1 <= s["benchmarks"] <= 3
    counts = {s["version"]: s["benchmarks"] for s in scores}
    assert counts["thin"] == 2 and counts["twin-mini"] == 1


def test_no_benchmarks_means_no_domain_scores(fit: refit.Fit, found: variants.Variants) -> None:
    assert domain.scores(fit, found.best, [], seed=0, resamples=1) == []


def test_seeds_follow_the_chunk_seeds() -> None:
    chunks = refit.chunk_seeds(settings.BOOTSTRAP_SEED, settings.BOOTSTRAP_CHUNKS)
    seeds = [domain.seed_for(i) for i in range(3)]
    assert len(set(seeds)) == 3 and not set(seeds) & set(chunks)


REGISTRY = b"""
var e={eci:{added_date:`2026-03-23`,id:`eci`,title:`ECI`,slug:`eci`,non_percentage_score:!0},
"alpha":{id:`Alpha`,title:`Alpha bench`,slug:`alpha`,domains:[`Software engineering`,`Agent`]},
gamma:{id:`gamma_board`,title:`Gamma Board`,slug:`gamma`,domains:["Mathematics"]},
old:{id:`Delta`,title:`Delta (v1, old)`,slug:`delta-v1`,hidden:!0,domains:[`Mathematics`]},
horizon:{id:`beta`,title:`Beta`,slug:`beta`,domains:[`Software engineering`],
non_percentage_score:!0},
other:{id:`x`,title:`Not ${1}`,slug:`x`}};export{e as t};
"""


def test_registry_is_read_without_running_it() -> None:
    entries = {e.id: e for e in hub.registry_entries(REGISTRY)}
    assert entries["Alpha"].domains == ("Software engineering", "Agent")
    assert entries["gamma_board"].domains == ("Mathematics",)
    assert entries["Delta"].hidden and not entries["eci"].percentage
    assert not entries["beta"].percentage
    assert "x" not in entries  # a template with a substitution isn't a literal title


def test_presets_follow_epochs_rule(synthetic_zip: Path) -> None:
    metadata = load_benchmark_metadata(download_benchmark_data(synthetic_zip))
    metadata.loc[metadata["benchmark"] == "Gamma", "source_file"] = "gamma_board_external.csv"
    tagged = hub.match(
        hub.registry_entries(REGISTRY), ["Alpha", "Beta", "Gamma", "Delta", "Winogrande"], metadata
    )
    by_name = {b["benchmark"]: b for b in tagged}
    assert by_name["Gamma"]["hub_id"] == "gamma_board"  # matched by its source file
    assert by_name["Winogrande"]["hub_id"] is None
    assert hub.in_domain(tagged, "Software engineering") == ["Alpha"]  # Beta isn't a percentage
    assert hub.in_domain(tagged, "Mathematics") == ["Gamma"]  # Delta is hidden on the hub


def test_fit_json_has_the_variant_input_and_model_facts(
    synthetic_zip: Path, fit: refit.Fit, found: variants.Variants
) -> None:
    models = variants.scores(fit, found)
    snap = Snapshot(
        schema=settings.SCHEMA_VERSION,
        id="s",
        input=source.local(synthetic_zip),
        fit=FitInfo(
            eci_public_commit="x",
            bootstrap_samples=0,
            bootstrap_seed=0,
            bootstrap_chunks=0,
            ci_level=0.9,
            resamples_per_draw=1,
            rank_min_benchmarks=4,
        ),
        build={"commit": None, "run_url": None},
        models=models,
        groups=refit.group_scores(fit),
    )
    details = detail.build(synthetic_zip, [snap], fit, found)
    data = fitdata.build(fit, found, snap, details)
    names = [m["version"] for m in data["models"]]
    assert names == [m["version"] for m in models]
    assert len(data["results"]) == len(found.best)
    model_a = data["models"][names.index("model-a")]
    assert model_a["training_compute_flop"] == 1e25 and model_a["country"] == "Nowhere"
    bench = [b["name"] for b in data["benchmarks"]]
    m, b, v = data["results"][0]
    assert 0 <= v <= 1 and names[m] in details and bench[b] in set(fit.edi["benchmark"])
    assert fitdata.dump(data).endswith("\n")
