# Fortless SSO for Pterodactyl (no third-party plugin)

Status: `[NOT_STARTED]` against a real panel. The Fortless side (`/oidc/*`) is covered by unit tests
(`tests/oidc.test.ts`, `[MOCK_ONLY]`). This panel patch passes `php -l` but has not run on a live
Pterodactyl 1.11 panel yet. Treat the first run as the verification step.

Three files, no changes to Pterodactyl core logic. Run all commands on the **panel server**.

## 1. Generate the client secret (on the Fortless server)

Use hex so the secret is safe inside HTTP Basic auth:

    openssl rand -hex 32

Add to Fortless `.env`, then restart Fortless:

    OIDC_PANEL_CLIENT_ID=fortless-panel
    OIDC_PANEL_CLIENT_SECRET=<the hex value>
    OIDC_PANEL_REDIRECT_URIS=https://panel.fortless.net/auth/sso/fortless/callback
    PTERODACTYL_SSO_LOGIN_URL=https://panel.fortless.net/auth/sso/fortless

## 2. Copy the files to the panel (default path `/var/www/pterodactyl`)

    cp FortlessSsoController.php /var/www/pterodactyl/app/Http/Controllers/Auth/
    cp fortless_sso.php          /var/www/pterodactyl/config/
    cat routes-snippet.php >>    /var/www/pterodactyl/routes/auth.php
    chown -R www-data:www-data /var/www/pterodactyl   # use your web user (nginx/www-data)

## 3. Panel `.env`

Append to `/var/www/pterodactyl/.env`:

    FORTLESS_SSO_ISSUER=https://fortless.net
    FORTLESS_SSO_CLIENT_ID=fortless-panel
    FORTLESS_SSO_CLIENT_SECRET=<the same hex value>
    FORTLESS_SSO_REDIRECT_URI=https://panel.fortless.net/auth/sso/fortless/callback

Then clear caches:

    cd /var/www/pterodactyl && php artisan optimize:clear

## 4. Test

1. In Fortless, log in as a customer whose first service is already provisioned.
2. Open `https://fortless.net/panel/open`. You should land on the panel, logged in as that customer.
3. Negative checks: open `https://panel.fortless.net/auth/sso/fortless/callback?code=x&state=y` directly
   (must bounce to `/auth/login`), and confirm the panel `admin` account cannot be reached through SSO.

## Security properties

- Authorization code + PKCE (S256), `state` and `nonce` checked, client authenticated with the secret.
- Users are matched by `external_id = fortless_acc_<account id>` (set by Fortless at user creation) and the
  email must also match. Email alone is never trusted.
- Root admins are refused. Admins keep signing in with their panel password.
- SSO sign-in bypasses panel 2FA, because Fortless has already authenticated the user.

## Known gaps

- Customer panel users are created without a password, but the panel's "forgot password" email flow can still
  set one. If you want SSO-only, disable it in the panel or limit it at the web server.
- There is no "Sign in with Fortless" button on the panel login page (that needs a frontend rebuild).
  Customers enter through the Open panel button in Fortless.

## 5. Per-account Client API keys (console, stats, files)

Status: `[NOT_STARTED]` on a live panel. `FortlessKeyMintController.php` has not run on a real Pterodactyl 1.11
yet; it relies on `User::createToken()` / `tokens()` (confirmed present on the target panel); the bearer key is `identifier . plainTextToken`.

Pterodactyl does not allow an API key to create other API keys, so the panel issues them on request from Fortless.

Copy the controller next to the SSO one (`routes-snippet.php` already contains the new route, re-append only if
you did not add it before) and add to the panel `.env`:

    FORTLESS_KEYMINT_SECRET=<openssl rand -hex 32>
    FORTLESS_KEYMINT_ALLOWED_IPS=<public IP of the Fortless server>

Add the same secret to the Fortless `.env` as `PTERODACTYL_KEYMINT_SECRET`, then `php artisan optimize:clear`.
Also add `https://fortless.net` to `allowed_origins` in every Wings `config.yml` (the browser console connects to Wings
directly) and restart Wings.
