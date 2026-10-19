<?php

namespace Pterodactyl\Http\Controllers\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Models\User;

/**
 * Server-to-server endpoint: Fortless asks the panel to issue a Client API key for ONE customer.
 *
 * Pterodactyl does not let an API key create other API keys, so this is the only way to give
 * every Fortless account its own key (a key can then only see that account's servers).
 *
 * Security:
 *  - HMAC-SHA256 over "<timestamp>.<nonce>.<external_id>" with a secret only Fortless and the panel know.
 *  - 60 second window, nonces are single use (replay protection).
 *  - Only users whose external_id starts with "fortless_acc_" and who are NOT root admins.
 *  - The key is bound to FORTLESS_KEYMINT_ALLOWED_IPS when set, and the previous Fortless key is revoked.
 */
class FortlessKeyMintController extends Controller
{
    private const MEMO = 'fortless-console';

    public function __invoke(Request $request): JsonResponse
    {
        $secret = (string) config('fortless_sso.keymint_secret');
        if ($secret === '' || strlen($secret) < 32) {
            return new JsonResponse(['error' => 'disabled'], 503);
        }

        $externalId = (string) $request->input('external_id', '');
        $timestamp = (string) $request->input('timestamp', '');
        $nonce = (string) $request->input('nonce', '');
        $signature = (string) $request->input('signature', '');

        if (
            !preg_match('/^fortless_acc_[A-Za-z0-9_-]{1,64}$/', $externalId)
            || !ctype_digit($timestamp)
            || !preg_match('/^[A-Za-z0-9_-]{16,64}$/', $nonce)
            || !preg_match('/^[a-f0-9]{64}$/', $signature)
        ) {
            return new JsonResponse(['error' => 'invalid_request'], 400);
        }

        $expected = hash_hmac('sha256', $timestamp . '.' . $nonce . '.' . $externalId, $secret);
        if (!hash_equals($expected, $signature) || abs(time() - (int) $timestamp) > 60) {
            Log::warning('Fortless key mint refused: bad signature or stale timestamp');
            return new JsonResponse(['error' => 'unauthorized'], 401);
        }

        // Cache::add is atomic: it fails when the nonce was already used.
        if (!Cache::add('fortless_keymint_nonce_' . $nonce, 1, 120)) {
            return new JsonResponse(['error' => 'replayed'], 401);
        }

        $user = User::where('external_id', $externalId)->first();
        if ($user === null || $user->root_admin) {
            Log::warning('Fortless key mint refused: unknown or admin user', ['external_id' => $externalId]);
            return new JsonResponse(['error' => 'not_found'], 404);
        }

        $ips = array_values(array_filter(array_map('trim', explode(',', (string) config('fortless_sso.keymint_allowed_ips')))));
        // NEW-397: a key that works from any address is not issued. Set FORTLESS_KEYMINT_ALLOWED_IPS to the Fortless server.
        if (count($ips) === 0) {
            Log::error('Fortless key mint refused: FORTLESS_KEYMINT_ALLOWED_IPS is empty');
            return new JsonResponse(['error' => 'disabled'], 503);
        }

        // Revoke the previous key so each account only ever has one live Fortless key.
        $user->tokens()->where('memo', self::MEMO)->delete();
        $token = $user->createToken(self::MEMO, $ips);

        // plainTextToken is only the 32 character secret; the usable bearer key is identifier + secret.
        return new JsonResponse(['token' => $token->accessToken->identifier . $token->plainTextToken]);
    }
}
