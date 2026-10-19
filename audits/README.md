# Fortless Audit Tracker

Canonical audit workbook: [FORTLESS_MASTER_SECURITY_UI_BUG_TRACKER.xlsx](./FORTLESS_MASTER_SECURITY_UI_BUG_TRACKER.xlsx)

This workbook is the shared register for confirmed findings, risks, acceptance criteria, status history, push history, and coverage.

## Important

- The workbook was audited against commit `620368742f1df3fd36778dc1e4e567e404cb021b`.
- Commit `b9292811a22159a28a7159deee2c7ff27f41a873` landed while the workbook was being uploaded and **has not yet been independently re-audited**. Do not mark issues fixed merely from its commit message.
- Stable finding IDs must not be recycled.
- Statuses: `OPEN`, `PARTIAL`, `FIXED_IN_CODE`, `TESTED`, `CLOSED`, `REGRESSION`. Fixes require code inspection and tests before closure.
- Keep evidence, code locations, commit hashes and acceptance tests for each finding.
- **XLSX is a binary file**. GitHub cannot automatically merge simultaneous spreadsheet edits. Coordinate changes, pull latest before editing, and push serialized updates to prevent lost work.
- Recommended workflow: coding agent fixes code; auditor checks latest commit and updates the workbook with verifiable outcomes, preserving prior findings and status history.
