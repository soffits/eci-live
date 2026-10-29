# ECI Live

**A daily capability index of AI models, per variant, computed in public CI from open
benchmark data.** Live at <https://soffits.github.io/eci-live/>.

Each model variant (a reasoning setting such as "max" or "high", or a mode such as "pro")
is scored on its own, on the scale of Epoch AI's Capabilities Index (ECI). The data is
Epoch AI's open benchmark data; the method is Epoch AI's, run with their open
[`eci-public`](https://github.com/epoch-research/eci-public) code. ECI Live is not
affiliated with or endorsed by Epoch AI.

## How it's computed

1. The [Publish workflow](.github/workflows/publish.yml) runs daily, and also on
   manual trigger or a push to `main`. It downloads Epoch AI's
   [`benchmark_data.zip`](https://epoch.ai/data/benchmark_data.zip) and records
   the zip's SHA-256 and download time.
2. It fits the index with `eci-public`, pinned to one commit in
   [`pyproject.toml`](pyproject.toml): one capability per model (its variants pooled,
   best score per benchmark), and a difficulty and slope per benchmark. 500 bootstrap
   refits with a fixed seed run as 20 independent chunks of eci-public's own
   `fit_eci_model`, in parallel; the result depends only on the input and the seed.
3. Every variant is then scored on its own results, with each benchmark's difficulty and
   slope held at the fitted values (the method Epoch uses for its domain scores). Its 90%
   interval comes from 5,000 draws: each bootstrap refit's benchmark parameters times ten
   resamples of the variant's own results. The same draws give 90% rank intervals and the
   chance of being #1.
4. **General means all-round.** A variant is ranked on the General index only if it has at
   least four benchmarks and they cover maths and reasoning, coding, agentic tasks and
   knowledge, as tagged by [Epoch AI's benchmark hub](https://epoch.ai/eci). The others
   stay in the full table and on their pages, marked provisional with what they miss.
   Software engineering and Math scores use the hub's tags the same way.
5. If the zip changed since the last snapshot, the run stores a new snapshot and deploys
   the site. If the zip is unchanged, a scheduled run does nothing.

The leaderboard shows each model's highest reasoning-effort variant that qualifies; the
other variants can be added to it.

Each snapshot records the input hash, the `eci-public` commit, the commit of this
repository and a link to the workflow run that produced it. The page shows all of
this under *This snapshot*.

## History

- Every snapshot is a JSON file in [`snapshots/` on the `data` branch](../../tree/data/snapshots).
  It holds every variant's score with its interval, the model-level fit behind them
  and the provenance. `git log` on that branch shows how the scores moved over time.
- The exact input zip of each snapshot is attached to the GitHub release
  `snapshot-<id>`, because Epoch overwrites the zip daily.
- The site's own data file is <https://soffits.github.io/eci-live/eci.json>; each model's
  detail page reads `models/<slug>.json` next to it, with every raw result in the zip for
  that variant and the fitted difficulty and slope of each benchmark it was scored on.

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
- **Domain tags:** [Epoch AI's benchmark hub](https://epoch.ai/eci).
- **Method and fitting code:** Ho, Denain, Atanasov, Albanie & Shah,
  [*A Rosetta Stone for AI Benchmarks*](https://arxiv.org/abs/2512.00193) (2025), and
  [`eci-public`](https://github.com/epoch-research/eci-public) (MIT).
- **Lab logos:** [Lobe Icons](https://github.com/lobehub/lobe-icons) (MIT). Logos are
  trademarks of their owners.

Built by Sakina. Code licensed under [AGPL-3.0-only](LICENSE).
