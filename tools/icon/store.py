# The Microsoft Store package's tile and logo images, cut from build/icon.png.
#
#   python3 tools/icon/store.py          writes build/appx/ (electron-builder's AppX asset folder)
#
# Every file is the app icon at a size Windows asks for; the wide tile is the
# icon centred, its sides left clear for the tile colour (appx.backgroundColor,
# the viewer's #0a1821). The .scale-N / .targetsize-N names are Windows'
# resource qualifiers: electron-builder sees them and builds resources.pri, so
# a high-DPI screen gets a sharp icon. altform-unplated is what the taskbar
# and the Start list draw, with no tile colour behind it.
import os, sys
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC, OUT = os.path.join(ROOT, 'build', 'icon.png'), os.path.join(ROOT, 'build', 'appx')
icon = Image.open(SRC).convert('RGBA')
assert icon.size == (1024, 1024), f'{SRC} is {icon.size}, expected 1024x1024'

def square(n): return icon.resize((n, n), Image.LANCZOS)
def wide(w, h):
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); s = round(h * .9)
    out.alpha_composite(square(s), ((w - s) // 2, (h - s) // 2)); return out

jobs = []
for scale in (100, 200, 400):
    k = scale / 100
    jobs += [(f'Square150x150Logo.scale-{scale}.png', square(round(150 * k))),
             (f'Square44x44Logo.scale-{scale}.png', square(round(44 * k))),
             (f'StoreLogo.scale-{scale}.png', square(round(50 * k))),
             (f'SmallTile.scale-{scale}.png', square(round(71 * k))),
             (f'Wide310x150Logo.scale-{scale}.png', wide(round(310 * k), round(150 * k)))]
for scale in (100, 200):   # 400 would be 1240px, upscaled from a 1024 icon
    jobs.append((f'LargeTile.scale-{scale}.png', square(310 * scale // 100)))
for n in (16, 24, 32, 48, 256):
    jobs += [(f'Square44x44Logo.targetsize-{n}.png', square(n)),
             (f'Square44x44Logo.targetsize-{n}_altform-unplated.png', square(n))]

os.makedirs(OUT, exist_ok=True)
for old in os.listdir(OUT):
    if old.endswith('.png'): os.remove(os.path.join(OUT, old))
for name, im in jobs: im.save(os.path.join(OUT, name), optimize=True)
print(f'build/appx: {len(jobs)} images from {os.path.relpath(SRC, ROOT)}')
if len(jobs) != 27: sys.exit(f"expected 27 images, wrote {len(jobs)}")
