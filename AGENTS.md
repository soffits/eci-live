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
