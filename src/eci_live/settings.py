"""Every tunable of the pipeline, in one place."""

from typing import Final

ZIP_URL: Final = "https://epoch.ai/data/benchmark_data.zip"
OFFICIAL_SCORES_MEMBER: Final = "epoch_capabilities_index/eci_scores.csv"

BOOTSTRAP_SAMPLES: Final = 500
BOOTSTRAP_SEED: Final = 12345
# The bootstrap runs as this many independently seeded chunks (seeds derived from
# BOOTSTRAP_SEED), in parallel. Fixed, so results don't depend on the runner's cores.
BOOTSTRAP_CHUNKS: Final = 20
CI_LEVEL: Final = 0.90

# Largest |refit - official| ECI difference tolerated for any model on both lists.
# Normal day-to-day noise is ~0.5; a typical 90% CI half-width is 3-5 points.
DRIFT_TOLERANCE: Final = 1.5

# Domain ECIs (Epoch's domain-specific method): benchmark difficulty and slope stay at the
# general fit's; only each model's capability is refit on the benchmarks Epoch's benchmark hub
# tags with the domain. Intervals: DOMAIN_RESAMPLES resamples of each model's own results
# for each general bootstrap draw (500 x 10 = 5,000 samples, as Epoch does).
HUB_PAGE_URL: Final = "https://epoch.ai/eci"
DOMAIN_PRESETS: Final = (
    ("software", "Software engineering ECI", "Software engineering"),
    ("math", "Math ECI", "Mathematics"),
)
DOMAIN_RESAMPLES: Final = 10
# Epoch's own inputs for its Cyber ECI, a separate joint fit it publishes less often.
CYBER_SCORES_URL: Final = "https://epoch.ai/data/cyber/eci_scores.csv"
CYBER_RESULTS_URL: Final = "https://epoch.ai/data/cyber/processed_data_for_eci.csv"

SCHEMA_VERSION: Final = 1
SNAPSHOT_DIR: Final = "snapshots"
ARCHIVE_ASSET: Final = "benchmark_data.zip"
# Further inputs archived with each snapshot's release, next to the zip.
HUB_ASSET: Final = "epoch_benchmark_hub.js"
CYBER_SCORES_ASSET: Final = "cyber_eci_scores.csv"
CYBER_RESULTS_ASSET: Final = "cyber_processed_data_for_eci.csv"
