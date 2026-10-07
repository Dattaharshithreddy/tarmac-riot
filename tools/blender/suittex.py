"""Paint the racing-leathers texture over MakeHuman's UV layout.
Design rules are evaluated per pixel on the standing body, so panel edges are crisp curves, not mesh steps.
Alpha channel = 'primary colour' mask (the game tints those pixels per rider)."""
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

PRIMARY, BLACK, WHITE, STRETCH, GLOVE, KNUCKLE, GREY = range(7)
REG = {'hand': 0, 'forearm': 1, 'upperarm': 2, 'shoulder': 2, 'thigh': 3, 'shin': 4, 'foot': 5, 'hips': 6, 'spine': 7, 'chest': 7, 'neck': 8, 'head': 8}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf'


def text_img(txt, h=96, pad=8):
    f = ImageFont.truetype(FONT, h)
    w = int(f.getlength(txt)) + pad * 2
    im = Image.new('L', (w, h + pad * 2), 0); ImageDraw.Draw(im).text((pad, pad - h * 0.08), txt, font=f, fill=255)
    return np.asarray(im, dtype=np.float32) / 255.0


def sample(img, u, v):
    """img sampled at u,v in [0,1] (v up). Outside -> 0."""
    h, w = img.shape
    ok = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
    x = np.clip((u * (w - 1)).astype(int), 0, w - 1); y = np.clip(((1 - v) * (h - 1)).astype(int), 0, h - 1)
    out = np.zeros(u.shape, np.float32); out[ok] = img[y[ok], x[ok]]
    return out


def raster(verts, faces, uvs, size):
    """faces: list of (vertex idx list, uv idx list, region code). Returns pixel coords, 3D positions, regions."""
    PX, PY, PP, PR = [], [], [], []
    for idx, uvi, rg in faces:
        n = len(idx)
        for k in range(1, n - 1):
            tri = (0, k, k + 1)
            uv = np.array([uvs[uvi[t]] for t in tri]) * [size, size]
            uv[:, 1] = size - uv[:, 1]
            P = np.array([verts[idx[t]] for t in tri])
            x0, y0 = np.floor(uv.min(axis=0)).astype(int); x1, y1 = np.ceil(uv.max(axis=0)).astype(int)
            x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, size - 1), min(y1, size - 1)
            if x1 < x0 or y1 < y0: continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            gx, gy = gx.ravel(), gy.ravel()
            (ax, ay), (bx, by), (cx, cy) = uv
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-12: continue
            l1 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
            l2 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
            l3 = 1 - l1 - l2
            e = -0.6 / max(1.0, np.sqrt(abs(den)))   # a little overdraw so edges have no gaps
            ins = (l1 >= e) & (l2 >= e) & (l3 >= e)
            if not ins.any(): continue
            L = np.stack([l1[ins], l2[ins], l3[ins]], 1)
            PX.append(gx[ins].astype(int)); PY.append(gy[ins].astype(int)); PP.append(L @ P); PR.append(np.full(ins.sum(), rg))
    return np.concatenate(PX), np.concatenate(PY), np.concatenate(PP), np.concatenate(PR)


def radial(P, A, B):
    d = B - A; L = np.linalg.norm(d, axis=-1, keepdims=True); dn = d / L
    rel = P - A; t = (rel * dn).sum(-1)
    r = rel - dn * t[:, None]; rn = r / np.maximum(np.linalg.norm(r, axis=1, keepdims=True), 1e-9)
    return rn, t / L[:, 0]


