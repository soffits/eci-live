# ECI Live

**An unofficial, daily refit of the [Epoch Capabilities Index](https://epoch.ai/benchmarks/eci).**
Live at <https://soffits.github.io/eci-live/>.

Epoch AI publishes its benchmark data every day, but its official ECI scores are
updated less often. ECI Live refits the index from that data with Epoch's own
open-source fitting code, on a schedule, entirely inside public GitHub Actions,
and shows the result as a leaderboard. Models that this refit scores but Epoch has
not published yet are marked *Not yet on Epoch*.

This project is not affiliated with or endorsed by Epoch AI.

## How it's computed

1. The [Publish workflow](.github/workflows/publish.yml) runs daily, and also on
   manual trigger or a push to `main`. It downloads Epoch AI's
   [`benchmark_data.zip`](https://epoch.ai/data/benchmark_data.zip) and records
   the zip's SHA-256 and download time.
2. It fits ECI with [`epoch-research/eci-public`](https://github.com/epoch-research/eci-public),
   pinned to one exact commit in [`pyproject.toml`](pyproject.toml). The fit uses
   500 bootstrap refits with a fixed seed, which give 90% confidence intervals.
   The same refits also give a 90% interval for each model's rank and the share
   of refits in which it ranks first. When several models could plausibly be #1,
   the page shows them as tied.
3. It compares the refit with the official scores shipped in the same zip. The run
   fails, and publishes nothing, if any model on Epoch's list is missing or any
   shared model differs by more than 1.5 ECI points.
4. If the zip changed since the last snapshot, the run stores a new snapshot and
   deploys the site. If the zip is unchanged, a scheduled run does nothing.

Each snapshot records the input hash, the `eci-public` commit, the commit of this
repository and a link to the workflow run that produced it. The page shows all of
this under *This snapshot*.

## History

- Every snapshot is a JSON file in [`snapshots/` on the `data` branch](../../tree/data/snapshots).
  It holds the scores with their intervals, the drift check result and the
  provenance. `git log` on that branch shows how the scores moved over time.
- The exact input zip of each snapshot is attached to the GitHub release
  `snapshot-<id>`, because Epoch overwrites the zip daily.
- The site's own data file is <https://soffits.github.io/eci-live/eci.json>; each model's
  detail page reads `models/<slug>.json` next to it, with every raw result in the zip for
  that model and the fitted difficulty and slope of each benchmark it was scored on.

## Reproduce a snapshot

You need [uv](https://docs.astral.sh/uv/). Then:

```sh
git clone https://github.com/soffits/eci-live && cd eci-live
git checkout <build.commit from the snapshot>
gh release download snapshot-<id> --pattern benchmark_data.zip --dir build
sha256sum build/benchmark_data.zip      # must equal input.sha256
uv run eci-live --input build/benchmark_data.zip --history /tmp/eci-history
```

The scores in `/tmp/eci-history/snapshots/*.json` should match the published
snapshot. The fit is deterministic, but tiny floating-point differences are
possible on other CPUs or BLAS builds.

To preview the site, run `npm ci && npm run dev` in `web/`. The command above writes
`web/public/eci.json` and `web/public/models/` for it.

## Credits

- **Data:** [Epoch AI](https://epoch.ai/benchmarks), *Capabilities & benchmarking*,
  licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Method and fitting code:** Ho, Denain, Atanasov, Albanie & Shah,
  [*A Rosetta Stone for AI Benchmarks*](https://arxiv.org/abs/2512.00193) (2025), and
  [`eci-public`](https://github.com/epoch-research/eci-public) (MIT).
- **Lab logos:** [Lobe Icons](https://github.com/lobehub/lobe-icons) (MIT). Logos are
  trademarks of their owners.

Built by Sakina. Code licensed under [AGPL-3.0-only](LICENSE).
