#!/usr/bin/env python3
"""Post-process nano-banana raw generations into clean Cogherence game icons.

For each raw image: trim any uniform near-white frame the generator sometimes
adds, pad to a centered square on pure black, and emit:
  - public/icons/<name>.png            256px, black bg (drops onto the dark UI)
  - public/icons/transparent/<name>.png 256px, RGBA (black keyed to alpha)
Plus a favicon + apple-touch-icon from the logo, and a labeled contact sheet.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "generated_imgs"
OUT = ROOT / "public" / "icons"
OUT_T = OUT / "transparent"
OUT.mkdir(parents=True, exist_ok=True)
OUT_T.mkdir(parents=True, exist_ok=True)

# name -> raw filename, in display order
SRC = {
    "mineral-c":  "generated-2026-06-05T23-07-21-612Z-4e2e6x.png",
    "mineral-o":  "generated-2026-06-05T23-04-11-060Z-5wn03a.png",
    "mineral-ge": "generated-2026-06-05T23-04-15-928Z-ual5db.png",
    "mineral-s":  "generated-2026-06-05T23-04-21-289Z-3z8ijr.png",
    "heart":      "generated-2026-06-05T23-04-26-544Z-hxocqt.png",
    "energy":     "generated-2026-06-05T23-04-31-649Z-8ofudj.png",
    "coherence":  "generated-2026-06-05T23-05-00-650Z-w8cbmw.png",
    "align":      "generated-2026-06-05T23-05-05-629Z-dar3pl.png",
    "exploit":    "generated-2026-06-05T23-05-11-004Z-di1nmz.png",
    "deal":       "generated-2026-06-05T23-05-16-231Z-z7gafa.png",
    "logo":       "generated-2026-06-05T23-05-21-339Z-bqggvi.png",
}
LABELS = {
    "mineral-c": "C", "mineral-o": "O", "mineral-ge": "Ge", "mineral-s": "S",
    "heart": "Heart", "energy": "Energy", "coherence": "Coherence",
    "align": "Align", "exploit": "Exploit", "deal": "Deal", "logo": "Logo",
}
SIZE = 256


def trim_white_border(img: Image.Image) -> Image.Image:
    """Crop away any fully near-white frame rows/cols around the edges."""
    a = np.asarray(img)
    h, w, _ = a.shape
    white = a.min(axis=2) > 235  # per-pixel: near-white on all channels
    top, bottom, left, right = 0, h - 1, 0, w - 1
    while top < bottom and white[top].all():
        top += 1
    while bottom > top and white[bottom].all():
        bottom -= 1
    while left < right and white[:, left].all():
        left += 1
    while right > left and white[:, right].all():
        right -= 1
    return img.crop((left, top, right + 1, bottom + 1))


def pad_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = max(w, h)
    canvas = Image.new("RGB", (s, s), (0, 0, 0))
    canvas.paste(img, ((s - w) // 2, (s - h) // 2))
    return canvas


def to_transparent(rgb: Image.Image) -> Image.Image:
    """Key pure black to alpha via brightness; glow stays opaque, glass bodies stay
    present (not see-through) so the icons read well at small HUD sizes."""
    a = np.asarray(rgb).astype(np.float32)
    alpha = np.clip(a.max(axis=2) * 2.1, 0, 255).astype(np.uint8)
    boosted = np.clip(a * 1.08, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([boosted, alpha]))


clean: dict[str, Image.Image] = {}
for name, fname in SRC.items():
    raw = Image.open(RAW / fname).convert("RGB")
    sq = pad_square(trim_white_border(raw)).resize((SIZE, SIZE), Image.LANCZOS)
    sq.save(OUT / f"{name}.png")
    to_transparent(sq).save(OUT_T / f"{name}.png")
    clean[name] = sq
    print(f"  {name:11s} <- {fname}")

# Favicon + apple-touch from the logo
logo_rgb = clean["logo"]
to_transparent(logo_rgb).resize((64, 64), Image.LANCZOS).save(ROOT / "public" / "favicon.png")
logo_rgb.resize((180, 180), Image.LANCZOS).save(ROOT / "public" / "apple-touch-icon.png")
print("  favicon.png + apple-touch-icon.png <- logo")

# Labeled contact sheet for preview
cols, cell, pad, label_h = 4, 256, 24, 34
rows = (len(SRC) + cols - 1) // cols
W = cols * cell + (cols + 1) * pad
H = rows * (cell + label_h) + (rows + 1) * pad
sheet = Image.new("RGB", (W, H), (7, 7, 12))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22)
except OSError:
    font = ImageFont.load_default()
for i, name in enumerate(SRC):
    r, c = divmod(i, cols)
    x = pad + c * (cell + pad)
    y = pad + r * (cell + label_h + pad)
    sheet.paste(clean[name], (x, y))
    txt = LABELS[name]
    tw = draw.textlength(txt, font=font)
    draw.text((x + (cell - tw) / 2, y + cell + 6), txt, fill=(200, 200, 215), font=font)
sheet.save(OUT / "_contact-sheet.png")
print(f"  contact sheet {W}x{H}")
print("done.")
