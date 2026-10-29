"""Every tunable of the pipeline, in one place."""

from typing import Final

ZIP_URL: Final = "https://epoch.ai/data/benchmark_data.zip"
OFFICIAL_SCORES_MEMBER: Final = "epoch_capabilities_index/eci_scores.csv"

BOOTSTRAP_SAMPLES: Final = 500
BOOTSTRAP_SEED: Final = 12345
CI_LEVEL: Final = 0.90

# Largest |refit - official| ECI difference tolerated for any model on both lists.
# Normal day-to-day noise is ~0.5; a typical 90% CI half-width is 3-5 points.
DRIFT_TOLERANCE: Final = 1.5

SCHEMA_VERSION: Final = 1
SNAPSHOT_DIR: Final = "snapshots"
ARCHIVE_ASSET: Final = "benchmark_data.zip"
