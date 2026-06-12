#!/usr/bin/env python3
"""
Parse firmware/desknote_main/desknote_main.ino for kEmoji UTF-8 rows, render
MDI webfont glyphs (Twemoji PNGs for non-PUA codepoints), pack 1-bit-per-pixel
sprites + animation frames, emit emoji_assets.gen.h and the web picker list.

Run from repo root:
  python3 scripts/gen_emoji_assets.py

Requires: Pillow, network (first run). Re-run after changing the kEmoji table.

Sprite format (v2): 1 bpp silhouettes — the firmware tints set bits to the
theme color at draw time, so color is never stored. 40x40 px = 200 bytes per
frame (the old RGB565 format was 3200 bytes). Selected glyphs also get extra
animation frames (pulse / wiggle / bounce) that the firmware ping-pongs
through; see ANIMATIONS below and tickEmojiAnimations() in the sketch.
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
INO = REPO / "firmware/desknote_main/desknote_main.ino"
OUT = REPO / "firmware/desknote_main/emoji_assets.gen.h"
# Mirror of the firmware-supported emoji set, emitted for the web composer so
# the emoji picker only offers characters the desk can render. Regenerated
# alongside the C header so the two never drift.
OUT_TS = REPO / "lib/emoji/supported.gen.ts"

# Sprite resolution. 40 px native gives MDI line-art enough room for the
# eyes/mouth/etc. to survive the bitmap conversion. The firmware draws sprites
# at scale=1 so each native pixel == one screen pixel.
SPRITE = 40
SPRITE_BYTES = SPRITE * SPRITE // 8
PIXEL_SRC = SPRITE // 2  # 20 — native pixel-art grid (Twemoji path only)

TWEMOJI_BASE = (
    "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/{}.png"
)

# Material Design Icons webfont — used for Private Use Area glyphs (U+F0000..+
# range) that Twemoji can't supply. The TTF is cached so we only hit the CDN
# on the first run.
MDI_TTF_URL = (
    "https://cdn.jsdelivr.net/npm/@mdi/font@latest/fonts/materialdesignicons-webfont.ttf"
)
MDI_TTF_CACHE = REPO / ".cache/materialdesignicons-webfont.ttf"
MDI_PUA_START = 0xF0000
MDI_PUA_END = 0xFFFFD

# Friendly labels for MDI glyphs the picker exposes. Keys must stay in sync
# with the PUA codepoints listed in firmware/desknote_main's kEmoji[].
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
    0xF0D08: "poppy",
    0xF0FA1: "bee",
    0xF0A43: "dog",
    0xF011B: "cat",
    0xF07C6: "elephant",
    0xF01C1: "usd",
    0xF03D8: "palette",
    0xF0785: "sticker",
    0xF0198: "cookie",
    0xF0BAD: "1-up",
    0xF0BC9: "alien",
    0xF1818: "bath",
    0xF0387: "music",
    0xF0973: "om",
    0xF02D1: "heart-line",
    0xF0A1C: "vintage",
    0xF04CE: "star",
    0xF0176: "coffee",
    0xF00EB: "cake",
    0xF02A1: "gift",
    0xF0A26: "balloon",
    0xF0594: "moon",
    0xF0238: "fire",
    0xF0409: "pizza",
    0xF03E9: "paw",
    0xF001D: "plane",
    0xF054A: "umbrella",
    0xF02A0: "ghost",
    0xF06E8: "bulb",
    0xF14DE: "rocket",
    0xF0717: "snowflake",
    0xF1589: "butterfly",
    0xF15C6: "bird",
    0xF18FB: "teddy",
    0xF0FCE: "movie",
    0xF0297: "game",
    0xF07B2: "chili",
    0xF13B5: "lipstick",
    0xF0FD4: "bed",
    0xF0876: "wine",
    0xF0356: "cocktail",
    0xF1042: "cherries",
    0xF05E2: "candle",
    0xF0A56: "hearts",
    0xF05F6: "heartbeat",
    0xF0828: "hot-tub",
    0xF15FB: "dance",
    0xF15C9: "dancer",
}

# Picker categories (web UI only — the desk renders everything the same).
# Ids are emitted into supported.gen.ts; labels/order live in the picker
# component. Anything unlisted falls back to "fun".
EMOJI_CATEGORY: dict[int, str] = {
    # love
    0xF02D2: "love", 0xF02D1: "love", 0xF0BE3: "love", 0xF10F1: "love",
    0xF1211: "love", 0xF0A56: "love", 0xF05F6: "love", 0xF0C72: "love",
    # spicy / date night
    0xF07B2: "spicy", 0xF13B5: "spicy", 0xF0FD4: "spicy", 0xF0876: "spicy",
    0xF0356: "spicy", 0xF1042: "spicy", 0xF05E2: "spicy", 0xF0828: "spicy",
    0xF15FB: "spicy", 0xF15C9: "spicy",
    # faces
    0xF0C6D: "faces", 0xF0C78: "faces", 0xF01F9: "faces", 0xF0C74: "faces",
    0xF01F7: "faces",
    # animals
    0xF0FA1: "animals", 0xF0A43: "animals", 0xF011B: "animals",
    0xF07C6: "animals", 0xF15C6: "animals", 0xF1589: "animals",
    0xF03E9: "animals", 0xF18FB: "animals",
    # nature
    0xF024A: "nature", 0xF1C73: "nature", 0xF0592: "nature", 0xF05A8: "nature",
    0xF059A: "nature", 0xF0D08: "nature", 0xF0594: "nature", 0xF0717: "nature",
    0xF0238: "nature", 0xF054A: "nature",
    # food & drink
    0xF0198: "food", 0xF00EB: "food", 0xF0176: "food", 0xF0409: "food",
    # everyday
    0xF01C1: "everyday", 0xF0973: "everyday", 0xF1818: "everyday",
    0xF001D: "everyday", 0xF06E8: "everyday",
    # fun (also the fallback): star, gift, balloon, 1-up, alien, game, movie,
    # film, music, sticker, palette, rocket, ghost
}

# Animated glyphs: extra frames the firmware ping-pongs through
# (base -> f1 -> f2 -> f1 -> base ...). Transforms are applied at render time:
#   scale — glyph shrinks toward center (pulse / heartbeat / flicker)
#   rot   — degrees around center (wiggle / flutter)
#   dy    — vertical shift in final pixels, negative = up (bounce / float)
PULSE = [{"scale": 0.85}, {"scale": 0.70}]
WIGGLE = [{"rot": 12.0}, {"rot": -12.0}]
BOUNCE = [{"dy": -2}, {"dy": -5}]

ANIMATIONS: dict[int, list[dict]] = {
    0xF02D1: PULSE,   # heart-line — heartbeat
    0xF02D2: PULSE,   # heart(box)
    0xF0C72: PULSE,   # kiss
    0xF10F1: PULSE,   # hug
    0xF0238: PULSE,   # fire — flicker
    0xF04CE: PULSE,   # star — twinkle
    0xF0FA1: WIGGLE,  # bee
    0xF05A8: WIGGLE,  # sun
    0xF1589: WIGGLE,  # butterfly — flutter
    0xF0387: BOUNCE,  # music note
    0xF0A26: BOUNCE,  # balloon — float
    0xF14DE: BOUNCE,  # rocket
    0xF07B2: WIGGLE,  # chili — too hot to sit still
    0xF13B5: PULSE,   # lipstick
    0xF1042: BOUNCE,  # cherries
    0xF05E2: PULSE,   # candle — flicker
    0xF0A56: PULSE,   # heart-multiple
    0xF05F6: PULSE,   # heart-pulse — literal heartbeat
    0xF15FB: WIGGLE,  # ballroom dance
    0xF15C9: WIGGLE,  # dancer
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


def png_to_bits(png_bytes: bytes, size: int) -> list[int]:
    """Twemoji PNG -> 1bpp silhouette (alpha + 1px outline dilation)."""
    im = Image.open(__import__("io").BytesIO(png_bytes)).convert("RGBA")
    native = im.resize((PIXEL_SRC, PIXEL_SRC), Image.Resampling.LANCZOS)
    alpha = native.split()[3]
    dilated = alpha.filter(ImageFilter.MaxFilter(3))

    mask = Image.new("L", (PIXEL_SRC, PIXEL_SRC), 0)
    for y in range(PIXEL_SRC):
        for x in range(PIXEL_SRC):
            if alpha.getpixel((x, y)) >= 128 or dilated.getpixel((x, y)) >= 80:
                mask.putpixel((x, y), 255)

    big = mask.resize((size, size), Image.Resampling.NEAREST)
    return [1 if big.getpixel((x, y)) >= 128 else 0
            for y in range(size) for x in range(size)]


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


def render_mdi_bits(cp: int, size: int = SPRITE, scale: float = 1.0,
                    rot: float = 0.0, dy: int = 0) -> list[int]:
    """Render an MDI line-art glyph to a 1bpp silhouette.

    Render 4x super-sampled, LANCZOS-down to 2x for AA, then NEAREST-down to
    native size so per-pixel edges stay sharp. Alpha is hard-thresholded into
    the bitmask; the firmware tints set bits to the theme text color, so no
    color is stored. scale/rot/dy produce the animation frames.
    """
    SS = size * 4
    ttf_path = str(ensure_mdi_ttf())
    # MDI glyphs ship with ~6% padding inside the em box; nudge the font size
    # so the actual icon nearly fills the sprite.
    font = ImageFont.truetype(ttf_path, int(SS * 0.95 * scale))
    canvas = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    ch = chr(cp)
    bbox = draw.textbbox((0, 0), ch, font=font)
    gw = bbox[2] - bbox[0]
    gh = bbox[3] - bbox[1]
    x = (SS - gw) // 2 - bbox[0]
    y = (SS - gh) // 2 - bbox[1]
    draw.text((x, y), ch, font=font, fill=(0, 0, 0, 255))

    if rot:
        canvas = canvas.rotate(rot, resample=Image.Resampling.BICUBIC,
                               center=(SS / 2, SS / 2))

    # 4x -> 2x LANCZOS (smooth AA), 2x -> 1x NEAREST (crisp pixel edges).
    half = canvas.resize((size * 2, size * 2), Image.Resampling.LANCZOS)
    small = half.resize((size, size), Image.Resampling.NEAREST)

    if dy:
        shifted = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        shifted.paste(small, (0, dy))
        small = shifted

    alpha = small.split()[3]
    return [1 if alpha.getpixel((xx, yy)) >= 80 else 0
            for yy in range(size) for xx in range(size)]


def pack_bits(bits: list[int]) -> list[int]:
    """Pack pixel bits LSB-first into bytes (matches emojiBitSet in firmware)."""
    out = [0] * SPRITE_BYTES
    for i, b in enumerate(bits):
        if b:
            out[i >> 3] |= 1 << (i & 7)
    return out


def emit_byte_array(lines: list[str], data: list[int], per_line: int = 20) -> None:
    lines.append("  {")
    for start in range(0, len(data), per_line):
        chunk = data[start : start + per_line]
        lines.append("    " + ", ".join(f"0x{v:02X}" for v in chunk) + ",")
    lines.append("  },")


def main() -> None:
    rows = parse_kemoji(INO)
    if not rows:
        print("No kEmoji rows parsed from", INO, file=sys.stderr)
        sys.exit(1)

    cps_in_order: list[int] = [utf8_to_cp(b) for _, b in rows]

    unique_cps: list[int] = []
    seen: set[int] = set()
    for cp in cps_in_order:
        if cp not in seen:
            seen.add(cp)
            unique_cps.append(cp)

    cp_to_uid: dict[int, int] = {cp: i for i, cp in enumerate(unique_cps)}

    print(
        f"Parsed {len(rows)} emoji rows, {len(unique_cps)} unique codepoints, "
        f"{SPRITE}x{SPRITE} 1bpp sprites",
        file=sys.stderr,
    )

    base_sprites: list[list[int]] = []      # packed bytes, frame 0 per uid
    anim_frames: list[list[int]] = []       # packed bytes, flattened extras
    anim_start: list[int] = []              # per uid: index into anim_frames
    anim_count: list[int] = []              # per uid: number of extra frames

    for i, cp in enumerate(unique_cps):
        is_mdi = MDI_PUA_START <= cp <= MDI_PUA_END
        try:
            if is_mdi:
                bits = render_mdi_bits(cp)
            else:
                bits = png_to_bits(fetch_png(cp), SPRITE)
        except Exception as e:
            print(f"WARN: cp U+{cp:X} render failed ({e}), blank sprite",
                  file=sys.stderr)
            bits = [0] * (SPRITE * SPRITE)
        base_sprites.append(pack_bits(bits))

        frames = ANIMATIONS.get(cp, []) if is_mdi else []
        anim_start.append(len(anim_frames))
        anim_count.append(len(frames))
        for f in frames:
            fb = render_mdi_bits(cp, scale=f.get("scale", 1.0),
                                 rot=f.get("rot", 0.0), dy=f.get("dy", 0))
            anim_frames.append(pack_bits(fb))
        tag = f" (+{len(frames)} anim)" if frames else ""
        print(f"  [{i+1}/{len(unique_cps)}] U+{cp:X}{tag}", file=sys.stderr)

    row_sprite_idx = [cp_to_uid[cp] for cp in cps_in_order]

    lines: list[str] = [
        "/* AUTO-GENERATED by scripts/gen_emoji_assets.py — do not edit. */",
        "/* Twemoji artwork © Twitter, Inc. / CC-BY 4.0; MDI glyphs © Pictogrammers / Apache-2.0 */",
        "#ifndef DESKNOTE_EMOJI_ASSETS_GEN_H",
        "#define DESKNOTE_EMOJI_ASSETS_GEN_H",
        "#include <stdint.h>",
        "",
        f"#define EMOJI_SPRITE_PX {SPRITE}",
        f"#define EMOJI_SPRITE_BYTES {SPRITE_BYTES}",
        f"#define EMOJI_UNIQUE_SPRITES {len(unique_cps)}",
        f"#define EMOJI_TABLE_ROWS {len(rows)}",
        f"#define EMOJI_ANIM_TOTAL_FRAMES {max(len(anim_frames), 1)}",
        "",
        "/* 1bpp silhouettes, LSB-first within each byte (see emojiBitSet). */",
        "static const uint8_t kEmojiSpriteData[EMOJI_UNIQUE_SPRITES][EMOJI_SPRITE_BYTES] = {",
    ]
    for sprite in base_sprites:
        emit_byte_array(lines, sprite)
    lines.append("};")
    lines.append("")
    lines.append("/* Extra animation frames (pulse / wiggle / bounce), flattened. */")
    lines.append("static const uint8_t kEmojiAnimFrames[EMOJI_ANIM_TOTAL_FRAMES][EMOJI_SPRITE_BYTES] = {")
    if anim_frames:
        for frame in anim_frames:
            emit_byte_array(lines, frame)
    else:
        emit_byte_array(lines, [0] * SPRITE_BYTES)
    lines.append("};")
    lines.append("")
    lines.append("/* Per-sprite: first index into kEmojiAnimFrames / number of extra frames. */")
    lines.append("static const uint8_t kEmojiAnimStart[EMOJI_UNIQUE_SPRITES] = {")
    lines.append("  " + ", ".join(str(v) for v in anim_start))
    lines.append("};")
    lines.append("static const uint8_t kEmojiAnimCount[EMOJI_UNIQUE_SPRITES] = {")
    lines.append("  " + ", ".join(str(v) for v in anim_count))
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
    # for the web composer's emoji picker.
    ts_lines: list[str] = [
        "// AUTO-GENERATED by scripts/gen_emoji_assets.py — do not edit.",
        "// Mirrors kEmoji in firmware/desknote_main/desknote_main.ino so the",
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
        "  /** True when the desk animates this emoji (pulse/wiggle/bounce). */",
        "  animated?: boolean;",
        "  /** Picker category id (label/order defined in the picker UI). */",
        "  category: string;",
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
        if cp in ANIMATIONS:
            bits.append("animated: true")
        bits.append(f"category: {json.dumps(EMOJI_CATEGORY.get(cp, 'fun'))}")
        ts_lines.append("  { " + ", ".join(bits) + " },")
    ts_lines.append("];")
    ts_lines.append("")
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text("\n".join(ts_lines), encoding="utf-8")
    print("Wrote", OUT_TS, file=sys.stderr)


if __name__ == "__main__":
    main()
