"""Shapes of the published JSON (mirrored by `web/src/data.ts`)."""

from typing import Literal, TypedDict

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


class Snapshot(TypedDict):
    schema: int
    id: str
    input: InputInfo
    fit: FitInfo
    build: BuildInfo
    drift: DriftInfo
    models: list[ModelScore]


class SnapshotRef(TypedDict):
    id: str
    fetched_at: str
    sha256: str


class SiteData(TypedDict):
    latest: Snapshot
    snapshots: list[SnapshotRef]
    previous_eci: dict[str, float]
    first_seen: dict[str, str]
