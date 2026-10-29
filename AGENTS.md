# AGENTS.md

This repository builds a live leaderboard for the Epoch Capabilities Index (ECI), published at <https://soffits.github.io/eci-live/>.

Epoch AI publishes its benchmark data daily, but its official ECI scores lag behind. This project refits ECI from that data with Epoch's own open-source code (`epoch-research/eci-public`) on a schedule, entirely inside public GitHub Actions, and publishes the result as a static site.

## Rules

- Transparency is the point: every published number must be traceable to a public workflow run, the exact input data, and the pinned fitting code. No numbers computed off-CI.
- Use Epoch's fitting code as a pinned dependency; never fork or re-implement the method.
- Credit Epoch AI (data is CC-BY) visibly on the page. Say clearly that this is an unofficial refit.
- Repository text is English. Conventional Commits. License: AGPL-3.0-only for code.
- Public author name is Sakina; `soffits` is only the account handle.
- Prefer maintained UI components and libraries over hand-written equivalents. Keep code small, typed, and free of dead code.

## Layout

- `src/eci_live/`: the Python pipeline, a thin layer around `eci`. All tunables (URL, bootstrap count, seed, CI level, drift tolerance) live in `settings.py`. JSON shapes are `TypedDict`s in `schema.py`, mirrored by hand in `web/src/data.ts`; change both together and bump `SCHEMA_VERSION` if the change breaks old snapshots.
- `uv run eci-live` is the single entry point, locally and in CI. It downloads the zip, skips the fit if the zip's SHA-256 already has a snapshot in `--history`, otherwise fits, runs the drift check, writes `snapshots/<id>.json`, and always rewrites `web/public/eci.json` from the whole history. In Actions it also sets the `snapshot` step output and a step summary.
- `web/`: Vite + React + Mantine + Recharts + mantine-datatable. It fetches `eci.json` at runtime. Lab colours and logos, top-N and the "new" window are in `web/src/config.ts`. `base` is `/eci-live/` (project page).
- `.github/workflows/publish.yml`: the `build` job (`contents: write`) checks out the `data` branch as a worktree at `history/`, refits, builds the site, commits the new snapshot to `data` and creates release `snapshot-<id>` with the input zip. The `deploy` job (`pages: write`, `id-token: write`) deploys. Scheduled runs with unchanged input don't deploy.
- `.github/workflows/ci.yml`: lint, types, tests and build for both sides.

## Where the look lives (keep library upgrades easy)

Style through the libraries' public surfaces only: the Mantine theme, CSS variables, `defaultProps`, per-instance props or style props, and Recharts props. Don't wrap, fork or re-implement library components, and don't target their internal class names (`.mantine-*`, `.m_*`, `.recharts-*`). Custom components must be thin compositions of library parts.

- `web/src/theme.ts` is the theme layer and the first place to look. `createTheme` holds the fonts, primary colour, radius and component `defaultProps`: Anchor inherits size; Badge, Button, ActionIcon, Chip, TextInput, MultiSelect and SegmentedControl default to an `xl` radius; Tooltip has an arrow; Drawer a `lg` radius. `cssVariablesResolver` sets the body and dimmed colours, the placeholder colour, the page surfaces `--eci-surface` / `--eci-hero-surface`, the background dot colour, the capsule opacity, the estimate-dot ring `--eci-dot-ring` and `--drawer-size-sheet` (so `<Drawer size="sheet">` sizes to its content).
- `web/src/config.ts` holds the data-facing choices: lab colours and logos, weights labels and colours, top-N, page size and the "new" window.
- `web/src/global.css` holds page-level rules only: the cascade-layer order for Mantine and mantine-datatable, `color-scheme` keyed on Mantine's documented `data-mantine-color-scheme` attribute, the body dot grid and the `.num` tabular-figures helper.
- CSS modules (`App.module.css`, `components/*.module.css`) style only this project's own elements: page sections, the hero ring, the chart tick layout, the legend key and the About blocks. They read `--mantine-*` / `--eci-*` variables and never select library internals.
- Recharts customisation is all through documented props: a `tick` render function (a `foreignObject` with Mantine parts), a `shape` render function on a range `Bar` for the CI capsules, `ReferenceArea` with a full-width `shape` for the tie band, a row-period `strokeDasharray` on `CartesianGrid` so phone gridlines skip the names, a `ZAxis` range for dot size, and `LabelList content` for frontier labels.
- Library-part compositions: ModelBadges (Badge + Tooltip), the table CI capsule (Progress.Root and Sections), LabLegend (Chip + ColorSwatch), Insights (Progress with `lighten` tints and `Progress.Label`, Group, Text), FilterBar (SegmentedControl, MultiSelect, RangeSlider, Drawer) and About (CopyButton, Code). The table is mantine-datatable with only its public props.
- On a Mantine or Recharts major upgrade, check theme.ts first (`extend`/`defaultProps` names, `CSSVariablesResolver`, the Drawer size variable) and then the Recharts render-prop signatures (`TickProps`, `ShapeProps`, `AreaProps` and `LabelProps` in Leaderboard.tsx and Timeline.tsx).

## Maintenance

- **Bumping eci-public** is deliberate: change the commit in `pyproject.toml`, run `uv lock`, run the pipeline locally, and check the drift summary. The page reads the commit from the installed package's `direct_url.json`, so there is nothing else to update.
- **Drift failures**: the run exits 1 with an `::error::` annotation that lists the offenders. Investigate upstream (zip format, renamed anchor models, eci-public change) before touching `DRIFT_TOLERANCE`.
- **Another data source** (for example LLM Stats) would get its own fetcher in `source.py`, pass its rows through `eci.prepare_benchmark_data(extra_scores=...)`, and record its own hash in the snapshot's `input`. Its models would no longer be comparable with Epoch's list for drift, so keep the drift check on Epoch-only data.
- **New labs**: add a colour and a logo import from `@lobehub/icons-static-svg` in `web/src/config.ts`. Unknown labs fall back to grey with an initial.
- Workflow actions use major-version tags (`actions/checkout@v7`) so they pick up fixes without churn. `astral-sh/setup-uv` publishes no major tags since v8, so it uses its full version tag. `.github/zizmor.yml` allows tag refs for `actions/*` and `astral-sh/*` and requires a hash pin for any other third-party action.
- Local checks: `uv run ruff format --check && uv run ruff check && uv run mypy && uv run pytest`; in `web/`, `npm run check && npm run build`. Workflows: `actionlint` and `uvx zizmor .github/workflows`.
- Run builds niced, with `OMP_NUM_THREADS=2`, on shared machines. A full fit with 500 bootstrap samples takes about 2.5 minutes on two threads.
