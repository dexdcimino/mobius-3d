# Composites a matted knot onto the app-icon tile: a rounded square in the viewer's background colour.
import sys, colorsys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
BACKGROUND_H, BACKGROUND_S, BACKGROUND_V = colorsys.rgb_to_hsv(0x0a / 255, 0x18 / 255, 0x21 / 255)
SPREAD = .065
def tile(src, size=1024, fill=.64, shadow=True):
    k = Image.open(src).convert('RGBA')
    # The app's floor shadow, seen from above, rings the knot in near-opaque black; keep only the knot
    # (bright pixels, grown a pixel for its antialiasing) and draw a soft drop shadow of our own.
    r_, g_, b_, a_ = k.split()
    bright = Image.merge('RGB', (r_, g_, b_)).convert('L').point(lambda v: 255 if v > 18 else 0)
    keep = ImageChops.multiply(bright, a_.point(lambda v: 255 if v > 30 else 0)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.7))
    k.putalpha(ImageChops.multiply(a_, keep))
    a = k.getchannel('A').point(lambda v: 255 if v > 200 else 0)   # the solid knot, not the soft floor shadow
    box = a.getbbox(); full = k.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    side = max(box[2] - box[0], box[3] - box[1])
    scale = size * fill / side
    k = k.resize((round(k.width * scale), round(k.height * scale)), Image.LANCZOS)
    m = round(size * .055); r = round(size * .2)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    # tile: the viewer's own background (DEFAULT_BACKGROUND, #0a1821) as the
    # midtone of a top-to-bottom gradient -- the same hue and saturation all
    # the way, brightness from BACKGROUND_V + SPREAD at the top to - at the foot.
    grad = Image.new('RGBA', (size, size))
    for y in range(size):
        v = BACKGROUND_V + SPREAD * (1 - 2 * (y + .5) / size)
        grad.paste(tuple(round(c * 255) for c in colorsys.hsv_to_rgb(BACKGROUND_H, BACKGROUND_S, v)) + (255,), (0, y, size, y + 1))
    mask = Image.new('L', (size, size), 0); ImageDraw.Draw(mask).rounded_rectangle((m, m, size - m, size - m), r, fill=255)
    out.paste(grad, (0, 0), mask)
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    layer.paste(k, (round(size / 2 - cx * scale), round(size / 2 - cy * scale)), k)
    if shadow:
        sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        sa = layer.getchannel('A').filter(ImageFilter.GaussianBlur(size * .022)).point(lambda v: round(v * .75))
        sh.putalpha(ImageChops.offset(sa, 0, round(size * .02)))
        sh.putalpha(ImageChops.multiply(sh.getchannel('A'), mask))
        out = Image.alpha_composite(out, sh)
    layer.putalpha(ImageChops.multiply(layer.getchannel('A'), mask))
    out = Image.alpha_composite(out, layer)
    return out
if __name__ == '__main__':
    if sys.argv[1] == 'sheet':
        ims = [tile(p, 360) for p in sys.argv[3:]]
        sheet = Image.new('RGBA', (360 * len(ims), 400), (255, 255, 255, 255))
        d = ImageDraw.Draw(sheet)
        for i, (im, p) in enumerate(zip(ims, sys.argv[3:])):
            sheet.alpha_composite(im, (360 * i, 0)); d.text((360 * i + 170, 375), p.split('/')[-1], fill=(0, 0, 0, 255))
        sheet.save(sys.argv[2])
    else:
        tile(sys.argv[2], int(sys.argv[4]) if len(sys.argv) > 4 else 1024).save(sys.argv[3])
