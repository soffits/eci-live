"""Guard against publishing a refit that disagrees with Epoch's own scores."""

from eci_live.schema import DriftInfo, ModelScore


class DriftError(RuntimeError):
    pass


def check_drift(models: list[ModelScore], official_names: set[str], tolerance: float) -> DriftInfo:
    """Compare refit and official ECI for every model on both lists.

    Raises `DriftError` if a published model is missing from the refit or any
    shared model moved by more than `tolerance` ECI points.
    """
    missing = official_names - {m["name"] for m in models}
    diffs = {
        m["name"]: abs(m["eci"] - m["official_eci"])
        for m in models
        if m["official_eci"] is not None
    }
    too_far = {name: d for name, d in diffs.items() if d > tolerance}
    problems = []
    if missing:
        problems.append(f"{len(missing)} published models missing from refit: {sorted(missing)}")
    if too_far:
        listed = ", ".join(
            f"{n} ({d:.2f})" for n, d in sorted(too_far.items(), key=lambda x: -x[1])
        )
        problems.append(f"{len(too_far)} models drift beyond {tolerance} ECI: {listed}")
    if not diffs:
        problems.append("no models in common with Epoch's published scores")
    if problems:
        raise DriftError("; ".join(problems))
    return DriftInfo(
        shared_models=len(diffs),
        max_abs=round(max(diffs.values()), 3),
        mean_abs=round(sum(diffs.values()) / len(diffs), 3),
        tolerance=tolerance,
    )
