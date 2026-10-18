
// Fortless single sign-on (appended to routes/auth.php; served under the /auth prefix)
Route::get('/sso/fortless', [\Pterodactyl\Http\Controllers\Auth\FortlessSsoController::class, 'redirect'])->name('auth.sso.fortless');
Route::get('/sso/fortless/callback', [\Pterodactyl\Http\Controllers\Auth\FortlessSsoController::class, 'callback'])->name('auth.sso.fortless.callback');
Route::post('/sso/fortless/client-key', \Pterodactyl\Http\Controllers\Auth\FortlessKeyMintController::class)
    ->withoutMiddleware([\Pterodactyl\Http\Middleware\VerifyCsrfToken::class])
    ->middleware('throttle:30,1')
    ->name('auth.sso.fortless.client-key');
