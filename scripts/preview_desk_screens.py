#!/usr/bin/env python3
"""Render the desk's screens on this Mac, the way the firmware draws them.

    python3 scripts/preview_desk_screens.py [theme ...]   # → build/desk-screens.png

A layout check before flashing: the same Fraunces fonts (built by
gen_desk_fonts.py), TFT_eSPI's glyph placement, the same sticker bitmaps, and
the same layout constants as desknote_main.ino — header height, note sizes,
padding, footer. It is a mirror, not the firmware itself: when a screen's
layout changes in the sketch, change it here too, or this shows the old one.
"""

import os
import re
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_desk_fonts as gdf  # noqa: E402

ROOT = gdf.ROOT
W, H = 320, 240
HEADER_H = 44
NOTE_FOOTER_H = 30

# Same rows as kThemes / kAccents in desknote_main.ino.
THEMES = {
    "cream":    (0xFDFAF6, 0x4E353D, 0x8B6A77, 0xEFE4DA, 0xD98A8A, False),
    "blush":    (0xFBE8E4, 0x5A2E36, 0x9A6069, 0xF1CFC8, 0xC26767, False),
    "sage":     (0xEEF2EA, 0x2F3B30, 0x667866, 0xD9E2D3, 0x6F8F74, False),
    "plum":     (0x2A1C22, 0xF4E6EA, 0xB798A3, 0x3E2B33, 0xE8A5B0, True),
    "lavender": (0xEEEAF6, 0x3C3452, 0x766C92, 0xDCD5EC, 0x8B7BB8, False),
    "sky":      (0xE8F0F6, 0x22384A, 0x5E7488, 0xD2E0EC, 0x5E8DB3, False),
    "peach":    (0xFCEBDD, 0x5A3522, 0x9A6A50, 0xF2D5BE, 0xD9895B, False),
    "midnight": (0x141A2A, 0xE8ECF5, 0x8E9AB8, 0x232C42, 0x9DB4E8, True),
}


def rgb565(hex_):
    """What the panel can actually show: quantise through RGB565."""
    r, g, b = (hex_ >> 16) & 0xFF, (hex_ >> 8) & 0xFF, hex_ & 0xFF
    r, g, b = r >> 3, g >> 2, b >> 3
    return (r << 3 | r >> 2, g << 2 | g >> 4, b << 3 | b >> 2)


def palette(theme):
    paper, ink, muted, line, accent, dark = THEMES[theme]
    return {"paper": rgb565(paper), "ink": rgb565(ink), "muted": rgb565(muted),
            "line": rgb565(line), "accent": rgb565(accent),
            "alert": rgb565(0xF09A95 if dark else 0xB85450)}


# --- fonts -------------------------------------------------------------------

FONTS = {}


def font(name):
    if name not in FONTS:
        spec = next(f for f in gdf.FACES if f[0] == name)
        face = gdf.build_face(*spec)
        ascent, glyphs = gdf.parse_vlw(face["data"])
        descent = max((h - dy for (h, w, a, dy, dx, b) in glyphs.values() if h), default=0)
        FONTS[name] = {"face": face, "ascent": ascent, "glyphs": glyphs,
                       "line": ascent + max(descent, face["descent"])}
    return FONTS[name]


def text_width(name, text):
    f = font(name)
    return sum(f["face"]["space"] if ch == " " else f["glyphs"].get(ord(ch), (0, 0, 0))[2]
               for ch in text)


def draw_text(img, name, text, x, y, colour):
    gdf.draw_text(img, font(name)["face"], text, x, y, colour)


