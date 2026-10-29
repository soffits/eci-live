"""Versioned snapshots: one JSON file per distinct input zip."""

import json
from datetime import datetime
from pathlib import Path
from typing import cast

from eci_live import settings
from eci_live.schema import SiteData, Snapshot, SnapshotRef


def snapshot_id(fetched_at: str, sha256: str) -> str:
    """Sortable, filename- and tag-safe id, e.g. `2026-10-29T0329Z-b149788e`."""
    stamp = datetime.fromisoformat(fetched_at).strftime("%Y-%m-%dT%H%MZ")
    return f"{stamp}-{sha256[:8]}"


def _dir(history: Path) -> Path:
    return history / settings.SNAPSHOT_DIR


def load(history: Path) -> list[Snapshot]:
    """All snapshots, oldest first."""
    files = sorted(_dir(history).glob("*.json"))
    return [cast(Snapshot, json.loads(f.read_text())) for f in files]


def save(history: Path, snapshot: Snapshot) -> Path:
    path = _dir(history) / f"{snapshot['id']}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dump(snapshot))
    return path


def dump(data: Snapshot | SiteData) -> str:
    return json.dumps(data, indent=1, ensure_ascii=False, allow_nan=False) + "\n"


def site_data(snapshots: list[Snapshot]) -> SiteData:
    """The single JSON the web page reads: latest snapshot plus history context."""
    if not snapshots:
        raise ValueError("no snapshots to publish")
    first_seen: dict[str, str] = {}
    for snap in snapshots:
        for model in snap["models"]:
            first_seen.setdefault(model["name"], snap["input"]["fetched_at"])
    previous = snapshots[-2]["models"] if len(snapshots) > 1 else []
    return SiteData(
        latest=snapshots[-1],
        snapshots=[
            SnapshotRef(
                id=s["id"], fetched_at=s["input"]["fetched_at"], sha256=s["input"]["sha256"]
            )
            for s in snapshots
        ],
        previous_eci={m["name"]: m["eci"] for m in previous},
        first_seen=first_seen,
    )
