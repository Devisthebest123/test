"""Python port of ScanCat's fragment shader, for stills of any size.

Takes a greyscale source; returns the page-and-ink scanline picture. Cells
are `cellw` wide and `row` tall; each becomes nothing, a thin rule, a thick
rule or a block from the source brightness, over a soft ghost of the source.
"""
import random
from PIL import Image, ImageFilter

PAGE = (240, 241, 238); INK = (11, 11, 11)
WHITE, BLACK = 0.965, 0.12
T_THIN, T_THICK, T_BLOCK = 0.10, 0.42, 0.66

def scan(src, lines=104, seed=7, transparent=False, ghost=0.55):
    random.seed(seed)
    src = src.convert("L")
    W, H = src.size
    lum = src.load()
    row = max(3, round(H / lines)); cellw = round(row * 1.5); line = max(1, round(row * 0.38))
    ghost_px = src.filter(ImageFilter.GaussianBlur(row * 1.2)).load()
    im = Image.new("RGBA" if transparent else "RGB", (W, H), (0, 0, 0, 0) if transparent else PAGE)
    out = im.load()
    def L(x, y): return lum[min(W - 1, max(0, x)), min(H - 1, max(0, y))] / 255
    q = max(1, row // 4)
    for cy in range(0, H, row):
        rowjit = (random.random() - 0.5) * 0.05
        for cx in range(0, W, cellw):
            c = (cx + cellw / 2, cy + row / 2)
            s_l = 0.25 * (L(int(c[0]-q), int(c[1]-q)) + L(int(c[0]+q), int(c[1]-q)) + L(int(c[0]-q), int(c[1]+q)) + L(int(c[0]+q), int(c[1]+q)))
            s = max(0.0, min(1.0, (WHITE - s_l) / (WHITE - BLACK))) + (random.random() - 0.5) * 0.04 + rowjit
            th = row if s > T_BLOCK else line * 2 if s > T_THICK else line if s > T_THIN else 0
            top = (row - th) // 2
            for y in range(cy, min(H, cy + row)):
                on = th > 0 and top <= (y - cy) < top + th
                for x in range(cx, min(W, cx + cellw)):
                    if on:
                        out[x, y] = INK + ((255,) if transparent else ())
                    elif not transparent:
                        v = max(0.0, min(1.0, (ghost_px[x, y] / 255 - WHITE) * ghost))
                        out[x, y] = tuple(max(0, min(255, round(p + v * 255))) for p in PAGE)
    return im