def paint(verts, faces, uvs, MB, size=2048, out=None):
    px, py, P, R = raster(verts, faces, uvs, size)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x); s = np.where(x > 0, 1.0, -1.0)
    def J(name):  # per-pixel joint for the pixel's side
        a = np.array(MB[name.replace('#', 'R')]['head']); b = np.array(MB[name.replace('#', 'L')]['head'])
        return np.where((x > 0)[:, None], a, b)
    sh, el, wr = J('upperarm01.#'), J('lowerarm01.#'), J('wrist.#')
    hp, kn, an = J('upperleg01.#'), J('lowerleg01.#'), J('foot.#')
    mcp = (J('finger2-1.#') + J('finger5-1.#')) / 2
    torso_y = MB['spine03']['head'][1]; neck_z = MB['neck01']['head'][2]
    shz = MB['upperarm01.R']['head'][2]; hpz = MB['upperleg01.R']['head'][2]
    C = np.full(len(px), PRIMARY, np.int8)
    rib = np.zeros(len(px), np.float32)
    outward = np.stack([s, np.zeros_like(s), np.zeros_like(s)], 1)

    # hands: black gloves with knuckle armour and a grey palm
    m = R == REG['hand']; C[m] = GLOVE
    k = m & (np.linalg.norm(P - mcp, axis=1) < 0.032) & ((P[:, 0] - mcp[:, 0]) * s > -0.004)
    C[k] = KNUCKLE
    # forearm: gauntlet cuff, black inner sleeve, elbow pad
    m = R == REG['forearm']; rd, t = radial(P, el, wr)
    C[m & ((rd * outward).sum(1) < -0.4)] = BLACK
    C[m & (t > 0.74)] = GLOVE
    C[m & (np.linalg.norm(P - el, axis=1) < 0.05)] = BLACK
    # upper arm and shoulder: white shoulder cap, black inner arm
    m = R == REG['upperarm']; rd, t = radial(P, sh, el)
    C[m & ((rd * outward).sum(1) < -0.5) & (t > 0.1)] = BLACK
    capc = sh + np.stack([s * 0.025, np.zeros_like(s), np.full_like(s, 0.03)], 1)
    cap = np.linalg.norm(P - capc, axis=1) < 0.088
    C[m & (np.linalg.norm(P - el, axis=1) < 0.05)] = BLACK
    # torso, hips and neck by position (region borders there are ragged)
    T = (R == REG['spine']) | (R == REG['hips']) | (R == REG['neck'])
    back = y < torso_y - 0.03; front = y > torso_y
    C[T] = PRIMARY
    C[T & (ax > 0.112) & (z < shz - 0.12) & (z > hpz + 0.03)] = BLACK
    C[T & (z < hpz + 0.035)] = BLACK
    C[T & (z > neck_z - 0.012)] = BLACK
    C[T & back & (ax < 0.022) & (z > hpz + 0.12) & (z < neck_z - 0.012)] = WHITE
    chev = front & (ax < 0.115) & (z > shz - 0.215 + 0.55 * ax) & (z < shz - 0.175 + 0.55 * ax)
    C[T & chev] = WHITE
    zip_ = front & (ax < 0.0055) & (z > hpz + 0.06) & (z < neck_z + 0.02)
    C[T & zip_] = GREY
    C[T & (z > neck_z + 0.03) & (z < neck_z + 0.042)] = WHITE
    st = T & back & (z > hpz - 0.02) & (z < hpz + 0.11) & (ax < 0.085)
    C[st] = STRETCH; rib[st] = z[st]
    # shoulder caps over the torso/arm border
    C[(T | (R == REG['upperarm'])) & cap & (ax > 0.13)] = WHITE
    # legs: black with a primary outer thigh panel edged in white, stretch behind the knee
    m = R == REG['thigh']; rd, t = radial(P, hp, kn); o = (rd * outward).sum(1)
    C[m] = BLACK
    C[m & (o > 0.42) & (t > 0.06) & (t < 0.86)] = PRIMARY
    C[m & (o > 0.30) & (o <= 0.42) & (t > 0.06) & (t < 0.86)] = WHITE
    bk = m & (rd[:, 1] < -0.45) & (t > 0.8)
    C[bk] = STRETCH; rib[bk] = t[bk] * 0.45
    m = R == REG['shin']; C[m] = BLACK
    m = R == REG['foot']; C[m] = BLACK

    # base colours (linear-ish sRGB values, the game multiplies PRIMARY by the rider colour)
    pal = np.array([[236, 236, 236], [22, 23, 26], [236, 236, 236], [44, 45, 50], [20, 21, 24], [70, 72, 78], [90, 92, 98]], np.float32)
    col = pal[C]
    # accordion ribs
    rm = C == STRETCH
    col[rm] *= (0.75 + 0.5 * (np.sin(rib[rm] * 2 * np.pi / 0.011) > 0))[:, None]
    # zip teeth
    zm = C == GREY
    col[zm] *= (0.7 + 0.6 * (np.sin(z[zm] * 2 * np.pi / 0.006) > 0))[:, None]
    # knuckle armour ridges
    km = C == KNUCKLE
    col[km] *= (0.8 + 0.4 * (np.sin((P[km, 1] + P[km, 2]) * 2 * np.pi / 0.012) > 0))[:, None]
    mask = (C == PRIMARY).astype(np.float32)

    # lettering
    def put(txt, sel, u, v, colour, primary_off=True):
        img = text_img(txt); a = sample(img, u, v) * sel
        col[:] = col * (1 - a[:, None]) + np.array(colour, np.float32) * a[:, None]
        if primary_off: mask[:] = mask * (1 - a)
    # back: TARMAC RIOT across the shoulder blades
    sel = (R == REG['spine']) & back
    put('TARMAC RIOT', sel, (x + 0.125) / 0.25, (z - (shz - 0.15)) / 0.05, (20, 20, 22))
    # right chest
    sel = (R == REG['spine']) & front & (x > 0)
    put('RIOT', sel, (0.11 - x) / 0.07, (z - (shz - 0.095)) / 0.026, (20, 20, 22))
    # outer thigh logo
    m = R == REG['thigh']; rd, t = radial(P, hp, kn)
    ang = np.arctan2(rd[:, 1], (rd * outward).sum(1))
    put('TR', m, (ang * s + 0.45) / 0.9, (1 - t - 0.35) / 0.2, (20, 20, 22))

    rough = np.select([C == STRETCH, (C == GLOVE) | (C == KNUCKLE), C == GREY], [0.85, 0.55, 0.35], 0.42)
    img = np.zeros((size, size, 5), np.float32)
    img[py, px, :3] = col; img[py, px, 3] = mask * 255; img[py, px, 4] = rough * 255
    cov = np.zeros((size, size), bool); cov[py, px] = True
    # seams: dark line on class boundaries, light stitching just inside
    cls = np.full((size, size), -1, np.int16); cls[py, px] = C
    edge = np.zeros((size, size), bool)
    for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
        sh_ = np.roll(np.roll(cls, dx, 1), dy, 0)
        edge |= (sh_ != cls) & (sh_ >= 0) & (cls >= 0)
    edge &= ~np.isin(cls, (GLOVE, KNUCKLE, STRETCH))
    seam = ndimage.binary_dilation(edge, iterations=1)
    img[seam, :3] *= 0.45
    stitch_band = ndimage.binary_dilation(edge, iterations=5) & ~ndimage.binary_dilation(edge, iterations=4) & cov
    yy, xx = np.nonzero(stitch_band)
    dash = ((xx + yy) // 4) % 2 == 0
    img[yy[dash], xx[dash], :3] = img[yy[dash], xx[dash], :3] * 0.6 + 70
    # leather grain
    rng = np.random.default_rng(3)
    grain = ndimage.gaussian_filter(rng.normal(0, 1, (size, size)).astype(np.float32), 1.2)
    img[..., :3] *= (1 + 0.035 * grain)[..., None]
    # pad islands so mipmaps don't bleed the background into seams
    for _ in range(10):
        grown = ndimage.grey_dilation(img, size=(3, 3, 1))
        img = np.where(cov[..., None], img, grown)
        cov = ndimage.binary_dilation(cov)
    img = np.clip(img, 0, 255).astype(np.uint8)
    im = Image.fromarray(img[..., :3], 'RGB')
    mr = np.stack([img[..., 3], img[..., 4], np.zeros_like(img[..., 3])], -1)   # R = tint mask, G = roughness, B = metal
    if out:
        im.save(out, optimize=True); Image.fromarray(mr, 'RGB').save(out.replace('.png', '_mr.png'), optimize=True)
    return im
