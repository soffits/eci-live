"""Every tunable of the pipeline, in one place."""

from typing import Final

ZIP_URL: Final = "https://epoch.ai/data/benchmark_data.zip"

BOOTSTRAP_SAMPLES: Final = 500
BOOTSTRAP_SEED: Final = 12345
# The bootstrap runs as this many independently seeded chunks (seeds derived from
# BOOTSTRAP_SEED), in parallel. Fixed, so results don't depend on the runner's cores.
BOOTSTRAP_CHUNKS: Final = 20
CI_LEVEL: Final = 0.90

# Variants: eci-public fits model groups; each variant (model version) is then scored with
# the group-level fit's benchmark difficulty and slope held fixed, refitting only its own
# capability (Epoch's domain-ECI method, on every benchmark). Domain ECIs do the same on the
# benchmarks Epoch's benchmark hub tags with the domain. Intervals: RESAMPLES_PER_DRAW
# resamples of a variant's own results for each bootstrap draw (500 x 10 = 5,000 samples, as
# Epoch does for its domain ECIs).
RESAMPLES_PER_DRAW: Final = 10
# Rank intervals and the chance of #1 count all-round variants (CORE_AREAS) with at least this
# many benchmarks, eci-public's own minimum for a model to enter the fit; thinner ones would
# claim #1 by noise.
RANK_MIN_BENCHMARKS: Final = 4
# The General index is all-round: a variant is ranked on it only if the benchmarks behind its
# score cover every core area, an area being covered by any benchmark the hub tags with one
# of its domains (so the rule follows the hub's tags, not a list of benchmarks).
CORE_AREAS: Final = (
    ("Maths & reasoning", ("Mathematics", "Conceptual reasoning")),
    ("Coding", ("Software engineering",)),
    ("Agentic tasks", ("Agent", "Computer use")),
    ("Knowledge", ("World knowledge", "Science")),
)
HUB_PAGE_URL: Final = "https://epoch.ai/eci"
DOMAIN_PRESETS: Final = (
    ("software", "Software engineering ECI", "Software engineering"),
    ("math", "Math ECI", "Mathematics"),
)

SCHEMA_VERSION: Final = 2
SNAPSHOT_DIR: Final = "snapshots"
ARCHIVE_ASSET: Final = "benchmark_data.zip"
# Further inputs archived with each snapshot's release, next to the zip.
HUB_ASSET: Final = "epoch_benchmark_hub.js"
