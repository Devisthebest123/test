"""Port of ScanCat's shader for stills: the hero kitten as a square PNG."""
import sys, math, random
from PIL import Image, ImageFilter

SRC = "public/media/cat-poster.jpg"
PAGE = (240, 241, 238); INK = (11, 11, 11)
WHITE, BLACK = 0.965, 0.12
T_THIN, T_THICK, T_BLOCK = 0.10, 0.42, 0.66

def render(out, size=400, crop=None, lines=80, transparent=False, seed=7):
    random.seed(seed)
    src = Image.open(SRC).convert("L")
    if crop: src = src.crop(crop)
    src = src.resize((size, size), Image.LANCZOS)
    lum = src.load()
    row = max(3, round(size / lines)); cellw = round(row * 1.5); line = max(1, round(row * 0.38))
    ghost_src = src.filter(ImageFilter.GaussianBlur(row * 1.2)).load()
    mode = "RGBA" if transparent else "RGB"
    im = Image.new(mode, (size, size), (0, 0, 0, 0) if transparent else PAGE)
    out_px = im.load()
    def L(x, y): return lum[min(size-1, max(0, x)), min(size-1, max(0, y))] / 255
    for cy in range(0, size, row):
        rowjit = (random.random() - 0.5) * 0.05
        for cx in range(0, size, cellw):
            q = max(1, row // 4)
            c = (cx + cellw / 2, cy + row / 2)
            s_l = 0.25 * (L(int(c[0]-q), int(c[1]-q)) + L(int(c[0]+q), int(c[1]-q)) + L(int(c[0]-q), int(c[1]+q)) + L(int(c[0]+q), int(c[1]+q)))
            s = max(0.0, min(1.0, (WHITE - s_l) / (WHITE - BLACK))) + (random.random() - 0.5) * 0.04 + rowjit
            th = row if s > T_BLOCK else line * 2 if s > T_THICK else line if s > T_THIN else 0
            top = (row - th) // 2
            for y in range(cy, min(size, cy + row)):
                for x in range(cx, min(size, cx + cellw)):
                    on = th > 0 and top <= (y - cy) < top + th
                    if on:
                        out_px[x, y] = INK + ((255,) if transparent else ())
                    elif not transparent:
                        g = ghost_src[x, y] / 255
                        v = max(0.0, min(1.0, (g - WHITE) * 0.55))
                        out_px[x, y] = tuple(max(0, min(255, round(p + v * 255))) for p in PAGE)
    im.save(out)
    return out

if __name__ == "__main__":
    size = int(sys.argv[1]) if len(sys.argv) > 1 else 400
    render("public/brand/cat-full.png", size)
    render("public/brand/cat-crop.png", size, crop=(180, 120, 1000, 940))
    render("public/brand/cat-crop-transparent.png", size, crop=(180, 120, 1000, 940), transparent=True)
    print("ok")
