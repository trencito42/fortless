#!/usr/bin/env python3
"""Builds the Blueprint extension (dist/fortlesstheme + fortlesstheme.blueprint).

Resolves styled-components class ids from the live panel assets, so the theme can be regenerated
after a panel update: python3 build.py https://panel.fortless.net beta-2025-09
"""
import base64, json, pathlib, re, sys, urllib.request, zipfile

ROOT = pathlib.Path(__file__).parent
panel = (sys.argv[1] if len(sys.argv) > 1 else 'https://panel.fortless.net').rstrip('/')
target = sys.argv[2] if len(sys.argv) > 2 else 'beta-2025-09'


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'fortless-theme-build'}), timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


login = get(f'{panel}/auth/login')
bundle_src = re.search(r'src="(/assets/bundle\.[0-9a-f]+\.js)"', login)
if not bundle_src:
    sys.exit('Could not find the panel bundle on the login page.')
bundle = get(panel + bundle_src.group(1))

chunk_map = re.search(r'\{(?:\d+:"[0-9a-f]{8}",?)+\}\[e\]\+"\.js"', bundle)
names = re.search(r'\(\{((?:\d+:"[a-z]+",?)+)\}\[e\]\|\|e\)\+"\."', bundle)
alias = dict(re.findall(r'(\d+):"([a-z]+)"', names.group(1))) if names else {}
sources = [bundle]
if chunk_map:
    for cid, h in re.findall(r'(\d+):"([0-9a-f]{8})"', chunk_map.group(0)):
        sources.append(get(f'{panel}/assets/{alias.get(cid, cid)}.{h}.js'))

ids = {}
for src in sources:
    for m in re.finditer(r'withConfig\(\{displayName:"([A-Za-z_0-9]+)",componentId:"(sc-[a-z0-9-]+)"\}\)', src):
        ids.setdefault(m.group(1), m.group(2))

icon_svg = (ROOT.parent / 'public/assets/fortless-icon.svg').read_bytes()
icon_uri = 'data:image/svg+xml;base64,' + base64.b64encode(icon_svg).decode()

css = (ROOT / 'src/theme.css').read_text()
missing = []


def sub(m):
    name = m.group(1)
    if name == 'icon':
        return icon_uri
    if name not in ids:
        missing.append(name)
        return '.fortless-missing-' + name
    return '.' + ids[name] + '.' + ids[name]


css = re.sub(r'\{\{([A-Za-z_0-9]+)\}\}', sub, css)
js = (ROOT / 'src/recolor.js').read_text()

out = ROOT / 'dist/fortlesstheme'
out.mkdir(parents=True, exist_ok=True)
(out / 'wrapper.blade.php').write_text(
    '@verbatim\n<style id="fortless-theme">\n' + css + '\n</style>\n<script>\n' + js + '\n</script>\n@endverbatim\n')
(out / 'admin.blade.php').write_text((ROOT / 'src/admin.blade.php').read_text())
(out / 'conf.yml').write_text((ROOT / 'src/conf.yml').read_text().replace('{{target}}', target))

archive = ROOT / 'dist/fortlesstheme.blueprint'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(out.iterdir()):
        z.write(f, f.name)

print(f'resolved {len(ids)} components from {len(sources)} panel files')
if missing:
    print('WARNING: components not found in this panel version:', ', '.join(sorted(set(missing))))
print('built', archive)
