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
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps
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

# Sprite resolution. 40 px native gives MDI line-art enough room for the
# eyes/mouth/etc. to survive the bitmap conversion; at 20 the strokes collapse
# into an undifferentiated blob on a 2.8" display. The firmware draws sprites
# at scale=1 so each native pixel == one screen pixel — keep this in sync with
# kEmojiNotePx in desknote_hello.ino if you change it.
SPRITE = 40
PIXEL_SRC = SPRITE // 2  # 20 — native pixel-art grid (Twemoji path only)
OUTLINE_RGB = (24, 24, 24)  # near-black; pure black would collide with transparent
POSTERIZE_BITS = 3  # 8 levels per channel -> retro flat palette

TWEMOJI_BASE = (
    "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/{}.png"
)

# Material Design Icons webfont — used for Private Use Area glyphs (U+F0000..+
# range) that Twemoji can't supply. The TTF is cached so we only hit the CDN
# on the first run. "latest" pins to whatever @mdi/font currently ships; tag
# it explicitly if reproducible builds matter more than staying current.
MDI_TTF_URL = (
    "https://cdn.jsdelivr.net/npm/@mdi/font@latest/fonts/materialdesignicons-webfont.ttf"
)
MDI_TTF_CACHE = REPO / ".cache/materialdesignicons-webfont.ttf"
# Any cp in this range is rendered from the MDI font instead of Twemoji.
MDI_PUA_START = 0xF0000
MDI_PUA_END = 0xFFFFD

# Friendly labels for MDI glyphs the picker exposes. Keys must stay in sync
# with the PUA codepoints listed in firmware/desknote_hello.ino's kEmoji[].
MDI_NAMES: dict[int, str] = {
    0xF0C72: "kiss",
    0xF0C6D: "cry",
    0xF01F7: "poop",
    0xF0C78: "wink",
    0xF01F9: "tongue",
    0xF0C74: "neutral",
    0xF02D2: "heart",
    0xF0BE3: "you",
    0xF10F1: "hug",
    0xF1211: "battery",
    0xF024A: "flower",
    0xF1C73: "tree",
    0xF0592: "rain",
    0xF05A8: "sun",
    0xF059A: "dusk",
}


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


def ensure_mdi_ttf() -> Path:
    """Download MDI webfont once, cache under .cache/ next to the repo."""
    if MDI_TTF_CACHE.exists() and MDI_TTF_CACHE.stat().st_size > 100_000:
        return MDI_TTF_CACHE
    print("Fetching MDI webfont...", file=sys.stderr)
    data = _urlopen(MDI_TTF_URL)
    MDI_TTF_CACHE.parent.mkdir(parents=True, exist_ok=True)
    MDI_TTF_CACHE.write_bytes(data)
    return MDI_TTF_CACHE


def render_mdi_sprite(cp: int, size: int = SPRITE) -> list[int]:
    """Render an MDI line-art glyph directly to a single-tone RGB565 sprite.

    Goal: match what the frontend shows when it uses the MDI webfont — a
    crisp, single-color glyph (text-plum-500) with the cream background
    visible through any negative space. We render the glyph 4× super-sampled,
    LANCZOS-down to 2× for AA, then NEAREST-down to native size so per-pixel
    edges stay sharp. Alpha is thresholded into a 1-bit mask: above the
    threshold becomes the plum fill, below stays transparent. The firmware
    drawEmojiSprite tints opaque pixels to the active text color, which keeps
    the glyph in lockstep with whatever theme palette is loaded.
    """
    SS = size * 4
    ttf_path = str(ensure_mdi_ttf())
    # MDI glyphs ship with ~6% padding inside the em box; nudge the font size
    # so the actual icon nearly fills the sprite (more visible features at
    # the cost of a tiny bit of tile padding).
    font = ImageFont.truetype(ttf_path, int(SS * 0.95))
    canvas = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    ch = chr(cp)
    bbox = draw.textbbox((0, 0), ch, font=font)
    gw = bbox[2] - bbox[0]
    gh = bbox[3] - bbox[1]
    x = (SS - gw) // 2 - bbox[0]
    y = (SS - gh) // 2 - bbox[1]
    draw.text((x, y), ch, font=font, fill=(0, 0, 0, 255))

    # 4× → 2× LANCZOS (smooth AA), 2× → 1× NEAREST (crisp pixel edges).
    half = canvas.resize((size * 2, size * 2), Image.Resampling.LANCZOS)
    small = half.resize((size, size), Image.Resampling.NEAREST)

    # Single-tone palette: matches frontend's text-plum-500 (#4E353D ≈ RGB
    # 78,53,61). drawEmojiSprite re-tints opaque pixels at draw time, so this
    # value is really just a "non-zero opaque" sentinel — pick something
    # close to the theme so previews look right.
    FILL = (78, 53, 61)
    fill_v = rgb565(*FILL) or 0x0841

    alpha = small.split()[3]
    out: list[int] = []
    for yy in range(size):
        for xx in range(size):
            a = alpha.getpixel((xx, yy))
            # Hard-threshold alpha so we never get half-opaque "ghost" pixels
            # bleeding into the cream background; AA happened during the
            # earlier LANCZOS step, the NEAREST cycle is just for the bitmap.
            out.append(fill_v if a >= 80 else 0)
    return out


def fetch_glyph_png(cp: int) -> bytes:
    """For Twemoji codepoints only — MDI takes a different code path in main()."""
    return fetch_png(cp)


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
            elif MDI_PUA_START <= cp <= MDI_PUA_END:
                pix = render_mdi_sprite(cp, SPRITE)
            else:
                png = fetch_glyph_png(cp)
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
        "export type SupportedEmoji = {",
        "  char: string;",
        "  cp: string;",
        "  /** Short label shown in the picker; falls back to the codepoint. */",
        "  name?: string;",
        "  /** True when the glyph lives in the MDI Private Use Area and",
        "   *  needs the MDI webfont to render. */",
        "  mdi?: boolean;",
        "};",
        "",
        "export const SUPPORTED_EMOJI: SupportedEmoji[] = [",
    ]
    seen_chars: set[str] = set()
    for cp in cps_in_order:
        ch = chr(cp)
        if ch in seen_chars:
            continue
        seen_chars.add(ch)
        is_mdi = MDI_PUA_START <= cp <= MDI_PUA_END
        name = MDI_NAMES.get(cp)
        bits = [f"char: {json.dumps(ch)}", f"cp: 'U+{cp:X}'"]
        if name:
            bits.append(f"name: {json.dumps(name)}")
        if is_mdi:
            bits.append("mdi: true")
        ts_lines.append("  { " + ", ".join(bits) + " },")
    ts_lines.append("];")
    ts_lines.append("")
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text("\n".join(ts_lines), encoding="utf-8")
    print("Wrote", OUT_TS, file=sys.stderr)


if __name__ == "__main__":
    main()
