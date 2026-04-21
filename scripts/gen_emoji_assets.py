#!/usr/bin/env python3
"""
Parse firmware/desknote_hello/desknote_hello.ino for kEmoji UTF-8 rows, download
Twemoji PNGs (CC-BY 4.0), resize to RGB565, emit emoji_assets.gen.h

Run from repo root:
  python3 scripts/gen_emoji_assets.py

Requires: Pillow, network (first run). Re-run after changing the kEmoji table.
"""
from __future__ import annotations

import json
import re
import ssl
import sys
import urllib.request
from pathlib import Path

# Asset fetch uses Twemoji CDN; allow unverified TLS so `python3 scripts/...`
# works on machines without full CA bundles (CI / dev). Regenerate before release
# if you require strict verification.
def _urlopen(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "DeskNote-asset-gen"})
    ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
        return resp.read()

try:
    from PIL import Image, ImageFilter, ImageOps
except ImportError:
    print("Install Pillow: pip install Pillow", file=sys.stderr)
    sys.exit(1)

REPO = Path(__file__).resolve().parents[1]
INO = REPO / "firmware/desknote_hello/desknote_hello.ino"
OUT = REPO / "firmware/desknote_hello/emoji_assets.gen.h"
# Mirror of the firmware-supported emoji set, emitted for the web composer so
# the emoji picker only offers characters the desk can render. Regenerated
# alongside the C header so the two never drift.
OUT_TS = REPO / "lib/emoji/supported.gen.ts"

# Chunky pixel-art style: render each emoji at PIXEL_SRC native resolution,
# posterize to flatten the palette, add a 1-px outline, then upscale 2x with
# nearest-neighbor so each native pixel becomes a 2x2 block on the display.
# SPRITE stays at 20 so the existing layout (line height, xMargin, frame) is
# unchanged and the .ino needs no manual tweaks after regeneration.
SPRITE = 20
PIXEL_SRC = SPRITE // 2  # 10 — native pixel-art grid
OUTLINE_RGB = (24, 24, 24)  # near-black; pure black would collide with transparent
POSTERIZE_BITS = 3  # 8 levels per channel -> retro flat palette

TWEMOJI_BASE = (
    "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/{}.png"
)


def twemoji_filename(cp: int) -> str:
    return f"{cp:x}.png"


def parse_kemoji(path: Path) -> list[tuple[int, bytes]]:
    """Return list of (utf8_len, utf8_bytes) in file order."""
    text = path.read_text(encoding="utf-8")
    pat = re.compile(
        r"\{(\d+)\s*,\s*\{([^}]*)\}\s*,\s*\"[^\"]*\"\s*\}",
        re.MULTILINE,
    )
    rows: list[tuple[int, bytes]] = []
    for m in pat.finditer(text):
        ln = int(m.group(1))
        inner = m.group(2)
        nums = [int(x.strip(), 16) for x in inner.split(",") if "0x" in x]
        if len(nums) < ln:
            continue
        b = bytes(nums[:ln])
        rows.append((ln, b))
    return rows


def utf8_to_cp(b: bytes) -> int:
    return ord(b.decode("utf-8"))


def rgb565(r: int, g: int, b: int) -> int:
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


def png_to_rgb565(png_bytes: bytes, size: int) -> list[int]:
    """Turn a Twemoji PNG into a chunky-pixel-art RGB565 sprite.

    Pipeline: LANCZOS downsample to PIXEL_SRC, posterize the RGB channels,
    dilate alpha 1 px to build an outline mask, NEAREST upscale 2x to `size`.
    """
    im = Image.open(__import__("io").BytesIO(png_bytes)).convert("RGBA")
    native = im.resize((PIXEL_SRC, PIXEL_SRC), Image.Resampling.LANCZOS)

    r, g, b, alpha = native.split()
    rgb_flat = ImageOps.posterize(Image.merge("RGB", (r, g, b)), POSTERIZE_BITS)
    # MaxFilter(3) dilates opaque region 1 px outward. The diff vs. the original
    # alpha is the outline ring.
    dilated = alpha.filter(ImageFilter.MaxFilter(3))

    composed = Image.new("RGBA", (PIXEL_SRC, PIXEL_SRC), (0, 0, 0, 0))
    for y in range(PIXEL_SRC):
        for x in range(PIXEL_SRC):
            a = alpha.getpixel((x, y))
            if a >= 128:
                pr, pg, pb = rgb_flat.getpixel((x, y))
                composed.putpixel((x, y), (pr, pg, pb, 255))
            elif dilated.getpixel((x, y)) >= 80:
                composed.putpixel((x, y), (*OUTLINE_RGB, 255))

    big = composed.resize((size, size), Image.Resampling.NEAREST)
    out: list[int] = []
    for y in range(size):
        for x in range(size):
            pr, pg, pb, pa = big.getpixel((x, y))
            if pa < 128:
                out.append(0)
                continue
            v = rgb565(pr, pg, pb)
            # 0x0000 is our transparent sentinel — bump any opaque pixel that
            # quantizes to pure black up to the nearest non-zero dark value so
            # outlines don't vanish.
            if v == 0:
                v = 0x0841
            out.append(v)
    return out