def centered(img, name, text, y, colour):
    draw_text(img, name, text, (W - text_width(name, text)) // 2, y, colour)


# --- stickers ----------------------------------------------------------------

SPRITES = None


def sprites():
    global SPRITES
    if SPRITES is None:
        src = open(os.path.join(ROOT, "firmware", "desknote_main", "emoji_assets.gen.h")).read()
        px = int(re.search(r"#define EMOJI_SPRITE_PX (\d+)", src).group(1))
        sketch = open(os.path.join(ROOT, "firmware", "desknote_main", "desknote_main.ino")).read()
        names = re.findall(r'\{4, \{[^}]*\}, "([^"]+)"\}', sketch)
        idx = [int(v) for v in re.search(r"kEmojiRowSpriteIdx\[[^\]]*\]\s*=\s*\{([^}]*)\}", src).group(1).split(",") if v.strip()]
        block = re.search(r"kEmojiSpriteData\[[^\]]*\]\[[^\]]*\]\s*=\s*\{(.*?)\n\};", src, re.S).group(1)
        rows = [[int(v, 0) for v in re.findall(r"0x[0-9A-Fa-f]+|\b\d+\b", r)]
                for r in re.findall(r"\{([^{}]*)\}", block)]
        SPRITES = {"px": px, "by_name": {n: rows[idx[i]] for i, n in enumerate(names) if i < len(idx)}}
    return SPRITES


def draw_sprite(img, name, x, y, out_px, colour):
    """Box-filter downsample, like drawEmojiBitmapSized: coverage → alpha."""
    s = sprites()
    data = s["by_name"].get(name)
    if not data:
        return
    px = s["px"]
    bit = lambda i: data[i >> 3] & (1 << (i & 7))
    for oy in range(out_px):
        sy0 = oy * px // out_px
        sy1 = max(sy0 + 1, (oy + 1) * px // out_px)
        for ox in range(out_px):
            sx0 = ox * px // out_px
            sx1 = max(sx0 + 1, (ox + 1) * px // out_px)
            on = sum(1 for sy in range(sy0, sy1) for sx in range(sx0, sx1) if bit(sy * px + sx))
            if not on:
                continue
            a = on / ((sy1 - sy0) * (sx1 - sx0))
            bg = img.getpixel((x + ox, y + oy))
            img.putpixel((x + ox, y + oy), tuple(round(c * a + b * (1 - a)) for c, b in zip(colour, bg)))


# --- screens (mirrors of the sketch's draw functions) ------------------------

def header(img, p, version="main-5.2"):
    ImageDraw.Draw(img).rectangle([0, 0, W, H], fill=p["paper"])
    draw_sprite(img, "heartln", 16, 14, 16, p["accent"])
    draw_text(img, "head17", "DeskNote", 38, 12, p["ink"])
    draw_text(img, "meta13", version, W - text_width("meta13", version) - 16, 16, p["muted"])
    ImageDraw.Draw(img).line([16, HEADER_H, W - 17, HEADER_H], fill=p["line"])


def status(img, p, text, colour_key="muted"):
    ImageDraw.Draw(img).rectangle([0, 210, W, H], fill=p["paper"])
    centered(img, "meta13", text, 214, p[colour_key])


def screen_waiting(p):
    img = Image.new("RGB", (W, H))
    header(img, p)
    draw_sprite(img, "hearts", (W - 32) // 2, 62, 32, p["accent"])
    centered(img, "note24", "Waiting for a note", 104, p["ink"])
    centered(img, "meta13", "Andon Desk · Bedroom", 140, p["muted"])
    status(img, p, "Paired and online.", "accent")
    return img


def screen_pairing(p):
    img = Image.new("RGB", (W, H))
    header(img, p)
    centered(img, "note24", "Pair this desk", 58, p["ink"])
    d = ImageDraw.Draw(img)
    box_w, box_h, gap, y = 40, 52, 8, 98
    code = "483920"
    x = (W - (len(code) * box_w + (len(code) - 1) * gap)) // 2
    for ch in code:
        d.rounded_rectangle([x, y, x + box_w - 1, y + box_h - 1], 9, fill=p["line"])
        d.rounded_rectangle([x + 2, y + 2, x + box_w - 3, y + box_h - 3], 7, fill=p["paper"])
        f = font("digits32")
        draw_text(img, "digits32", ch, x + (box_w - text_width("digits32", ch)) // 2,
                  y + (box_h - f["line"]) // 2, p["ink"])
        x += box_w + gap
    centered(img, "meta13", "Enter this code in the DeskNote app", 164, p["muted"])
    return img


def screen_ota(p, pct=62):
    img = Image.new("RGB", (W, H))
    header(img, p)
    draw_text(img, "note24", "Updating", 24, 62, p["ink"])
    draw_text(img, "meta13", "main-5.1 to main-5.2", 24, 96, p["muted"])
    d = ImageDraw.Draw(img)
    bw = W - 48
    d.rounded_rectangle([24, 124, 24 + bw - 1, 133], 5, fill=p["line"])
    fill = bw * pct // 100
    d.rounded_rectangle([24, 124, 24 + max(fill, 10) - 1, 133], 5, fill=p["accent"])
    draw_text(img, "meta13", f"{pct}%", 24, 144, p["muted"])
    status(img, p, "Keep me plugged in")
    return img


NOTE_STEPS = [("note30", 28, 6), ("note24", 24, 5), ("note19", 20, 4), ("note16", 16, 3), ("note16", 14, 1)]
STICKER = re.compile(r"\[(\w+)\]")


def tokens(body):
    """Words and [sticker] markers — the preview's stand-in for the tokenizer."""
    out = []
    for word in body.split(" "):
        m = STICKER.fullmatch(word)
        out.append(("emoji", m.group(1)) if m else ("text", word))
    return out


def item_w(item, face, em):
    return em + 4 if item[0] == "emoji" else text_width(face, item[1])


def wrap(items, inner_w, face, em):
    rows, row = [], []
    sw = font(face)["face"]["space"]
    for it in items:
        trial = row + [it]
        w = sum(item_w(t, face, em) for t in trial) + sw * (len(trial) - 1)
        if w <= inner_w or not row:
            row = trial
        else:
            rows.append(row)
            row = [it]
    if row:
        rows.append(row)
    return rows


def screen_note(p, body, desk="Andon Desk", offline=False):
    img = Image.new("RGB", (W, H), p["paper"])
    pad_x, pad_y = 22, 20
    inner_w = W - 2 * pad_x
    top, bottom = pad_y, H - (NOTE_FOOTER_H + 6)
    avail = bottom - top
    items = tokens(body)
    for face, em, leading in NOTE_STEPS:
        rows = wrap(items, inner_w, face, em)
        lh = max(font(face)["line"] + leading, em + 4)
        sw = font(face)["face"]["space"]
        widest = max(sum(item_w(t, face, em) for t in r) + sw * (len(r) - 1) for r in rows)
        if len(rows) * lh <= avail and widest <= inner_w:
            break
    y0 = max(top, top + (avail - len(rows) * lh) // 2)
    text_h = font(face)["line"]
    for r, row in enumerate(rows):
        y = y0 + r * lh
        if y + lh > bottom + 4:
            break
        rw = sum(item_w(t, face, em) for t in row) + sw * (len(row) - 1)
        x = (W - rw) // 2
        for i, it in enumerate(row):
            if it[0] == "emoji":
                draw_sprite(img, it[1], x, y + (lh - em) // 2, em, p["accent"])
                x += em + 4
            else:
                draw_text(img, face, it[1], x, y + (lh - text_h) // 2, p["ink"])
                x += text_width(face, it[1])
            if i + 1 < len(row):
                x += sw
    centered(img, "foot14", f"— for {desk}", H - NOTE_FOOTER_H + 4, p["muted"])
    if offline:
        d = ImageDraw.Draw(img)
        w = text_width("meta13", "offline")
        pw = w + 26
        px = W - pw - 8
        d.rounded_rectangle([px, 6, px + pw - 1, 25], 10, fill=p["line"])
        d.ellipse([px + 7, 13, px + 13, 19], fill=p["alert"])
        draw_text(img, "meta13", "offline", px + 18, 8, p["muted"])
    return img, face


def main():
    themes = sys.argv[1:] or list(THEMES)
    screens = []
    for t in themes:
        p = palette(t)
        short, f1 = screen_note(p, "Good luck today, you've got this [heartln]")
        long_, f2 = screen_note(p, "Don't forget we're having dinner with your mum on Friday at seven — "
                                "I'll pick up flowers on the way. Café after? [coffee] [hearts]", offline=True)
        screens.append((t, [short, long_, screen_waiting(p), screen_pairing(p), screen_ota(p)]))
        print(f"{t:>9}: short note at {f1}, long note at {f2}")

    gap = 10
    sheet = Image.new("RGB", (5 * W + 6 * gap, len(screens) * (H + gap) + gap), (40, 40, 40))
    for r, (_, row) in enumerate(screens):
        for c, img in enumerate(row):
            sheet.paste(img, (gap + c * (W + gap), gap + r * (H + gap)))
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    out = os.path.join(ROOT, "build", "desk-screens.png")
    sheet.save(out)
    print(f"wrote {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
