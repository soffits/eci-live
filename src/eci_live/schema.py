"""Shapes of the published JSON (mirrored by `web/src/data.ts`)."""

from typing import Literal, NotRequired, TypedDict

Weights = Literal["open", "closed", "unknown"]


class InputInfo(TypedDict):
    url: str
    sha256: str
    fetched_at: str
    last_modified: str | None
    archive_url: str | None


class FitInfo(TypedDict):
    eci_public_commit: str
    bootstrap_samples: int
    bootstrap_seed: int
    # Seeded chunks the bootstrap ran in (seeds derived from bootstrap_seed).
    bootstrap_chunks: int
    ci_level: float
    # Variant intervals: this many resamples of a variant's own results per bootstrap draw.
    resamples_per_draw: int
    # Rank intervals and the chance of #1 are over variants with at least this many
    # benchmarks (eci-public's own minimum for a model to enter the fit).
    rank_min_benchmarks: int


class BuildInfo(TypedDict):
    commit: str | None
    run_url: str | None


class ModelScore(TypedDict):
    """One model variant: an Epoch `model_version` (a reasoning setting, provider or mode of
    a model), scored on its own results with the group-level fit's benchmark parameters."""

    version: str
    name: str
    # Epoch's model group, the entry eci-public fits; its variants are siblings.
    group: str
    # The reasoning setting as written in the version id ("max", "16k thinking", "pro, max"),
    # or None where the id doesn't say.
    effort: str | None
    # Higher is more reasoning effort: none 0, not recorded 1, minimal 2, low 3, a thinking
    # budget 10 + thousands of tokens, thinking at an unrecorded level 999, medium 1000,
    # high 1001, xhigh 1002, max 1003.
    effort_rank: int
    # Pro mode (parallel sampling) of the model, rather than a reasoning-effort level.
    pro: bool
    lab: str
    release_date: str | None
    eci: float
    ci_low: float | None
    ci_high: float | None
    benchmarks: int
    # How many of `benchmarks` are borrowed: results of the model's unrecorded-thinking
    # versions on benchmarks this, its top variant, has no result of its own.
    borrowed: int
    rank_low: int | None
    rank_high: int | None
    p_first: float | None
    weights: Weights
    accessibility: str | None
    # Core areas (Snapshot.core_areas) its benchmarks don't cover; empty for an all-round
    # variant, None when the hub's tags couldn't be read.
    missing_areas: list[str] | None


class CoreArea(TypedDict):
    """An area the General (all-round) index needs covered, as hub domain tags."""

    name: str
    domains: list[str]


class GroupScore(TypedDict):
    """A model group in the group-level fit, which sets the scale and benchmark parameters."""

    name: str
    eci: float
    ci_low: float | None
    ci_high: float | None
    benchmarks: int


class DomainBenchmark(TypedDict):
    """An index benchmark and the domain tags Epoch's benchmark hub gives it."""

    benchmark: str
    # The hub registry entry it was matched to, or None when the hub doesn't list it.
    hub_id: str | None
    domains: list[str]
    # Epoch's hub leaves benchmarks without a 0-100% score (time horizons, ratings) out
    # of its domain presets.
    percentage: bool
    # False for entries the hub hides (retired versions); also left out of the presets.
    listed: bool


class DomainScore(TypedDict):
    version: str
    eci: float
    ci_low: float | None
    ci_high: float | None
    benchmarks: int


class Preset(TypedDict):
    id: str
    label: str
    domain: str
    benchmarks: list[str]
    # Every variant with at least one of the benchmarks; the page applies "min. benchmarks".
    scores: list[DomainScore]


class Domains(TypedDict):
    hub_page: str
    hub_module: InputInfo
    resamples_per_draw: int
    seed: int
    benchmarks: list[DomainBenchmark]
    presets: list[Preset]


class Snapshot(TypedDict):
    schema: int
    id: str
    input: InputInfo
    fit: FitInfo
    build: BuildInfo
    # Variants, best first.
    models: list[ModelScore]
    groups: list[GroupScore]
    core_areas: list[CoreArea]
    # Absent when the hub couldn't be read.
    domains: NotRequired[Domains]
    # Unrecorded-thinking version -> the top variant its results were folded into; folded
    # versions aren't variants of their own.
    folded: dict[str, str]


class SnapshotRef(TypedDict):
    id: str
    fetched_at: str
    sha256: str


class SiteData(TypedDict):
    latest: Snapshot
    snapshots: list[SnapshotRef]
    # Keyed by model version, over snapshots of the current schema only (older ones scored
    # model groups, not variants).
    previous_eci: dict[str, float]
    first_seen: dict[str, str]
    # Model version -> file name stem of its detail page data (`models/<slug>.json`).
    slugs: dict[str, str]
    # Slug a folded version's page had -> the slug of the variant it was folded into.
    redirects: dict[str, str]


# Detail pages: one file per variant, rewritten from the latest snapshot on every run.


class BenchmarkResult(TypedDict):
    """One row of the zip: a model version's score on a benchmark."""

    # Epoch's record id, or `<file>#<row>` for files without one.
    id: str
    benchmark: str
    score: float
    score_column: str
    stderr: float | None
    log_url: str | None
    source: str | None
    source_url: str | None
    run_at: str | None
    # The 0-1 score the fit sees (baseline -> 0, ceiling -> 1), for index benchmarks.
    normalized: float | None
    used: bool
    # Why a result didn't enter the fit, in plain words (None when used).
    reason: str | None
    # The unrecorded-thinking version that ran it, when it isn't this variant's own result.
    borrowed_from: str | None


class FitTerm(TypedDict):
    """One benchmark in this model's fit: its fitted parameters and the scores."""

    benchmark: str
    edi: float
    slope: float
    actual: float
    predicted: float
    # The unrecorded-thinking version the score was borrowed from, if any.
    borrowed_from: str | None


class HistoryPoint(TypedDict):
    snapshot: str
    fetched_at: str
    eci: float
    ci_low: float | None
    ci_high: float | None


class ModelDetail(TypedDict):
    version: str
    name: str
    snapshot: str
    organization: str | None
    country: str | None
    training_compute_flop: float | None
    history: list[HistoryPoint]
    fit: list[FitTerm]
    results: list[BenchmarkResult]


# `fit.json`: what the views beyond the leaderboard need, rewritten from the latest
# snapshot's central fit on every run.


class FitBenchmark(TypedDict):
    name: str
    edi: float
    slope: float
    domains: list[str]


class FitModel(TypedDict):
    version: str
    country: str | None
    training_compute_flop: float | None


class FitData(TypedDict):
    snapshot: str
    benchmarks: list[FitBenchmark]
    models: list[FitModel]
    # Each variant's input: [model index, benchmark index, 0-1 score], best result per pair.
    results: list[tuple[int, int, float]]