def fetch_png(cp: int) -> bytes:
    url = TWEMOJI_BASE.format(twemoji_filename(cp).replace(".png", ""))
    return _urlopen(url)


def main() -> None:
    rows = parse_kemoji(INO)
    if not rows:
        print("No kEmoji rows parsed from", INO, file=sys.stderr)
        sys.exit(1)

    cps_in_order: list[int] = []
    for ln, b in rows:
        cps_in_order.append(utf8_to_cp(b))

    unique_cps = []
    seen: set[int] = set()
    for cp in cps_in_order:
        if cp not in seen:
            seen.add(cp)
            unique_cps.append(cp)

    cp_to_uid: dict[int, int] = {cp: i for i, cp in enumerate(unique_cps)}

    print(
        f"Parsed {len(rows)} emoji rows, {len(unique_cps)} unique codepoints, "
        f"{SPRITE}x{SPRITE} RGB565 sprites",
        file=sys.stderr,
    )

    sprite_pixels: list[list[int]] = []
    def synth_em_dash() -> list[int]:
        pix = [rgb565(0, 0, 0)] * (SPRITE * SPRITE)
        mid = SPRITE // 2
        for x in range(3, SPRITE - 3):
            pix[mid * SPRITE + x] = rgb565(200, 200, 200)
        return pix

    for i, cp in enumerate(unique_cps):
        try:
            if cp == 0x2014:
                pix = synth_em_dash()
            else:
                png = fetch_png(cp)
                pix = png_to_rgb565(png, SPRITE)
        except Exception as e:
            print(f"WARN: cp U+{cp:X} fetch failed ({e}), using replacement", file=sys.stderr)
            try:
                png = fetch_png(0x2753)  # question mark
                pix = png_to_rgb565(png, SPRITE)
            except Exception:
                pix = [rgb565(80, 80, 80)] * (SPRITE * SPRITE)
        sprite_pixels.append(pix)
        print(f"  [{i+1}/{len(unique_cps)}] U+{cp:X}", file=sys.stderr)

    row_sprite_idx = [cp_to_uid[cp] for cp in cps_in_order]

    lines: list[str] = [
        "/* AUTO-GENERATED by scripts/gen_emoji_assets.py — do not edit. */",
        "/* Twemoji artwork © Twitter, Inc. / CC-BY 4.0 */",
        "#ifndef DESKNOTE_EMOJI_ASSETS_GEN_H",
        "#define DESKNOTE_EMOJI_ASSETS_GEN_H",
        "#include <stdint.h>",
        "",
        f"#define EMOJI_SPRITE_PX {SPRITE}",
        f"#define EMOJI_UNIQUE_SPRITES {len(unique_cps)}",
        f"#define EMOJI_TABLE_ROWS {len(rows)}",
        "",
        f"static const uint16_t kEmojiSpriteData[EMOJI_UNIQUE_SPRITES][EMOJI_SPRITE_PX * EMOJI_SPRITE_PX] = {{",
    ]

    for uid, pix in enumerate(sprite_pixels):
        lines.append("  {")
        for row_start in range(0, len(pix), SPRITE):
            chunk = pix[row_start : row_start + SPRITE]
            hexes = ", ".join(f"0x{v:04X}" for v in chunk)
            lines.append(f"    {hexes},")
        lines.append("  },")

    lines.append("};")
    lines.append("")
    lines.append("static const uint8_t kEmojiRowSpriteIdx[EMOJI_TABLE_ROWS] = {")
    buf: list[str] = []
    col = 0
    for v in row_sprite_idx:
        s = str(v)
        if buf and col + len(s) + 2 > 100:
            lines.append("  " + ", ".join(buf) + ",")
            buf = []
            col = 0
        buf.append(s)
        col += len(s) + 2
    if buf:
        lines.append("  " + ", ".join(buf))
    lines.append("};")
    lines.append("")
    lines.append("#endif")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Wrote", OUT, file=sys.stderr)

    # Mirror the supported-emoji list (in kEmoji table order) into a TS module
    # for the web composer's emoji picker. Keys: unicode char + codepoint hex
    # so the UI can render the OS's own emoji next to a `U+XXXX` title.
    ts_lines: list[str] = [
        "// AUTO-GENERATED by scripts/gen_emoji_assets.py — do not edit.",
        "// Mirrors kEmoji in firmware/desknote_hello/desknote_hello.ino so the",
        "// composer only exposes emoji the desk can actually render.",
        "",
        "export type SupportedEmoji = { char: string; cp: string };",
        "",
        "export const SUPPORTED_EMOJI: SupportedEmoji[] = [",
    ]
    seen_chars: set[str] = set()
    for cp in cps_in_order:
        ch = chr(cp)
        if ch in seen_chars:
            continue
        seen_chars.add(ch)
        ts_lines.append(f"  {{ char: {json.dumps(ch)}, cp: 'U+{cp:X}' }},")
    ts_lines.append("];")
    ts_lines.append("")
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text("\n".join(ts_lines), encoding="utf-8")
    print("Wrote", OUT_TS, file=sys.stderr)


if __name__ == "__main__":
    main()
