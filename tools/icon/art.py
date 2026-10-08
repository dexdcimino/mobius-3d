# The app icon, from the green knot artwork in tools/icon/art.png.
#
#   python3 tools/icon/art.py      writes build/icon.png (1024), build/icon.ico
#                                  (16 to 256) and desktop/icon.png (512)
#   python3 tools/icon/store.py    then re-cuts build/appx/ from build/icon.png
#
# The artwork is a square render with a lot of dark margin, so it is cropped
# tight around the knot first (CROP: centre and half-side in the artwork's
# pixels) and then set on a rounded plate with a 31.25% corner radius, the
# same corner the other apps' icons on the site use.
import os
from PIL import Image, ImageDraw
HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', '..')
CROP = (642, 638, 575)          # cx, cy, half-side, in tools/icon/art.png
RADIUS = .3125

art = Image.open(os.path.join(HERE, 'art.png')).convert('RGBA')
assert art.size == (1254, 1254), f'art.png is {art.size}, CROP was measured on 1254x1254'
cx, cy, h = CROP
art = art.crop((cx - h, cy - h, cx + h, cy + h)).resize((1024, 1024), Image.LANCZOS)
big = 4096
mask = Image.new('L', (big, big), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * RADIUS), fill=255)
art.putalpha(mask.resize((1024, 1024), Image.LANCZOS))

art.save(os.path.join(ROOT, 'build', 'icon.png'), optimize=True)
art.resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, 'desktop', 'icon.png'), optimize=True)
art.save(os.path.join(ROOT, 'build', 'icon.ico'), sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
print('wrote build/icon.png 1024, desktop/icon.png 512, build/icon.ico 16-256')
