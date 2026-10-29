"""Entry point: `eci-live` runs the whole pipeline, locally and in CI alike."""

import argparse
import sys
from pathlib import Path
from urllib.error import URLError

from eci import download_benchmark_data, load_benchmark_metadata

from eci_live import (
    cyber,
    detail,
    domain,
    fitdata,
    history,
    hub,
    provenance,
    refit,
    settings,
    source,
)
from eci_live.drift import DriftError, check_drift
from eci_live.schema import Cyber, Domains, FitInfo, InputInfo, Preset, Snapshot


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
        "--fit-json",
        type=Path,
        default=Path("web/public/fit.json"),
        help="where the benchmark parameters and fit input for the explore views are written",
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


def _warn(title: str, error: Exception) -> None:
    print(f"::warning title={title}::{error}", file=sys.stderr)


def _domains(result: refit.Fit, zip_path: Path, snap_id: str, work_dir: Path) -> Domains | None:
    """Software engineering and Math ECIs from the hub's domain tags; None (with a warning)
    if the hub can't be read, so the general index still publishes."""
    try:
        module, entries = hub.fetch(settings.HUB_PAGE_URL, work_dir / settings.HUB_ASSET)
    except (hub.HubError, URLError, OSError) as error:
        _warn("Domain tags unavailable; publishing without domain ECIs", error)
        return None
    module["archive_url"] = provenance.archive_url(snap_id, settings.HUB_ASSET)
    metadata = load_benchmark_metadata(download_benchmark_data(zip_path))
    tagged = hub.match(entries, list(result.edi["benchmark"]), metadata)
    presets = []
    for i, (preset_id, label, tag) in enumerate(settings.DOMAIN_PRESETS):
        chosen = hub.in_domain(tagged, tag)
        presets.append(
            Preset(
                id=preset_id,
                label=label,
                domain=tag,
                benchmarks=chosen,
                scores=domain.scores(
                    result, chosen, domain.domain_seed(i), settings.DOMAIN_RESAMPLES
                ),
            )
        )
    return Domains(
        hub_page=settings.HUB_PAGE_URL,
        hub_module=module,
        resamples_per_draw=settings.DOMAIN_RESAMPLES,
        seed=settings.BOOTSTRAP_SEED,
        benchmarks=tagged,
        presets=presets,
    )


def _cyber(snap_id: str, work_dir: Path) -> Cyber | None:
    try:
        published = cyber.fetch(work_dir)
    except (URLError, OSError, KeyError, ValueError) as error:
        _warn("Epoch's Cyber ECI unavailable; publishing without it", error)
        return None
    published["scores"]["archive_url"] = provenance.archive_url(
        snap_id, settings.CYBER_SCORES_ASSET
    )
    published["results"]["archive_url"] = provenance.archive_url(
        snap_id, settings.CYBER_RESULTS_ASSET
    )
    return published


def _new_snapshot(
    zip_path: Path, info: InputInfo, bootstrap_samples: int, work_dir: Path
) -> tuple[Snapshot, refit.Fit]:
    result = refit.fit(zip_path, bootstrap_samples)
    official = refit.official_scores(zip_path)
    models = refit.model_scores(
        refit.fit_scores(result), official, refit.version_metadata(zip_path)
    )
    drift = check_drift(models, set(official.index), settings.DRIFT_TOLERANCE)
    snap_id = history.snapshot_id(info["fetched_at"], info["sha256"])
    snapshot = Snapshot(
        schema=settings.SCHEMA_VERSION,
        id=snap_id,
        input={**info, "archive_url": provenance.archive_url(snap_id)},
        fit=FitInfo(
            eci_public_commit=provenance.eci_public_commit(),
            bootstrap_samples=bootstrap_samples,
            bootstrap_seed=settings.BOOTSTRAP_SEED,
            bootstrap_chunks=len(refit.chunk_sizes(bootstrap_samples, settings.BOOTSTRAP_CHUNKS)),
            ci_level=settings.CI_LEVEL,
        ),
        build=provenance.build_info(),
        drift=drift,
        models=models,
    )
    if (domains := _domains(result, zip_path, snap_id, work_dir)) is not None:
        snapshot["domains"] = domains
    if (published := _cyber(snap_id, work_dir)) is not None:
        snapshot["cyber"] = published
    return snapshot, result


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
            *[
                f"- {p['label']}: {len(p['benchmarks'])} benchmarks, {len(p['scores'])} models"
                for p in snap.get("domains", {}).get("presets", [])
            ],
            f"- Epoch's Cyber ECI: {len(snap['cyber']['models'])} models"
            if "cyber" in snap
            else "- Epoch's Cyber ECI: unavailable",
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
    fitted: refit.Fit | None = None
    if any(s["input"]["sha256"] == info["sha256"] for s in snapshots):
        print("input unchanged since an earlier snapshot; nothing new to record")
    else:
        try:
            snap, fitted = _new_snapshot(zip_path, info, args.bootstrap_samples, args.work_dir)
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
        # The fit runs once per job: a new snapshot's fit is reused; otherwise only the
        # deterministic central fit runs, to rebuild the latest snapshot's details.
        result = fitted if fitted is not None and latest_zip == zip_path else None
        result = result or refit.fit(latest_zip, bootstrap_samples=0)
        details = detail.build(latest_zip, snapshots, result)
    except detail.ReproduceError as error:
        print(
            f"::error title=Detail refit does not reproduce the snapshot::{error}", file=sys.stderr
        )
        return 1
    count = detail.write(details, site["slugs"], args.details_dir)
    print(f"wrote {count} model pages to {args.details_dir}")
    args.fit_json.write_text(fitdata.dump(fitdata.build(result, snapshots[-1], details)))
    print(f"wrote {args.fit_json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
