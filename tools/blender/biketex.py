"""Textures for the sport bike: tyre (tread + sidewall lettering), drilled disc, chain, radiator, dash, livery."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FBO = '/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf'
FC = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'


def tyre(path, size_txt='110/70 ZR17', W=2048, H=256):
    """u = around the tyre (texture used twice per turn), v = across the profile (0 = left bead, 1 = right bead)."""
    im = Image.new('RGB', (W, H), (24, 24, 25)); d = ImageDraw.Draw(im)
    # tread band in the middle 56%; slightly lighter, worn-in centre (scuffed)
    t0, t1 = int(H * 0.22), int(H * 0.78)
    d.rectangle([0, t0, W, t1], fill=(33, 33, 34))
    rng = np.random.default_rng(1)
    # sport tread: swept grooves on the shoulders, slick centre
    for k in range(18):
        x = k * W / 18
        for side in (-1, 1):
            pts = []
            for j in range(12):
                f = j / 11
                yy = H / 2 + side * (H * 0.07 + f * H * 0.19)
                xx = x + f * 46 + side * 0 + 18 * math.sin(f * 2.4)
                pts.append((xx, yy))
            d.line(pts, fill=(10, 10, 10), width=6)
    # sidewall lettering, both sidewalls (mirrored so it reads correctly from outside)
    f = ImageFont.truetype(FB, 26); fs = ImageFont.truetype(FC, 18)
    band = Image.new('RGB', (W, int(H * 0.2)), (24, 24, 25)); bd = ImageDraw.Draw(band)
    for x0 in (60, W // 2 + 60):
        bd.text((x0, 6), 'TARMAC  SUPERSPORT', font=f, fill=(78, 78, 80))
        bd.text((x0 + 420, 10), size_txt + '  TL  RADIAL', font=fs, fill=(62, 62, 64))
        bd.text((x0 + 780, 10), '▲ TWI', font=fs, fill=(62, 62, 64))
    bh = band.size[1]
    im.paste(band, (0, int(H * 0.01)))
    im.paste(band.transpose(Image.FLIP_TOP_BOTTOM).transpose(Image.FLIP_LEFT_RIGHT), (0, H - bh - int(H * 0.01)))
    # rubber grain
    a = np.asarray(im).astype(np.float32)
    a *= (1 + rng.normal(0, 0.05, a.shape[:2]))[..., None]
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(path)


def disc(path, S=512, petals=12):
    """Brake rotor seen face-on. RGBA: alpha 0 outside the petal ring, in the drilled holes and in the centre."""
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); a = np.zeros((S, S, 4), np.uint8)
    yy, xx = np.mgrid[0:S, 0:S]; cx = cy = S / 2
    r = np.hypot(xx - cx, yy - cy) / (S / 2); th = np.arctan2(yy - cy, xx - cx)
    outer = 0.985 - 0.028 * (0.5 + 0.5 * np.cos(th * petals))
    inner = 0.70
    ring = (r < outer) & (r > inner)
    # brushed steel with radial swirl
    base = 168 + 18 * np.sin(r * 140 + th * 3)
    a[..., 0] = base; a[..., 1] = base; a[..., 2] = base + 4; a[..., 3] = np.where(ring, 255, 0)
    # wear band darker
    wb = ring & (r > 0.76) & (r < 0.95)
    a[wb, :3] = (a[wb, :3] * 0.9).astype(np.uint8)
    # drilled holes in 3 staggered rows
    for k in range(36):
        for rr, off in ((0.80, 0.0), (0.865, 0.5), (0.93, 0.25)):
            ang = (k + off) * 2 * math.pi / 36
            hx, hy = cx + math.cos(ang) * rr * S / 2, cy + math.sin(ang) * rr * S / 2
            m = np.hypot(xx - hx, yy - hy) < S * 0.0085
            a[m, 3] = 0
    Image.fromarray(a, 'RGBA').save(path)


def chain(size):
    w, h = size; im = Image.new('RGB', size, (40, 40, 42)); d = ImageDraw.Draw(im)
    pitch = 5
    for x in range(0, w, pitch):
        outer = (x // pitch) % 2 == 0
        c = (120, 122, 128) if outer else (70, 72, 76)
        d.rectangle([x, 2, x + pitch - 2, h - 3], fill=c)
        d.ellipse([x + pitch - 3, h // 2 - 2, x + pitch + 0, h // 2 + 1], fill=(190, 160, 70))  # rollers (gold)
    return im


def radiator(size):
    w, h = size; im = Image.new('RGB', size, (26, 27, 30)); d = ImageDraw.Draw(im)
    for y in range(0, h, 4): d.line([(0, y), (w, y)], fill=(48, 50, 54), width=1)
    for x in range(0, w, 3): d.line([(x, 0), (x, h)], fill=(18, 18, 20), width=1)
    d.rectangle([0, 0, w - 1, h - 1], outline=(12, 12, 13), width=4)
    return im


def dash(size):
    w, h = size; im = Image.new('RGB', size, (6, 8, 12)); d = ImageDraw.Draw(im)
    # rpm bar
    for i in range(40):
        x = 12 + i * (w - 24) / 40
        col = (40, 200, 255) if i < 26 else (255, 190, 40) if i < 34 else (255, 50, 40)
        d.rectangle([x, 10, x + (w - 24) / 40 - 2, 22 + i * 0.4], fill=col if i < 22 else tuple(int(v * 0.35) for v in col))
    f = ImageFont.truetype(FBO, int(h * 0.42)); fs = ImageFont.truetype(FC, int(h * 0.13))
    d.text((w * 0.30, h * 0.30), '148', font=f, fill=(235, 245, 255))
    d.text((w * 0.73, h * 0.62), 'km/h', font=fs, fill=(150, 170, 190))
    d.text((w * 0.08, h * 0.40), '4', font=ImageFont.truetype(FB, int(h * 0.3)), fill=(40, 200, 255))
    d.text((w * 0.08, h * 0.80), 'FUEL', font=fs, fill=(150, 170, 190))
    d.rectangle([w * 0.25, h * 0.84, w * 0.55, h * 0.9], fill=(60, 220, 120))
    return im


def plate(size, txt='MH 12 TR 7777'):
    w, h = size; im = Image.new('RGB', size, (238, 238, 232)); d = ImageDraw.Draw(im)
    d.rectangle([2, 2, w - 3, h - 3], outline=(20, 20, 20), width=3)
    f = ImageFont.truetype(FB, int(h * 0.36))
    lines = [txt[:5], txt[6:]]
    for i, t in enumerate(lines):
        tw = d.textlength(t, font=f); d.text(((w - tw) / 2, h * 0.08 + i * h * 0.44), t, font=f, fill=(15, 15, 15))
    return im


def livery(path, police=False, W=2048, H=1024):
    """Fairing/tank/tail paint. RGB design + alpha = rider-colour mask.
    Layout: right side u 0-0.5 (y from +1.05 front at u=0.5? no: u = (1.05 - y)/2.1 *0.5), left side u 0.5-1 mirrored, top strip v 0.75-1.
    Side regions map (y, z): y in [-1.05, 1.05], z in [0.15, 1.20] -> v in [0, 0.75]."""
    base = np.zeros((H, W, 4), np.float32)
    # side coordinates for each pixel
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = 1 - (yy + 0.5) / H; u = (xx + 0.5) / W
    side = v < 0.75
    right = side & (u < 0.5); left = side & (u >= 0.5)
    Y = np.where(right, -1.05 + u / 0.5 * 2.1, 1.05 - (u - 0.5) / 0.5 * 2.1)
    Z = 0.15 + v / 0.75 * 1.05
    top = ~side
    TY = 1.05 - u * 2.1; TX = ((v - 0.75) / 0.25 - 0.5) * 0.7
    PRI, BLK, WHT, GRY = np.array([235, 235, 235.]), np.array([18, 18, 20.]), np.array([240, 240, 240.]), np.array([60, 62, 66.])
    col = np.zeros((H, W, 3), np.float32); col[:] = PRI; mask = np.ones((H, W), np.float32)
    def put(sel, c, m=0.0):
        col[sel] = c; mask[sel] = m
    if police:
        PRI2 = np.array([245, 245, 245.])
        col[:] = PRI2; mask[:] = 0
        band = side & (Z > 0.56) & (Z < 0.64)
        put(band, np.array([27, 63, 143.])); put(side & (Z > 0.645) & (Z < 0.665), np.array([230, 160, 20.]))
        put(side & (Z < 0.46), BLK)
    else:
        # lower fairing and belly black
        put(side & (Z < 0.37), BLK)
        # diagonal speed stripe (white edged black) from the nose sweeping back and up
        s = Z - (0.60 + 0.30 * (0.55 - Y))
        put(side & (np.abs(s) < 0.035) & (Y > -0.15), BLK)
        put(side & (s > 0.035) & (s < 0.050) & (Y > -0.15), WHT)
        put(side & (s < -0.035) & (s > -0.046) & (Y > -0.15), WHT)
        # tail section: black upper tail with a primary number
        put(side & (Y < -0.20) & (Z > 0.83 + 0.12 * np.clip(-0.2 - Y, 0, 1)), BLK)
        # radiator side vents (three slanted slots) and panel seam lines
        for k in range(3):
            yc = 0.60 - k * 0.045
            vs = side & (np.abs(Y - yc - (Z - 0.68) * 0.55) < 0.012) & (Z > 0.62 - k * 0.03) & (Z < 0.74 - k * 0.02)
            put(vs, np.array([8, 8, 9.]))
        seam = side & (np.abs(Z - (0.885 - 0.18 * np.clip(0.80 - Y, 0, 1))) < 0.0025) & (Y > 0.1) & (Y < 0.80)
        col[seam] *= 0.35
        seam2 = side & (np.abs(Y - 0.35 - (Z - 0.30) * 0.25) < 0.0025) & (Z < 0.62)
        col[seam2] *= 0.35
        # tank knee pad (grippy black)
        kp = side & (Y > -0.04) & (Y < 0.14) & (Z > 0.80) & (Z < 0.90)
        put(kp, GRY)
        # top: twin racing stripes down the middle of the tank and tail
        put(top & (np.abs(TX) > 0.012) & (np.abs(TX) < 0.032), WHT)
        put(top & (np.abs(TX) <= 0.012), BLK)
    col[top & False] = 0
    rough = np.full((H, W), 0.22, np.float32)
    rough[(np.abs(col - GRY[None, None, :]).sum(-1) < 1) & side] = 0.75
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))   # text layer
    d = ImageDraw.Draw(im)
    if not police:
        # wordmark on the fairing side, number on the tail (drawn on both halves, left half mirrored)
        def place(text, y, z, height, fill, font=FBO, flip=False):
            f = ImageFont.truetype(font, int(height / 1.05 * 0.75 * H))
            tw = d.textlength(text, font=f)
            for half in (0, 1):
                ux = (y + 1.05) / 2.1 * 0.5 if half == 0 else 0.5 + (1.05 - y) / 2.1 * 0.5
                cx = ux * W; cy = (1 - (z - 0.15) / 1.05 * 0.75) * H
                tile = Image.new('RGBA', (int(tw) + 8, int(height / 1.05 * 0.75 * H * 1.3)), (0, 0, 0, 0))
                ImageDraw.Draw(tile).text((4, 0), text, font=f, fill=fill)
                if half == 1: pass  # left side: same orientation (texture u runs rear->front there, so text reads front->back = correct from that side)
                im.alpha_composite(tile, (int(cx - tile.size[0] / 2), int(cy - tile.size[1] / 2)))
        place('TARMAC', 0.30, 0.79, 0.06, (18, 18, 20, 255))
        place('77', -0.62, 0.90, 0.075, (240, 240, 240, 255), font=FB)
        place('RIOT RACING', 0.62, 0.53, 0.03, (240, 240, 240, 255), font=FC)
    else:
        def place2(text, y, z, height, fill):
            f = ImageFont.truetype(FB, int(height / 1.05 * 0.75 * H)); tw = d.textlength(text, font=f)
            for half in (0, 1):
                ux = (y + 1.05) / 2.1 * 0.5 if half == 0 else 0.5 + (1.05 - y) / 2.1 * 0.5
                cx = ux * W; cy = (1 - (z - 0.15) / 1.05 * 0.75) * H
                d.text((cx - tw / 2, cy - height / 1.05 * 0.75 * H / 2), text, font=f, fill=fill)
        place2('POLICE', 0.40, 0.72, 0.06, (27, 63, 143, 255))
        place2('HIGHWAY PATROL', -0.55, 0.86, 0.03, (27, 63, 143, 255))
    tl = np.asarray(im).astype(np.float32); ta = tl[..., 3:4] / 255
    col = col * (1 - ta) + tl[..., :3] * ta; mask = mask * (1 - ta[..., 0])
    rng = np.random.default_rng(5)
    col *= (1 + rng.normal(0, 0.012, col.shape[:2]))[..., None]
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), 'RGB').save(path)
    mr = np.stack([mask * 255, rough * 255, np.zeros_like(mask)], -1)
    Image.fromarray(np.clip(mr, 0, 255).astype(np.uint8), 'RGB').save(path.replace('.png', '_mr.png'))
