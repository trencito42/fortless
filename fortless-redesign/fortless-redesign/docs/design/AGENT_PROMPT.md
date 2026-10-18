# Prompt for the coding agent

You are redesigning the Fortless frontend to match an approved mockup. Read `AGENTS.md` first and obey it.

## Source of truth
- `docs/design/views.html`: interactive mockup of all 24 views. Open it, use the Phone, Components, state and Providers toggles. Each view has a side panel listing the components used and which repo files it replaces.
- `docs/design/MIGRATION.md`: the tracker. You update it; nothing is DONE without evidence.

## Hard rules
1. Presentation only. Do not change API calls, validation, authorization, step-up auth, verification-tier gating, money handling (minor units) or any `data-` hook the existing JS or tests rely on. If a change seems to need it, stop and ask.
2. Use only the Petal tokens and components in `src/frontend/petal` and the mockup's CSS. No inline styles, no hardcoded colors, no new libraries. If a component is missing, add it to Petal first, then use it.
3. Flat design: no borders, shadows or gradients. Light and dark both work.
4. Zero fake success. Providers-off must still block ordering and say why. Show purchased limits as limits, never as live usage.
5. Every list or data region needs Loading, Empty and Error states, like the mockup.
6. Phone is not a shrunken desktop: tables become labelled cards, the sidebar becomes the bottom tab bar, modals become sheets.
7. Copy stays in English and keeps the existing meaning.

## Process
- Wave 0: tokens, shared components, shells. Commit.
- Then waves 1 to 5 in the order in MIGRATION.md. One commit per wave, one view at a time inside it.
- After each view: run `npm run build`, `npm test`, then `python3 scripts/verify-views.py <view-id>`. Fix until it passes, then fill the Evidence column with the screenshot path.
- Do not start the next wave until the current one is committed and green.
- Report at the end of each wave: views done, anything that deviates from the mockup and why.
