#!/usr/bin/env python3
"""Renders newsletter.png: the school handout used in the demo thread.

Drawn rather than sourced, because every stock "school newsletter" is a
licensed template and a real one carries a real school's name and children's
names. This one is ours, invents its school, and can say exactly the dates the
conversation beside it pulls out.

It appears at 120px wide inside a message bubble, so it is built to read as a
newsletter at a glance rather than to be legible: strong masthead, obvious
structure, and one boxed run of dates.
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H, S = 240, 320, 3
F = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts") + "/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "newsletter.png")

PAPER, NAVY, INK, GREY, RULE = "#fdfdfb", "#1f3a63", "#22303f", "#8b96a3", "#d4dae1"
ACCENT, ACCENT_BG = "#b4451f", "#fdf0e7"

sans = lambda px: ImageFont.truetype(F + "archivo-400.ttf", round(px * S))
img = Image.new("RGB", (W * S, H * S), PAPER)
d = ImageDraw.Draw(img)
px = lambda v: round(v * S)

def text(x, y, s, size, fill, bold=0, anchor=None):
    d.text((px(x), px(y)), s, font=sans(size), fill=fill,
           stroke_width=bold * S // 2, stroke_fill=fill, anchor=anchor)

def bars(x, y, width, rows, gap=4.4, last=0.62):
    """Body copy as rules. Real text at this scale is mush; rules read as text."""
    for i in range(rows):
        w = width * (last if i == rows - 1 else 1)
        d.rectangle([px(x), px(y + i * gap), px(x + w), px(y + i * gap + 1.5)], fill=GREY)

# ── masthead ──
d.rectangle([0, 0, px(W), px(46)], fill=NAVY)
text(W / 2, 15, "OAKWOOD", 15, "#ffffff", bold=1, anchor="mm")
text(W / 2, 27, "E L E M E N T A R Y", 6.2, "#a9c0de", anchor="mm")
d.rectangle([px(84), px(34), px(W - 84), px(34.8)], fill="#5b7ba6")
text(W / 2, 40, "FAMILY NEWSLETTER  ·  OCTOBER", 5.6, "#c7d6e8", anchor="mm")

# ── lead story ──
text(14, 56, "Fall Term Highlights", 11, INK, bold=1)
d.rectangle([px(14), px(72), px(W - 14), px(72.8)], fill=RULE)
bars(14, 79, 100, 7)
bars(126, 79, 100, 7)

# a photo on the page, so the handout looks like a handout
d.rectangle([px(126), px(112), px(W - 14), px(150)], fill="#dde3e9")
d.ellipse([px(150), px(122), px(166), px(138)], fill="#c3ccd6")
d.polygon([(px(134), px(150)), (px(158), px(126)), (px(182), px(150))], fill="#cbd3db")
bars(14, 114, 100, 8)

# ── dates ──
d.rectangle([px(14), px(160), px(W - 14), px(215)], fill=ACCENT_BG)
d.rectangle([px(14), px(160), px(16.5), px(215)], fill=ACCENT)
text(23, 168, "DATES TO KNOW", 6.6, ACCENT, bold=1)
for i, (what, when) in enumerate([
    # These three are what the demo thread reads back, so they have to match.
    ("Picture Day", "Fri, Oct 3"),
    ("Fall Festival", "Sat, Oct 18"),
    ("No School", "Nov 27-28"),
]):
    y = 182 + i * 10.5
    d.ellipse([px(23), px(y + 1.6), px(26), px(y + 4.6)], fill=ACCENT)
    text(30, y, what, 7, INK)
    text(W - 23, y, when, 7, INK, anchor="ra")

# ── back matter ──
bars(14, 226, 100, 7)
bars(126, 226, 100, 7)
d.rectangle([px(14), px(272), px(W - 14), px(272.8)], fill=RULE)
bars(14, 279, 212, 4, last=0.4)
text(W / 2, 305, "oakwoodelementary.org", 6, GREY, anchor="mm")

img.resize((W, H), Image.LANCZOS).save(OUT, optimize=True)
print(f"  wrote newsletter.png ({W}x{H})")
