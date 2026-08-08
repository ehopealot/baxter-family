import os
from PIL import Image, ImageDraw, ImageFont

W, H, S = 1200, 630, 3            # render at 3x, downsample for clean edges
F = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts") + "/"
PAPER, INK, INK2, INK3 = "#fceddd", "#3b2419", "#5f4234", "#7f5b4b"
PEACH, PEACH_MID, PEACH_DEEP = "#f2a177", "#e8895a", "#9e5124"
BLUE, GREY, GREY_INK, WHITE = "#0a6ce0", "#e9e9eb", "#1c1c1e", "#ffffff"

def f(name, px): return ImageFont.truetype(F + name, px * S)
mono_b, mono_r, sans = "plexmono-600.ttf", "plexmono-400.ttf", "archivo-400.ttf"

img = Image.new("RGB", (W * S, H * S), PAPER)
d = ImageDraw.Draw(img, "RGBA")
def px(v): return v * S
def rr(box, r, **kw): d.rounded_rectangle([px(box[0]), px(box[1]), px(box[2]), px(box[3])], radius=px(r), **kw)

# the page's own grid wash: 1px ink at 4.5%, every 34px
for x in range(0, W, 34):
    d.line([(px(x), 0), (px(x), px(H))], fill=(59, 36, 25, 11), width=S)
for y in range(0, H, 34):
    d.line([(0, px(y)), (px(W), px(y))], fill=(59, 36, 25, 11), width=S)

# ── phone, bleeding off the bottom-right corner so it can be big ──
PX, PY, PW = 762, 96, 340
rr((PX + 13, PY + 13, PX + PW + 13, H + 60), 46, fill=PEACH_MID)   # offset shadow
rr((PX, PY, PX + PW, H + 60), 46, fill=INK)
rr((PX + 11, PY + 11, PX + PW - 11, H + 60), 36, fill=WHITE)

# thread header
hy = PY + 11
d.rectangle([px(PX + 11), px(hy), px(PX + PW - 11), px(hy + 58)], fill="#f9f9f9")
d.line([(px(PX + 11), px(hy + 58)), (px(PX + PW - 11), px(hy + 58))], fill="#dcdcdf", width=S)
d.ellipse([px(PX + PW / 2 - 15), px(hy + 8), px(PX + PW / 2 + 15), px(hy + 38)], fill=PEACH)
fb = f(mono_b, 15)
d.text((px(PX + PW / 2), px(hy + 23)), "B", font=fb, fill=INK, anchor="mm")
fn = f(sans, 11)
d.text((px(PX + PW / 2), px(hy + 47)), "Baxter", font=fn, fill=GREY_INK, anchor="mm")

# bubbles
fbub = f(sans, 15)
ASCENT = fbub.getmetrics()[0] / S

# Neither Archivo nor Plex Mono carries U+2713 (it comes out as tofu), so the
# tick is drawn rather than typed. Which is the better answer anyway: it takes
# the page's peach the way the .tick-mark rule does, and it can't be broken by
# a font swap.
TICK = ""        # private-use placeholder; never rendered as a glyph
TW, TH, TADV = 10.0, 9.5, 12.5

def draw_tick(x, baseline):
    d.line(
        [(px(x), px(baseline - 0.42 * TH)),
         (px(x + 0.36 * TW), px(baseline - 0.02 * TH)),
         (px(x + TW), px(baseline - TH))],
        fill=PEACH_DEEP, width=round(2.2 * S), joint="curve",
    )

def measure(text):
    return sum(d.textlength(p, font=fbub) / S for p in text.split(TICK)) \
        + TADV * text.count(TICK)

def run(x, y, text, fill):
    baseline = y + ASCENT
    for i, part in enumerate(text.split(TICK)):
        if i:
            draw_tick(x + 1.2, baseline)
            x += TADV
        if part:
            d.text((px(x), px(y)), part, font=fbub, fill=fill)
            x += d.textlength(part, font=fbub) / S

