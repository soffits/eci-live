"""Obtain the input zip and describe exactly what was used.

Epoch's zip is the only data source for now. Another source would add its own
fetcher here and hand its rows to `eci.prepare_benchmark_data(extra_scores=...)`.
"""

import hashlib
import shutil
from datetime import UTC, datetime
from pathlib import Path
from urllib.request import urlopen

from eci_live.schema import InputInfo


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def download(url: str, dest: Path) -> InputInfo:
    """Download `url` to `dest` and record its hash and download time."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    fetched_at = _now()
    with urlopen(url, timeout=120) as response, dest.open("wb") as out:
        last_modified = response.headers.get("Last-Modified")
        shutil.copyfileobj(response, out)
    return InputInfo(
        url=url,
        sha256=sha256_of(dest),
        fetched_at=fetched_at,
        last_modified=last_modified,
        archive_url=None,
    )


def local(path: Path) -> InputInfo:
    """Describe a zip already on disk (used to reproduce an archived snapshot)."""
    return InputInfo(
        url=path.resolve().as_uri(),
        sha256=sha256_of(path),
        fetched_at=_now(),
        last_modified=None,
        archive_url=None,
    )
