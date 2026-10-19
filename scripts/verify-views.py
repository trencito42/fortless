#!/usr/bin/env python3
"""Screenshot every migrated view at desktop and phone, light and dark; fail on overflow or console errors.
Usage: python3 scripts/verify-views.py [view-id ...]   (env BASE_URL, default http://localhost:3000)
Edit ROUTES to match how each view is reached in the real app (path, or a click sequence).
Needs: pip install playwright && playwright install chromium
"""
import os, sys, asyncio, pathlib
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE_URL', 'http://localhost:3021')
OUT = pathlib.Path('docs/design/shots'); OUT.mkdir(parents=True, exist_ok=True)
# view id -> URL path (hash routes included). Adjust to the real router.
ROUTES = {
 'login':'/login','register':'/register','mfa':'/mfa-challenge','forgot':'/forgot-password',
 'reset':'/reset-password?token=sample','verify':'/verify-email?token=sample',
 'home':'/app','services':'/app/services','service-detail':'/app/services/sample','deploy':'/app/deploy','domains':'/app/domains',
 'billing':'/app/billing','support':'/app/support','ticket-detail':'/app/support/sample','activity':'/app/activity','settings':'/app/settings',
 'o-over':'/admin','o-acc':'/admin/accounts','o-svc':'/admin/services','o-tix':'/admin/tickets',
 'o-aud':'/admin/audit','o-staff':'/admin/staff','status':'/status','legal':'/legal',
}
SIZES = {'desktop':(1400,900),'phone':(390,844)}
async def main(ids):
    bad = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for vid in ids:
            for sz,(w,h) in SIZES.items():
                for scheme in ('light','dark'):
                    ctx = await b.new_context(viewport={'width':w,'height':h}, color_scheme=scheme)
                    pg = await ctx.new_page(); errs = []
                    pg.on('pageerror', lambda e: errs.append(str(e)))
                    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
                    await pg.goto(BASE + ROUTES[vid]); await pg.wait_for_timeout(600)
                    sw = await pg.evaluate('document.documentElement.scrollWidth')
                    if sw > w + 1: bad.append(f'{vid} {sz} {scheme}: horizontal overflow {sw}>{w}')
                    for e in errs: bad.append(f'{vid} {sz} {scheme}: console error: {e}')
                    await pg.screenshot(path=str(OUT / f'{vid}_{sz}_{scheme}.png'), full_page=True)
                    await ctx.close()
        await b.close()
    print('\n'.join(bad) if bad else 'PASS: no overflow, no console errors. Now compare shots in docs/design/shots with views.html.')
    sys.exit(1 if bad else 0)
ids = sys.argv[1:] or list(ROUTES)
asyncio.run(main(ids))
