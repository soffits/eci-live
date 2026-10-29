"""Versioned snapshots: one JSON file per distinct input zip."""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import cast

from eci_live import settings
from eci_live.schema import SiteData, Snapshot, SnapshotRef


def snapshot_id(fetched_at: str, sha256: str) -> str:
    """Sortable, filename- and tag-safe id, e.g. `2026-10-29T0329Z-b149788e`."""
    stamp = datetime.fromisoformat(fetched_at).strftime("%Y-%m-%dT%H%MZ")
    return f"{stamp}-{sha256[:8]}"


def slugs(names: list[str]) -> dict[str, str]:
    """URL- and file-safe ids for model versions, unique in the given order."""
    taken: set[str] = set()
    out: dict[str, str] = {}
    for name in names:
        base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "model"
        slug, n = base, 2
        while slug in taken:
            slug, n = f"{base}-{n}", n + 1
        taken.add(slug)
        out[name] = slug
    return out


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


def current(snapshots: list[Snapshot]) -> list[Snapshot]:
    """Snapshots of the current schema. Older ones scored model groups rather than variants,
    so their scores don't continue a variant's history."""
    return [s for s in snapshots if s["schema"] == settings.SCHEMA_VERSION]


def has_input(snapshots: list[Snapshot], sha256: str) -> bool:
    """Whether this input already has a snapshot of the current schema."""
    return any(s["input"]["sha256"] == sha256 for s in current(snapshots))


def site_data(snapshots: list[Snapshot]) -> SiteData:
    """The single JSON the web page reads: latest snapshot plus history context."""
    scored = current(snapshots)
    if not scored:
        raise ValueError("no snapshots of the current schema to publish")
    first_seen: dict[str, str] = {}
    for snap in scored:
        for model in snap["models"]:
            first_seen.setdefault(model["version"], snap["input"]["fetched_at"])
    previous = scored[-2]["models"] if len(scored) > 1 else []
    return SiteData(
        latest=scored[-1],
        snapshots=[
            SnapshotRef(
                id=s["id"], fetched_at=s["input"]["fetched_at"], sha256=s["input"]["sha256"]
            )
            for s in snapshots
        ],
        previous_eci={m["version"]: m["eci"] for m in previous},
        first_seen=first_seen,
        slugs=slugs([m["version"] for m in scored[-1]["models"]]),
    )
