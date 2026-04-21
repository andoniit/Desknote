#!/usr/bin/env python3
"""
Render the generated emoji_assets.gen.h sprites back into a PNG grid so we can
eyeball how pixelated they came out without flashing the firmware.

Usage:
  python3 scripts/preview_emoji_sprites.py [out.png]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install Pillow", file=sys.stderr)
    sys.exit(1)

REPO = Path(__file__).resolve().parents[1]
HDR = REPO / "firmware/desknote_hello/emoji_assets.gen.h"
OUT_DEFAULT = REPO / "docs/emoji_preview.png"

# Upscale each sprite to this many px per side in the preview so the pixel grid
# is readable at screenshot size. 8 means a 20x20 sprite renders at 160x160.
ZOOM = 8
COLS = 12
PAD = 4
BG = (200, 200, 200)


def rgb565_to_rgb(v: int) -> tuple[int, int, int]:
    r = ((v >> 11) & 0x1F) * 255 // 31
    g = ((v >> 5) & 0x3F) * 255 // 63
    b = (v & 0x1F) * 255 // 31
    return r, g, b


def main() -> None:
    if not HDR.exists():
        print(f"Header not found: {HDR}", file=sys.stderr)
        sys.exit(1)
    text = HDR.read_text(encoding="utf-8")

    size_m = re.search(r"EMOJI_SPRITE_PX\s+(\d+)", text)
    count_m = re.search(r"EMOJI_UNIQUE_SPRITES\s+(\d+)", text)
    if not size_m or not count_m:
        print("Could not parse header constants.", file=sys.stderr)
        sys.exit(1)
    size = int(size_m.group(1))
    count = int(count_m.group(1))

    hex_values = [int(v, 16) for v in re.findall(r"0x[0-9A-Fa-f]{4}", text)]
    pixels_per_sprite = size * size
    expected = count * pixels_per_sprite
    if len(hex_values) < expected:
        print(
            f"Only found {len(hex_values)} 0x#### values, expected >= {expected}",
            file=sys.stderr,
        )
        sys.exit(1)
    hex_values = hex_values[:expected]

    rows = (count + COLS - 1) // COLS
    cell = size * ZOOM + PAD
    canvas_w = COLS * cell + PAD
    canvas_h = rows * cell + PAD
    canvas = Image.new("RGB", (canvas_w, canvas_h), BG)

    for idx in range(count):
        sprite = hex_values[idx * pixels_per_sprite : (idx + 1) * pixels_per_sprite]
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        for y in range(size):
            for x in range(size):
                v = sprite[y * size + x]
                if v == 0:
                    continue
                im.putpixel((x, y), (*rgb565_to_rgb(v), 255))
        big = im.resize((size * ZOOM, size * ZOOM), Image.Resampling.NEAREST)
        cx = PAD + (idx % COLS) * cell
        cy = PAD + (idx // COLS) * cell
        canvas.paste(big, (cx, cy), big)

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT_DEFAULT
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    print(f"Wrote {out}  ({canvas_w}x{canvas_h}, {count} sprites)")


if __name__ == "__main__":
    main()
