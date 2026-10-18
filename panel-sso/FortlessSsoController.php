<?php

namespace Pterodactyl\Http\Controllers\Auth;

use GuzzleHttp\Client;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Models\User;

/**
 * Single sign-on from Fortless (OpenID Connect, authorization code + PKCE).
 *
 * A panel user is only ever matched by external_id = "fortless_acc_<sub>", which Fortless
 * sets when it creates the user. Email alone is never trusted, and root admins can never
 * sign in through this flow.
 */
class FortlessSsoController extends Controller
{
    private const SESSION_KEY = 'fortless_sso';

    public function redirect(Request $request): RedirectResponse
    {
        if (!$this->configured()) {
            return $this->fail('Single sign-on is not configured on this panel.');
        }

        $state = bin2hex(random_bytes(24));
        $nonce = bin2hex(random_bytes(24));
        $verifier = rtrim(strtr(base64_encode(random_bytes(48)), '+/', '-_'), '=');
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

        $request->session()->put(self::SESSION_KEY, [
            'state' => $state,
            'nonce' => $nonce,
            'verifier' => $verifier,
            'expires' => time() + 600,
        ]);

        $query = http_build_query([
            'response_type' => 'code',
            'client_id' => config('fortless_sso.client_id'),
            'redirect_uri' => config('fortless_sso.redirect_uri'),
            'scope' => 'openid profile email',
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ], '', '&', PHP_QUERY_RFC3986);

        return redirect()->away(rtrim(config('fortless_sso.issuer'), '/') . '/oidc/authorize?' . $query);
    }

    public function callback(Request $request): RedirectResponse
    {
        if (!$this->configured()) {
            return $this->fail('Single sign-on is not configured on this panel.');
        }

        $flow = $request->session()->pull(self::SESSION_KEY);
        if (!is_array($flow) || ($flow['expires'] ?? 0) < time()) {
            return $this->fail('Your sign-in attempt expired. Start again from Fortless.');
        }

        if ($request->query('error')) {
            Log::warning('Fortless SSO denied', ['error' => (string) $request->query('error')]);
            return $this->fail('Fortless did not allow access to the panel.');
        }

        $state = (string) $request->query('state', '');
        $code = (string) $request->query('code', '');
        if ($state === '' || $code === '' || !hash_equals($flow['state'], $state)) {
            return $this->fail('Invalid sign-in response.');
        }

        try {
            $response = (new Client(['timeout' => 10, 'http_errors' => false]))->post(
                rtrim(config('fortless_sso.issuer'), '/') . '/oidc/token',
                [
                    'auth' => [config('fortless_sso.client_id'), config('fortless_sso.client_secret')],
                    'form_params' => [
                        'grant_type' => 'authorization_code',
                        'code' => $code,
                        'redirect_uri' => config('fortless_sso.redirect_uri'),
                        'code_verifier' => $flow['verifier'],
                    ],
                ]
            );
        } catch (\Throwable $e) {
            Log::error('Fortless SSO token request failed', ['message' => $e->getMessage()]);
            return $this->fail('Could not reach Fortless. Try again in a moment.');
        }

        $body = json_decode((string) $response->getBody(), true);
        if ($response->getStatusCode() !== 200 || !is_array($body) || empty($body['id_token'])) {
            Log::warning('Fortless SSO token exchange rejected', ['status' => $response->getStatusCode()]);
            return $this->fail('Fortless rejected the sign-in.');
        }

        // The token came straight from the token endpoint over TLS with client authentication,
        // so OIDC Core 3.1.3.7 allows validating claims without re-verifying the signature.
        $claims = $this->decodeClaims($body['id_token']);
        $now = time();
        if (
            $claims === null
            || rtrim((string) ($claims['iss'] ?? ''), '/') !== rtrim(config('fortless_sso.issuer'), '/')
            || ($claims['aud'] ?? null) !== config('fortless_sso.client_id')
            || (int) ($claims['exp'] ?? 0) < $now
            || !hash_equals($flow['nonce'], (string) ($claims['nonce'] ?? ''))
            || empty($claims['sub'])
            || empty($claims['email'])
        ) {
            return $this->fail('The sign-in response from Fortless was not valid.');
        }

        $user = User::where('external_id', 'fortless_acc_' . $claims['sub'])->first();
        if (
            $user === null
            || strcasecmp($user->email, (string) $claims['email']) !== 0
            || $user->root_admin
        ) {
            Log::warning('Fortless SSO refused', ['sub' => $claims['sub']]);
            return $this->fail('No matching hosting panel account was found for this sign-in.');
        }

        Auth::guard('web')->login($user, true);
        $request->session()->regenerate();

        return redirect('/');
    }

    private function configured(): bool
    {
        return config('fortless_sso.issuer') && config('fortless_sso.client_id')
            && config('fortless_sso.client_secret') && config('fortless_sso.redirect_uri');
    }

    private function decodeClaims(string $jwt): ?array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return null;
        }
        $json = base64_decode(strtr($parts[1], '-_', '+/'), true);
        $claims = $json === false ? null : json_decode($json, true);

        return is_array($claims) ? $claims : null;
    }

    private function fail(string $message): RedirectResponse
    {
        return redirect('/auth/login')->with('error', $message);
    }
}
