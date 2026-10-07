"""Painted atlas regions for cars, trucks, buses and autos."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FC = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'


def plate(size, txt, bg=(240, 240, 236), fg=(15, 15, 15)):
    w, h = size; im = Image.new('RGB', size, bg); d = ImageDraw.Draw(im)
    d.rounded_rectangle([1, 1, w - 2, h - 2], radius=6, outline=(25, 25, 25), width=3)
    d.text((8, h * 0.18), 'IND', font=ImageFont.truetype(FC, int(h * 0.22)), fill=(30, 60, 160))
    fs = int(h * 0.62); f = ImageFont.truetype(FB, fs)
    while d.textlength(txt, font=f) > w - 50 and fs > 8: fs -= 1; f = ImageFont.truetype(FB, fs)
    tw = d.textlength(txt, font=f)
    d.text(((w - tw) / 2 + 12, (h - fs) / 2 - fs * 0.1), txt, font=f, fill=fg)
    return im


def grille(size, kind='mesh'):
    w, h = size; im = Image.new('RGB', size, (14, 14, 16)); d = ImageDraw.Draw(im)
    if kind == 'mesh':   # honeycomb
        r = 7
        for row in range(0, h // r + 2):
            for col in range(0, w // r + 2):
                cx = col * r * 1.75 + (r * 0.87 if row % 2 else 0); cy = row * r * 1.5
                pts = [(cx + math.cos(math.radians(60 * k + 30)) * r * 0.8, cy + math.sin(math.radians(60 * k + 30)) * r * 0.8) for k in range(6)]
                d.polygon(pts, fill=(4, 4, 5), outline=(48, 50, 54))
    elif kind == 'slats':
        for y in range(6, h, 14): d.rectangle([4, y, w - 4, y + 5], fill=(170, 174, 180))
    elif kind == 'truck':
        for y in range(4, h, 10): d.rectangle([4, y, w - 4, y + 5], fill=(190, 194, 200))
        for x in range(0, w, 40): d.rectangle([x, 0, x + 6, h], fill=(150, 150, 155))
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=10, outline=(200, 204, 210), width=5)
    return im


def headlamp(size):
    w, h = size; im = Image.new('RGB', size, (40, 42, 46)); d = ImageDraw.Draw(im)
    # chrome reflector bowls, projector lens, LED DRL strip along the top
    for cx in (w * 0.28, w * 0.68):
        for r in range(int(h * 0.42), 2, -2):
            v = int(120 + 120 * (1 - r / (h * 0.42)))
            d.ellipse([cx - r, h * 0.55 - r, cx + r, h * 0.55 + r], fill=(v, v, min(255, v + 6)))
    d.ellipse([w * 0.28 - h * 0.17, h * 0.55 - h * 0.17, w * 0.28 + h * 0.17, h * 0.55 + h * 0.17], fill=(20, 26, 34))
    d.ellipse([w * 0.28 - h * 0.07, h * 0.47 - h * 0.05, w * 0.28 - h * 0.0, h * 0.47 + h * 0.02], fill=(220, 230, 240))
    d.rectangle([w * 0.05, h * 0.06, w * 0.95, h * 0.14], fill=(250, 252, 255))
    d.rectangle([w * 0.82, h * 0.30, w * 0.96, h * 0.80], fill=(255, 160, 30))
    return im


def taillamp(size):
    w, h = size; im = Image.new('RGB', size, (120, 6, 8)); d = ImageDraw.Draw(im)
    for x in range(0, w, 6): d.line([(x, 0), (x, h)], fill=(160, 10, 12))
    d.rectangle([w * 0.06, h * 0.15, w * 0.94, h * 0.30], fill=(255, 40, 30))
    d.rectangle([w * 0.06, h * 0.60, w * 0.40, h * 0.85], fill=(235, 235, 240))   # reverse light
    d.rectangle([w * 0.45, h * 0.60, w * 0.94, h * 0.85], fill=(255, 140, 20))    # indicator
    return im


def tyre_tex(path, label='TARMAC  ECO  185/65 R15', W=2048, H=256):
    im = Image.new('RGB', (W, H), (24, 24, 25)); d = ImageDraw.Draw(im)
    t0, t1 = int(H * 0.24), int(H * 0.76)
    d.rectangle([0, t0, W, t1], fill=(30, 30, 31))
    # road-tyre tread: 4 circumferential grooves + sipes
    for g in (0.36, 0.46, 0.54, 0.64):
        d.rectangle([0, H * g - 3, W, H * g + 3], fill=(8, 8, 8))
    for x in range(0, W, 16):
        for a, b in ((0.25, 0.35), (0.37, 0.45), (0.55, 0.63), (0.65, 0.75)):
            d.line([(x, H * a), (x + 6, H * b)], fill=(12, 12, 12), width=2)
    f = ImageFont.truetype(FB, 24)
    band = Image.new('RGB', (W, int(H * 0.2)), (24, 24, 25)); bd = ImageDraw.Draw(band)
    for x0 in (80, W // 2 + 80): bd.text((x0, 8), label, font=f, fill=(76, 76, 78))
    im.paste(band, (0, int(H * 0.01)))
    im.paste(band.transpose(Image.FLIP_TOP_BOTTOM).transpose(Image.FLIP_LEFT_RIGHT), (0, H - band.size[1] - int(H * 0.01)))
    a = np.asarray(im).astype(np.float32); a *= (1 + np.random.default_rng(2).normal(0, 0.05, a.shape[:2]))[..., None]
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(path)


def dash_black(size):
    return Image.new('RGB', size, (10, 10, 12))


def text_panel(size, lines, bg, fg, font=FB):
    w, h = size; im = Image.new('RGB', size, bg); d = ImageDraw.Draw(im)
    n = len(lines)
    for i, t in enumerate(lines):
        fs = int(h / n * 0.7); f = ImageFont.truetype(font, fs)
        while d.textlength(t, font=f) > w * 0.92 and fs > 8: fs -= 1; f = ImageFont.truetype(font, fs)
        tw = d.textlength(t, font=f); d.text(((w - tw) / 2, h / n * i + (h / n - fs) / 2 - fs * 0.1), t, font=f, fill=fg)
    return im
