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
    # Seeded chunks the bootstrap ran in (seeds derived from bootstrap_seed). Snapshots
    # from before chunking ran it as one serial chain and have no such field.
    bootstrap_chunks: NotRequired[int]
    ci_level: float


class BuildInfo(TypedDict):
    commit: str | None
    run_url: str | None


class DriftInfo(TypedDict):
    shared_models: int
    max_abs: float
    mean_abs: float
    tolerance: float


class ModelScore(TypedDict):
    name: str
    lab: str
    release_date: str | None
    eci: float
    ci_low: float | None
    ci_high: float | None
    benchmarks: int
    rank_low: int | None
    rank_high: int | None
    p_first: float | None
    weights: Weights
    accessibility: str | None
    official_eci: float | None


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
    name: str
    eci: float
    ci_low: float | None
    ci_high: float | None
    benchmarks: int


class Preset(TypedDict):
    id: str
    label: str
    domain: str
    benchmarks: list[str]
    # Every model with at least one of the benchmarks; the page applies "min. benchmarks".
    scores: list[DomainScore]


class Domains(TypedDict):
    hub_page: str
    hub_module: InputInfo
    resamples_per_draw: int
    seed: int
    benchmarks: list[DomainBenchmark]
    presets: list[Preset]


class CyberModel(TypedDict):
    name: str
    # The model's name in the general ECI, or None if Epoch scores it for cyber only.
    general_name: str | None
    lab: str
    release_date: str | None
    accessibility: str | None
    weights: Weights
    country: str | None
    eci: float
    ci_low: float | None
    ci_high: float | None
    benchmarks: int


class Cyber(TypedDict):
    """Epoch's own published Cyber ECI, shown as Epoch's numbers (not refit here)."""

    scores: InputInfo
    results: InputInfo
    benchmarks: list[str]
    models: list[CyberModel]


class Snapshot(TypedDict):
    schema: int
    id: str
    input: InputInfo
    fit: FitInfo
    build: BuildInfo
    drift: DriftInfo
    models: list[ModelScore]
    # Absent on snapshots from before domain ECIs, or when the hub couldn't be read.
    domains: NotRequired[Domains]
    cyber: NotRequired[Cyber]


class SnapshotRef(TypedDict):
    id: str
    fetched_at: str
    sha256: str


class SiteData(TypedDict):
    latest: Snapshot
    snapshots: list[SnapshotRef]
    previous_eci: dict[str, float]
    first_seen: dict[str, str]
    # Model name -> file name stem of its detail page data (`models/<slug>.json`).
    slugs: dict[str, str]


# Detail pages: one file per model, rewritten from the latest snapshot on every run.


class ModelVersion(TypedDict):
    version: str
    display_name: str | None
    release_date: str | None


class BenchmarkResult(TypedDict):
    """One row of the zip: a model version's score on a benchmark."""

    # Epoch's record id, or `<file>#<row>` for files without one.
    id: str
    benchmark: str
    version: str
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


class FitTerm(TypedDict):
    """One benchmark in this model's fit: its fitted parameters and the scores."""

    benchmark: str
    edi: float
    slope: float
    actual: float
    predicted: float


class HistoryPoint(TypedDict):
    snapshot: str
    fetched_at: str
    eci: float
    ci_low: float | None
    ci_high: float | None


class ModelDetail(TypedDict):
    name: str
    snapshot: str
    organization: str | None
    country: str | None
    training_compute_flop: float | None
    versions: list[ModelVersion]
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
    name: str
    country: str | None
    training_compute_flop: float | None


class FitData(TypedDict):
    snapshot: str
    benchmarks: list[FitBenchmark]
    models: list[FitModel]
    # The fit's input: [model index, benchmark index, 0-1 score], best result per pair.
    results: list[tuple[int, int, float]]
