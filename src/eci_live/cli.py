"""Entry point: `eci-live` runs the whole pipeline, locally and in CI alike."""

import argparse
import sys
from pathlib import Path
from urllib.error import URLError

from eci import download_benchmark_data, load_benchmark_metadata

from eci_live import (
    detail,
    domain,
    fitdata,
    history,
    hub,
    provenance,
    refit,
    settings,
    source,
    variants,
)
from eci_live.schema import (
    CoreArea,
    DomainBenchmark,
    Domains,
    FitInfo,
    InputInfo,
    Preset,
    Snapshot,
)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="eci-live",
        description="Score every model variant from Epoch AI's benchmark zip, record a snapshot, "
        "write the site JSON.",
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


def _hub(
    result: refit.Fit, zip_path: Path, snap_id: str, work_dir: Path
) -> tuple[InputInfo, list[DomainBenchmark]] | None:
    """The hub's domain tags for the index benchmarks; None (with a warning) if the hub
    can't be read, so the index still publishes (without domains or coverage)."""
    try:
        module, entries = hub.fetch(settings.HUB_PAGE_URL, work_dir / settings.HUB_ASSET)
    except (hub.HubError, URLError, OSError) as error:
        _warn("Domain tags unavailable; publishing without domain ECIs or coverage", error)
        return None
    module["archive_url"] = provenance.archive_url(snap_id, settings.HUB_ASSET)
    metadata = load_benchmark_metadata(download_benchmark_data(zip_path))
    return module, hub.match(entries, list(result.edi["benchmark"]), metadata)


def _domains(
    result: refit.Fit,
    found: variants.Variants,
    module: InputInfo,
    tagged: list[DomainBenchmark],
) -> Domains:
    """Software engineering and Math ECIs per variant from the hub's domain tags."""
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
                    result, found.best, chosen, domain.seed_for(i + 1), settings.RESAMPLES_PER_DRAW
                ),
            )
        )
    return Domains(
        hub_page=settings.HUB_PAGE_URL,
        hub_module=module,
        resamples_per_draw=settings.RESAMPLES_PER_DRAW,
        seed=settings.BOOTSTRAP_SEED,
        benchmarks=tagged,
        presets=presets,
    )


def _new_snapshot(
    zip_path: Path, info: InputInfo, bootstrap_samples: int, work_dir: Path
) -> tuple[Snapshot, refit.Fit, variants.Variants]:
    result = refit.fit(zip_path, bootstrap_samples)
    found = variants.load(zip_path)
    snap_id = history.snapshot_id(info["fetched_at"], info["sha256"])
    hub_tags = _hub(result, zip_path, snap_id, work_dir)
    tags = None if hub_tags is None else {b["benchmark"]: b["domains"] for b in hub_tags[1]}
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
            resamples_per_draw=settings.RESAMPLES_PER_DRAW,
            rank_min_benchmarks=settings.RANK_MIN_BENCHMARKS,
        ),
        build=provenance.build_info(),
        models=variants.scores(result, found, tags),
        groups=refit.group_scores(result),
        core_areas=[CoreArea(name=n, domains=list(d)) for n, d in settings.CORE_AREAS],
        folded=found.folded,
    )
    if hub_tags is not None:
        snapshot["domains"] = _domains(result, found, *hub_tags)
    return snapshot, result, found


def _summary(snap: Snapshot) -> str:
    models = snap["models"]
    ranked = sum(m["rank_low"] is not None for m in models)
    partial = sum(bool(m["missing_areas"]) for m in models)
    top = next((m for m in models if m["rank_low"] is not None), None)
    return "\n".join(
        [
            f"### ECI snapshot `{snap['id']}`",
            f"- input SHA-256 `{snap['input']['sha256']}`",
            f"- {len(models)} variants of {len(snap['groups'])} fitted model groups; "
            f"{ranked} all-round with at least {snap['fit']['rank_min_benchmarks']} benchmarks; "
            f"{partial} with incomplete coverage",
            f"- {len(snap['folded'])} unrecorded-thinking versions folded into their model's "
            f"top variant ({sum(m['borrowed'] for m in models)} borrowed results)",
            f"- top: {top['name']} {top['eci']}" if top else "- top: none",
            *[
                f"- {p['label']}: {len(p['benchmarks'])} benchmarks, {len(p['scores'])} variants"
                for p in snap.get("domains", {}).get("presets", [])
            ],
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
    fitted: tuple[refit.Fit, variants.Variants] | None = None
    if history.has_input(snapshots, info["sha256"]):
        print("input unchanged since an earlier snapshot; nothing new to record")
    else:
        snap, result, found = _new_snapshot(zip_path, info, args.bootstrap_samples, args.work_dir)
        fitted = result, found
        print(f"wrote {history.save(args.history, snap)}")
        print(_summary(snap))
        provenance.write_output("snapshot", snap["id"])
        provenance.write_summary(_summary(snap))
        snapshots.append(snap)

    site = history.site_data(snapshots)
    snapshots = history.current(snapshots)
    args.site_json.parent.mkdir(parents=True, exist_ok=True)
    args.site_json.write_text(history.dump(site))
    print(f"wrote {args.site_json}")

    latest_zip = _latest_input(zip_path, info["sha256"], snapshots[-1], args.work_dir)
    try:
        # The fit runs once per job: a new snapshot's fit is reused; otherwise only the
        # deterministic central fit runs, to rebuild the latest snapshot's details.
        if fitted is None or latest_zip != zip_path:
            fitted = refit.fit(latest_zip, bootstrap_samples=0), variants.load(latest_zip)
        result, found = fitted
        details = detail.build(latest_zip, snapshots, result, found)
    except detail.ReproduceError as error:
        print(
            f"::error title=Detail refit does not reproduce the snapshot::{error}", file=sys.stderr
        )
        return 1
    count = detail.write(details, site["slugs"], args.details_dir)
    print(f"wrote {count} model pages to {args.details_dir}")
    args.fit_json.write_text(fitdata.dump(fitdata.build(result, found, snapshots[-1], details)))
    print(f"wrote {args.fit_json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
