# Start Fortless in Codex

## Step 1 — Copy these files into the actual Fortless repository root
Copy ALL contents of this pack, preserving relative paths. If your repository already has an `AGENTS.md`, MERGE its existing rules; do not replace or discard them blindly. Do not commit credentials, private infrastructure URLs or real customer secrets.

Folder structure after copying:
```
fortless-repo/
  AGENTS.md
  MASTER_PROMPT.md
  docs/
    CODEX_CONTEXT.md
    DESIGN_SYSTEM_INTEGRATION.md
    ROUTES_AND_SLICES.md
    IMPLEMENTATION_STATUS.md
    01_PRODUCT_SPEC.md ... 08_ROADMAP_AND_DECISIONS.md
  references/
    design-system/
    brand/
    screenshots/
```

## Step 2 — Open the root of the repository in Codex
In Codex desktop / IDE / CLI, choose the repository or connected folder (local or remote as supported). If SSH is configured, ensure that the actual working folder is the one containing `AGENTS.md`; SSH does not transport ChatGPT chat history by itself.

## Step 3 — Paste this first task
```
Read AGENTS.md and EVERY linked spec fully. Inspect the real Fortless repository and present a gap analysis against docs/CODEX_CONTEXT.md, docs/DESIGN_SYSTEM_INTEGRATION.md, and MASTER_PROMPT.md. Identify existing reusable design components, actual backend state and gaps. Then build the first complete production-minded slice: app foundation + secure login/register/logout + email verification/recovery + guarded client and admin shells, styled to closely match references/design-system/*.html and the Fortless screenshots. Implement both backend and UI, proper validation/auth/session handling, database migrations, accessible mobile UI and negative-path tests. Do not fake external services or live provider statuses. Use sandbox/local email testing. Keep docs/IMPLEMENTATION_STATUS.md up to date, specify exactly which tests ran, and flag missing secrets/commercial settings before integrating billing. Work in small diffs; do not touch production payment or real infrastructure without my approval.
```

## Step 4 — Iterate
After slice 1, tell Codex to continue the next numbered slice in `docs/ROUTES_AND_SLICES.md`. Always use `AGENTS.md` and keep an updated repo state file. New chats will then read repo context from those files automatically, subject to the Codex client and where the working directory is opened.

## Important
This transfer preserves the crucial product decisions and visual sources, not a verbatim full conversation. For any other decisions not documented, add them to the project docs rather than assuming them.
