"""Where a snapshot came from: pinned fitting code, repository commit, CI run."""

import json
import os
import subprocess
from importlib.metadata import distribution
from pathlib import Path

from eci_live import settings
from eci_live.schema import BuildInfo


def eci_public_commit() -> str:
    """The exact eci-public commit installed, from its PEP 610 install record."""
    record = distribution("eci").read_text("direct_url.json")
    if record is None:
        raise RuntimeError("eci is not installed from a pinned git commit")
    return str(json.loads(record)["vcs_info"]["commit_id"])


def _github(name: str) -> str | None:
    return os.environ.get(f"GITHUB_{name}") or None


def build_info() -> BuildInfo:
    server, repo, run = _github("SERVER_URL"), _github("REPOSITORY"), _github("RUN_ID")
    commit = _github("SHA")
    if commit is None:
        git = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True)
        commit = git.stdout.strip() or None
    run_url = f"{server}/{repo}/actions/runs/{run}" if server and repo and run else None
    return BuildInfo(commit=commit, run_url=run_url)


def archive_url(snapshot_id: str, asset: str = settings.ARCHIVE_ASSET) -> str | None:
    """Release asset the CI run attaches an input to (None outside CI)."""
    server, repo = _github("SERVER_URL"), _github("REPOSITORY")
    if not (server and repo):
        return None
    return f"{server}/{repo}/releases/download/snapshot-{snapshot_id}/{asset}"


def write_output(name: str, value: str) -> None:
    """Expose a step output when running in GitHub Actions."""
    if path := _github("OUTPUT"):
        with Path(path).open("a") as f:
            f.write(f"{name}={value}\n")


def write_summary(markdown: str) -> None:
    if path := _github("STEP_SUMMARY"):
        with Path(path).open("a") as f:
            f.write(markdown + "\n")
