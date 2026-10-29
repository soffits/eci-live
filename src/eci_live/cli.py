"""Entry point: `eci-live` runs the whole pipeline, locally and in CI alike."""

import argparse
import sys
from pathlib import Path

from eci_live import detail, history, provenance, refit, settings, source
from eci_live.drift import DriftError, check_drift
from eci_live.schema import FitInfo, InputInfo, Snapshot


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="eci-live",
        description="Refit ECI from Epoch's benchmark zip, record a snapshot, write the site JSON.",
    )
    parser.add_argument(
        "--history",
        type=Path,
        default=Path("history"),
        help="snapshot store (a checkout of the data branch)",
    )
    parser.add_argument("--site-json", type=Path, default=Path("web/public/eci.json"))
    parser.add_argument(
        "--details-dir",
        type=Path,
        default=Path("web/public/models"),
        help="where the per-model detail JSON files are written",
    )
    parser.add_argument(
        "--work-dir", type=Path, default=Path("build"), help="where the downloaded zip is kept"
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="use this local zip instead of downloading (to reproduce a snapshot)",
    )
    parser.add_argument("--bootstrap-samples", type=int, default=settings.BOOTSTRAP_SAMPLES)
    return parser.parse_args(argv)


def _new_snapshot(zip_path: Path, info: InputInfo, bootstrap_samples: int) -> Snapshot:
    fit = refit.fit_scores(zip_path, bootstrap_samples)
    official = refit.official_scores(zip_path)
    models = refit.model_scores(fit, official, refit.version_metadata(zip_path))
    drift = check_drift(models, set(official.index), settings.DRIFT_TOLERANCE)
    snap_id = history.snapshot_id(info["fetched_at"], info["sha256"])
    return Snapshot(
        schema=settings.SCHEMA_VERSION,
        id=snap_id,
        input={**info, "archive_url": provenance.archive_url(snap_id)},
        fit=FitInfo(
            eci_public_commit=provenance.eci_public_commit(),
            bootstrap_samples=bootstrap_samples,
            bootstrap_seed=settings.BOOTSTRAP_SEED,
            ci_level=settings.CI_LEVEL,
        ),
        build=provenance.build_info(),
        drift=drift,
        models=models,
    )


def _summary(snap: Snapshot) -> str:
    unpublished = [m["name"] for m in snap["models"] if m["official_eci"] is None]
    drift = snap["drift"]
    return "\n".join(
        [
            f"### ECI snapshot `{snap['id']}`",
            f"- input SHA-256 `{snap['input']['sha256']}`",
            f"- {len(snap['models'])} models; {drift['shared_models']} shared with Epoch, "
            f"max drift {drift['max_abs']} (tolerance {drift['tolerance']})",
            f"- not yet on Epoch: {', '.join(unpublished) or 'none'}",
        ]
    )


def _latest_input(zip_path: Path, sha256: str, latest: Snapshot, work_dir: Path) -> Path:
    """The latest snapshot's own input zip: today's download if it is that file, else
    the copy archived with the snapshot."""
    if sha256 == latest["input"]["sha256"]:
        return zip_path
    url = latest["input"]["archive_url"]
    if url is None:
        raise RuntimeError(f"no archived input for snapshot {latest['id']}")
    archived = work_dir / f"{latest['id']}.zip"
    info = source.download(url, archived)
    if info["sha256"] != latest["input"]["sha256"]:
        raise RuntimeError(f"archived input for {latest['id']} has the wrong hash")
    return archived


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    if args.input:
        zip_path, info = args.input, source.local(args.input)
    else:
        zip_path = args.work_dir / settings.ARCHIVE_ASSET
        info = source.download(settings.ZIP_URL, zip_path)
    print(f"input {info['sha256']} ({info['url']})")

    snapshots = history.load(args.history)
    if any(s["input"]["sha256"] == info["sha256"] for s in snapshots):
        print("input unchanged since an earlier snapshot; nothing new to record")
    else:
        try:
            snap = _new_snapshot(zip_path, info, args.bootstrap_samples)
        except DriftError as error:
            print(f"::error title=Refit drifted from Epoch's scores::{error}", file=sys.stderr)
            return 1
        print(f"wrote {history.save(args.history, snap)}")
        print(_summary(snap))
        provenance.write_output("snapshot", snap["id"])
        provenance.write_summary(_summary(snap))
        snapshots.append(snap)

    site = history.site_data(snapshots)
    args.site_json.parent.mkdir(parents=True, exist_ok=True)
    args.site_json.write_text(history.dump(site))
    print(f"wrote {args.site_json}")

    latest_zip = _latest_input(zip_path, info["sha256"], snapshots[-1], args.work_dir)
    try:
        details = detail.build(latest_zip, snapshots)
    except detail.ReproduceError as error:
        print(
            f"::error title=Detail refit does not reproduce the snapshot::{error}", file=sys.stderr
        )
        return 1
    count = detail.write(details, site["slugs"], args.details_dir)
    print(f"wrote {count} model pages to {args.details_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
