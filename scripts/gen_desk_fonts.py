#!/usr/bin/env python3
"""Generate the anti-aliased desk fonts: Fraunces → TFT_eSPI smooth-font arrays.

    python3 scripts/gen_desk_fonts.py            # writes the header
    python3 scripts/gen_desk_fonts.py --preview  # also renders build/desk-fonts.png

The desk draws text with TFT_eSPI's "smooth fonts": the Processing .vlw
format, loaded straight from a byte array in flash with tft.loadFont(array).
TFT_eSPI's own converter is a Processing sketch; this does the same job with
Pillow, so a font change is one command on any machine with Python.

Fraunces is the app's typeface (next/font on the web), set with the same axes
the web uses: optical size following the pixel size, Softness 0, Wonky on. It
is under the SIL Open Font License 1.1 (firmware/fonts/OFL.txt), which allows
embedding it in firmware.

The .vlw layout, as TFT_eSPI's Smooth_font.cpp reads it (all big-endian int32):

    header  glyphCount, version, size, 0, ascent, descent
    glyphs  per glyph: unicode, height, width, xAdvance, dY, dX, 0
            dY = bitmap top above the baseline; dX = left bearing
    bitmaps width*height alpha bytes per glyph, in glyph order

Two properties of that loader shape what is written here. Glyphs are placed
at `cursor_y + ascent - dY`, and the loop that would raise ascent to fit tall
glyphs is commented out upstream — so the header's ascent is the tallest glyph
(accents included), or capitals like Å would be clipped. And the space glyph is
never read: TFT_eSPI guesses its width from the font size. Each font therefore
exports its real space advance for the sketch to put back after loading.
"""

import argparse
import os
import struct
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "firmware", "fonts")
ROMAN = os.path.join(FONT_DIR, "Fraunces-Variable.ttf")
ITALIC = os.path.join(FONT_DIR, "Fraunces-Italic-Variable.ttf")
OUT = os.path.join(ROOT, "firmware", "desknote_main", "desk_fonts.gen.h")

# What a note can contain: the web and app validate to plain text, and the
# desk previously drew only ASCII. Latin-1 covers accented names; the extras
# are what phone keyboards substitute automatically (smart quotes, dashes,
# ellipsis). Stickers are separate 1-bit sprites, not font glyphs.
ASCII = list(range(0x20, 0x7F))
LATIN1 = list(range(0xA0, 0x100))
# Keep in step with kSmartGlyphs in desknote_main.ino, which decides what the
# tokenizer keeps rather than replacing with '*'.
SMART = [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC, 0x2122]
TEXT = ASCII + LATIN1 + SMART
DIGITS = [ord(c) for c in "0123456789"]

# name, file, pixel size, weight, characters. Every size here is one the
# layout actually uses — each costs flash, the note sizes most of all.
FACES = [
    # The note itself, largest first: drawMessageScreen shrinks a long note
    # through these until it fits.
    ("note30", ROMAN, 30, 400, TEXT),
    ("note24", ROMAN, 24, 400, TEXT),  # also screen titles
    ("note19", ROMAN, 19, 400, TEXT),
    ("note16", ROMAN, 16, 400, TEXT),
    ("head17", ROMAN, 17, 500, ASCII),  # "DeskNote" in the header
    ("meta13", ROMAN, 13, 400, TEXT),  # hints, status, version, names
    ("foot14", ITALIC, 14, 400, TEXT),  # "— for Andon Desk" under a note
    ("digits32", ROMAN, 32, 500, DIGITS),  # the six-digit pairing code
]


def load(path, size, weight):
    font = ImageFont.truetype(path, size)
    # Axis order is the file's: Optical Size, Weight, Softness, Wonky.
    axes = font.get_variation_axes()
    names = [a["name"] if isinstance(a["name"], str) else a["name"].decode() for a in axes]
    values = []
    for name, axis in zip(names, axes):
        if name == "Optical Size":
            values.append(max(axis["minimum"], min(axis["maximum"], size)))
        elif name == "Weight":
            values.append(weight)
        elif name == "Softness":
            values.append(0)
        elif name == "Wonky":
            values.append(1)
        else:
            values.append(axis["default"])
    font.set_variation_by_axes(values)
    return font


def notdef_signature(font):
    """What this font draws for a code point it has no glyph for."""
    return glyph_bitmap(font, chr(0xE000))


def glyph_bitmap(font, ch):
    left, top, right, bottom = font.getbbox(ch, anchor="ls")
    if right <= left or bottom <= top:
        return (0, 0, 0, 0, b"")
    img = Image.new("L", (right - left, bottom - top), 0)
    ImageDraw.Draw(img).text((-left, -top), ch, font=font, fill=255, anchor="ls")
    return (right - left, bottom - top, left, -top, img.tobytes())


