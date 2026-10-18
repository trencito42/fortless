<?php

return [
    'issuer' => env('FORTLESS_SSO_ISSUER'),
    'client_id' => env('FORTLESS_SSO_CLIENT_ID', 'fortless-panel'),
    'client_secret' => env('FORTLESS_SSO_CLIENT_SECRET'),
    'redirect_uri' => env('FORTLESS_SSO_REDIRECT_URI'),
    'keymint_secret' => env('FORTLESS_KEYMINT_SECRET'),
    'keymint_allowed_ips' => env('FORTLESS_KEYMINT_ALLOWED_IPS', ''),
];
