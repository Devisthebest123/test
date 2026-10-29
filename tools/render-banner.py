"""1500x500 banner, every part of it scanlined: shaded backdrop, wordmark, cat."""
import math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys; sys.path.insert(0, 'scripts')
from scanline import scan

import os
FONTS = os.environ.get("WHISPER_FONTS", "fonts") + "/"  # directory holding Silkscreen-Bold.ttf, Silkscreen-Regular.ttf, GeistMono.ttf
W, H = 1500, 500

def source(tagline="DEAD DROPS ON SOLANA", seed=3):
    random.seed(seed)
    # Backdrop: a studio-like shade, brighter where the type sits, darker
    # toward the edges, with slow blotches so the rules break into dashes.
    base = Image.new("L", (W, H), 0)
    px = base.load()
    for y in range(H):
        for x in range(W):
            nx, ny = x / W, y / H
            v = 0.905 + 0.06 * (nx ** 1.2) - 0.035 * abs(ny - 0.4) ** 1.5 + 0.02 * (1 - nx) * (1 - ny)
            px[x, y] = int(max(0, min(255, v * 255)))
    blot = Image.effect_noise((W // 8, H // 8), 40).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(18))
    base = Image.blend(base, Image.merge("L", (blot,)), 0.07)

    # The cat, from the clean poster, blended in on the right with a soft edge.
    cat = Image.open("public/media/cat-poster.jpg").convert("L").crop((90, 20, 1050, 980)).resize((H, H), Image.LANCZOS)
    m = Image.new("L", (H, H), 255); mp = m.load(); fade = int(H * 0.22)
    for x in range(fade):
        a = int(255 * (x / fade) ** 1.4)
        for y in range(H): mp[x, y] = a
    # Lift the cat's backdrop to match ours so it does not sit in a lighter box.
    cat = cat.point(lambda v: min(255, int(v * 0.985)))
    base.paste(cat, (W - H - 30, 0), m)

    d = ImageDraw.Draw(base)
    col_x, col_w = 96, 720
    size = 220
    while size > 40:
        f = ImageFont.truetype(FONTS + "Silkscreen-Bold.ttf", size)
        if d.textlength("WHISPER", font=f) <= col_w: break
        size -= 4
    bb = d.textbbox((0, 0), "WHISPER", font=f)
    ty = (H - (bb[3] - bb[1])) // 2 - bb[1] - 30
    d.text((col_x, ty), "WHISPER", font=f, fill=14)
    return base, (col_x, col_w, ty + bb[3] + 28)

def overlay(im, tagline, geom):
    col_x, col_w, rule_y = geom
    d = ImageDraw.Draw(im)
    small = ImageFont.truetype(FONTS + "Silkscreen-Regular.ttf", 22)
    tw = d.textlength(tagline, font=small)
    # a cleared plate so the small type reads against the dashes
    d.rectangle([col_x - 14, rule_y - 8, col_x + max(tw, col_w) + 14, rule_y + 56], fill=(240, 241, 238))
    d.rectangle([col_x, rule_y, col_x + col_w, rule_y + 2], fill=(11, 11, 11))
    d.text((col_x, rule_y + 20), tagline, font=small, fill=(11, 11, 11))
    return im

if __name__ == "__main__":
    src, _ = source()
    scan(src, lines=100).save("public/brand/whisper-banner-1500x500.png")
    print("ok")