def build_face(name, path, size, weight, chars):
    font = load(path, size, weight)
    missing = notdef_signature(font)
    glyphs = []
    skipped = []
    for cp in chars:
        ch = chr(cp)
        width, height, dx, dy, bitmap = glyph_bitmap(font, ch)
        if cp != 0x20 and bitmap and (width, height, dx, dy, bitmap) == missing:
            skipped.append(cp)
            continue
        advance = int(round(font.getlength(ch)))
        if width > 255 or height > 255 or advance > 255 or not -128 <= dx <= 127:
            sys.exit(f"{name}: U+{cp:04X} does not fit the .vlw field sizes")
        glyphs.append((cp, height, width, advance, dy, dx, bitmap))

    glyphs.sort(key=lambda g: g[0])
    ascent = max(g[4] for g in glyphs if g[1])
    descent = max(g[1] - g[4] for g in glyphs if g[1])

    out = bytearray(struct.pack(">6i", len(glyphs), 11, size, 0, ascent, descent))
    for cp, height, width, advance, dy, dx, _ in glyphs:
        out += struct.pack(">7i", cp, height, width, advance, dy, dx, 0)
    for *_, bitmap in glyphs:
        out += bitmap

    space = int(round(font.getlength(" ")))
    return {"name": name, "size": size, "data": bytes(out), "space": space,
            "ascent": ascent, "descent": descent, "count": len(glyphs), "skipped": skipped}


def write_header(faces):
    lines = [
        "// Generated by scripts/gen_desk_fonts.py — do not edit by hand.",
        "//",
        "// Fraunces (SIL Open Font License 1.1, firmware/fonts/OFL.txt) as TFT_eSPI",
        "// smooth fonts. Load with tft.loadFont(kFont_x) then put the real space",
        "// width back: tft.gFont.spaceWidth = kFontSpace_x (see useFont()).",
        "#pragma once",
        "#include <stdint.h>",
        "",
    ]
    total = 0
    for f in faces:
        total += len(f["data"])
        lines.append(
            f"// {f['name']}: {f['size']} px, {f['count']} glyphs, "
            f"ascent {f['ascent']}, descent {f['descent']}, {len(f['data'])} bytes")
        lines.append(f"static constexpr uint8_t kFontSpace_{f['name']} = {f['space']};")
        lines.append(f"static const uint8_t kFont_{f['name']}[] = {{")
        data = f["data"]
        for i in range(0, len(data), 24):
            lines.append("  " + ",".join(str(b) for b in data[i:i + 24]) + ",")
        lines.append("};")
        lines.append("")
    lines.append(f"// Total: {total} bytes of flash.")
    with open(OUT, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    return total


# --- Preview: draw with TFT_eSPI's own placement rules ------------------------

def parse_vlw(data):
    count, _, _, _, ascent, descent = struct.unpack(">6i", data[:24])
    glyphs = {}
    ptr = 24 + count * 28
    for i in range(count):
        cp, h, w, adv, dy, dx, _ = struct.unpack(">7i", data[24 + i * 28:24 + (i + 1) * 28])
        glyphs[cp] = (h, w, adv, dy, dx, data[ptr:ptr + w * h])
        ptr += w * h
    return ascent, glyphs


def draw_text(canvas, face, text, x, y, colour):
    """Mirror of TFT_eSPI::drawGlyph: glyph at (x + dX, y + ascent - dY)."""
    ascent, glyphs = parse_vlw(face["data"])
    for ch in text:
        cp = ord(ch)
        if cp == 0x20:
            x += face["space"]
            continue
        if cp not in glyphs:
            continue
        h, w, adv, dy, dx, bitmap = glyphs[cp]
        if w and h:
            mask = Image.frombytes("L", (w, h), bitmap)
            canvas.paste(Image.new("RGB", (w, h), colour), (x + dx, y + ascent - dy), mask)
        x += adv
    return x


def preview(faces, path):
    by = {f["name"]: f for f in faces}
    img = Image.new("RGB", (320 * 2 + 30, 240), (253, 250, 246))
    ink, muted = (78, 53, 61), (139, 106, 119)
    y = 8
    for name, sample in [
        ("note30", "Good luck today, you've"),
        ("note24", "Waiting for a note — café"),
        ("note19", "“See you at seven” … ok?"),
        ("note16", "Ä Å é ñ ø ß — The quick brown fox"),
        ("head17", "DeskNote"),
        ("meta13", "Andon Desk · paired with Deepa · main-5.2"),
        ("foot14", "— for Andon Desk"),
        ("digits32", "483920"),
    ]:
        draw_text(img, by[name], sample, 10, y, ink if name != "meta13" else muted)
        y += by[name]["ascent"] + by[name]["descent"] + 4
    img.save(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()

    for path in (ROMAN, ITALIC):
        if not os.path.exists(path):
            sys.exit(f"missing {path} — see firmware/fonts/README.md")

    faces = [build_face(*spec) for spec in FACES]
    total = write_header(faces)
    for f in faces:
        note = f", no glyph for {len(f['skipped'])}: " + " ".join(f"U+{c:04X}" for c in f["skipped"]) if f["skipped"] else ""
        print(f"{f['name']:>9}: {f['count']:3} glyphs, {len(f['data']):6} bytes{note}")
    print(f"wrote {os.path.relpath(OUT, ROOT)} — {total} bytes of font data")

    if args.preview:
        os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
        out = os.path.join(ROOT, "build", "desk-fonts.png")
        preview(faces, out)
        print(f"preview: {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
