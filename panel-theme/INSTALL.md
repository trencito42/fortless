# Fortless panel theme (Blueprint extension)

Status: `[NOT_STARTED]` on a live panel. Built and checked only statically:
`test-recolor.cjs` passes (`[MOCK_ONLY]`), and the 12 styled-components ids resolved against panel
1.15.1 assets. Nothing has been looked at in a browser yet, so expect a first round of visual fixes.

## How it works

- `src/theme.css`: Petal tokens (light and dark follow the OS) and shape: pill top bar, segmented sub-navigation,
  rounded rows/inputs/buttons, no borders or shadows, Fortless logo mark, Pterodactyl branding hidden.
- `src/recolor.js`: Pterodactyl bakes its colors into its JS. This script rewrites its CSS rules in the browser
  (at insertion time, so no flash) and maps the gray/cyan/red/green palette onto Petal tokens.
- `build.py`: resolves the panel's generated class ids and packs `dist/fortlesstheme.blueprint`.

## 1. Install Blueprint on the panel (once)

Follow the official guide: https://blueprint.zip/guides/user/install

Then check its version: `blueprint -version`. Build the package with that value as target
(a mismatch only prints a warning, install still works).

## 2. Build and install the theme

On any machine with Python 3 (it reads the panel's public assets):

    python3 build.py https://panel.fortless.net <blueprint-version>      # e.g. beta-2025-09

Copy `dist/fortlesstheme.blueprint` to the panel server, then:

    cd /var/www/pterodactyl
    blueprint -install fortlesstheme

## 3. Login page

Blueprint injects the wrapper into the client dashboard. Open `https://panel.fortless.net/auth/login`:
if it is not themed, add this line just before `</body>` in
`/var/www/pterodactyl/resources/views/templates/auth/core.blade.php`:

    @include('blueprint.dashboard.wrappers.fortlesstheme')

## 4. Panel settings

Admin > Settings: set the panel name to `fortless` (the logo text comes from it).
Replace `public/favicons/*` with Fortless icons.

## After a panel update

Class ids change per build. Re-run `build.py` and `blueprint -install fortlesstheme` again.
The build prints a warning if a styled component can no longer be found.

## Known gaps

- Terminal (console) colors are drawn by xterm in JS and are not themed yet.
- Admin area (`/admin`) is AdminLTE and untouched; customers never see it.
- Saturated colors keep white text; in dark mode that is lower contrast than Petal tints.
- Layout is the panel's own. This is a re-skin, not a rebuild of the pages.