def bubble(lines, y, mine):
    pad, lh, maxw = 11, 21, 0
    for ln in lines:
        maxw = max(maxw, measure(ln))
    bw, bh = maxw + pad * 2, len(lines) * lh + pad * 2 - 4
    x = PX + PW - 22 - bw if mine else PX + 22
    rr((x, y, x + bw, y + bh), 17, fill=BLUE if mine else GREY)
    # square off the tail corner, matching the page
    if mine: rr((x + bw - 14, y + bh - 14, x + bw, y + bh), 5, fill=BLUE)
    else:    rr((x, y + bh - 14, x + 14, y + bh), 5, fill=GREY)
    for i, ln in enumerate(lines):
        run(x + pad, y + pad - 2 + i * lh, ln, WHITE if mine else GREY_INK)
    return y + bh + 9

# Bottom-anchored, the way a real thread sits: messages pinned to the foot of
# the screen with the empty room above them. Drawing from the top instead left
# a slab of white below the last reply, which reads as a finished conversation
# rather than one still going.
#
# The store thread, because ticking items off a list somebody else can see is
# the thing this product does that nothing else does. It ends on Erik: the
# answer is about what the other parent already did.
THREAD = [
    (["at the store. got", "bananas, milk, spaghetti"], True),
    ([f"Bananas {TICK}, milk {TICK},", f"spaghetti {TICK}"], False),
    (["do we need any", "laundry detergent?"], True),
    (["Nope, Erik picked some", "up this afternoon."], False),
    (["while we're here, can you", "pull up the rest of the", "grocery list?"], True),
    (["Six more things on it."], False),
]
stack = sum(len(l) * 21 + 18 + 9 for l, _ in THREAD) - 9
y = H - 20 - stack          # last bubble lands just shy of the canvas edge
for lines, mine in THREAD:
    y = bubble(lines, y, mine)

# ── wordmark ──
rr((80, 74, 118, 112), 3, fill=PEACH)
d.text((px(99), px(94)), "B", font=f(mono_b, 20), fill=INK, anchor="mm")
d.text((px(130), px(93)), "Baxter Family AI", font=f(mono_b, 22), fill=INK, anchor="lm")

# ── headline ──
fh = f(mono_b, 62)
# The accent goes on "whole house", matching the page's <em>: with a plain noun
# like "helper" the sharing is the surprising half, not the thing itself.
d.text((px(80), px(214)), "One helper for", font=fh, fill=INK)
x = 80
for part, col in (("the ", INK), ("whole house.", PEACH_DEEP)):
    d.text((px(x), px(292)), part, font=fh, fill=col)
    x += d.textlength(part, font=fh) / S

# ── supporting line + domain ──
# The question and its answer, which is the page's lede boiled down to the two
# lines that still work at the size a feed shows this.
fs = f(sans, 25)
d.text((px(80), px(404)), "Did anyone pick up the dish soap?", font=fs, fill=INK2)
d.text((px(80), px(440)), "Nobody has to remember. Baxter's got this.", font=fs, fill=INK2)

d.line([(px(80), px(516)), (px(150), px(516))], fill=PEACH_DEEP, width=2 * S)
d.text((px(80), px(548)), "family.bax.bot", font=f(mono_r, 22), fill=INK3)

# Fit report, so a too-long line is caught here rather than by eye.
inner = (PX + PW - 11) - (PX + 11) - 44
for lines, _ in THREAD:
    for ln in lines:
        w = measure(ln)
        if w > inner:
            print(f"  OVERFLOW ({w:.0f} > {inner}): {ln}")
for label, s, font, limit in [
    ("head 1", "One helper for", fh, 660),
    ("head 2", "the whole house.", fh, 660),
    ("lede 1", "Did anyone pick up the dish soap?", fs, 660),
    ("lede 2", "Nobody has to remember. Baxter's got this.", fs, 660),
]:
    w = d.textlength(s, font=font) / S
    print(f"  {label}: {w:5.0f}px {'OVERFLOW' if w > limit else 'ok'}")

img.resize((W, H), Image.LANCZOS).save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "og.png"), optimize=True)
print("  wrote og.png")
