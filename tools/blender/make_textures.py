"""Painted textures for vehicles (PIL)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random, math
D = '/home/claude/blender/tex/'
F = '/usr/share/fonts/truetype/dejavu/'
def font(sz, cond=True, oblique=False):
    name = 'DejaVuSansCondensed-Bold' + ('Oblique' if oblique else '') + '.ttf' if cond else 'DejaVuSans-Bold.ttf'
    return ImageFont.truetype(F + name, sz)
def centered(d, xy, text, f, fill, stroke=0, sfill=None):
    w = d.textlength(text, font=f); d.text((xy[0] - w / 2, xy[1]), text, font=f, fill=fill, stroke_width=stroke, stroke_fill=sfill)

def plate(name, text, bg=(245, 245, 245), fg=(20, 20, 20)):
    im = Image.new('RGB', (256, 64), bg); d = ImageDraw.Draw(im)
    d.rectangle([2, 2, 253, 61], outline=fg, width=3); centered(d, (128, 10), text, font(38), fg); im.save(D + name)

def truck_rear(name, base, v):
    W, H = 512, 512; im = Image.new('RGB', (W, H), base); d = ImageDraw.Draw(im); r = random.Random(v)
    # painted border bands
    bands = [(242, 183, 5), (31, 169, 122), (217, 56, 43), (33, 103, 214)]
    for i, c in enumerate(bands): d.rectangle([0, i * 14, W, i * 14 + 14], fill=c); d.rectangle([0, H - 56 + i * 14, W, H - 42 + i * 14], fill=c)
    for x in range(0, W, 32):  # little painted diamonds
        d.polygon([(x + 16, 60), (x + 28, 74), (x + 16, 88), (x + 4, 74)], fill=bands[(x // 32) % 4])
    d.rounded_rectangle([40, 110, W - 40, 250], 18, fill=(250, 246, 235), outline=(20, 20, 20), width=4)
    msgs = [('HORN', 'OK PLEASE'), ('BUDDY', 'WAIT'), ('SAFE', 'JOURNEY'), ('USE', 'DIPPER AT NIGHT')]
    a, b = msgs[v % 4]
    centered(d, (W / 2, 118), a, font(70, oblique=True), (200, 30, 30), 2, (40, 0, 0))
    centered(d, (W / 2, 190), b, font(46 if len(b) < 11 else 34, oblique=True), (20, 60, 160))
    # eyes / lotus motif
    for cx in (130, W - 130):
        d.ellipse([cx - 50, 280, cx + 50, 340], fill=(255, 255, 255), outline=(20, 20, 20), width=4)
        d.ellipse([cx - 18, 292, cx + 18, 328], fill=(30, 30, 30))
    d.polygon([(W / 2, 270), (W / 2 + 40, 330), (W / 2, 360), (W / 2 - 40, 330)], fill=(255, 120, 0), outline=(120, 40, 0))
    d.rectangle([120, 380, W - 120, 420], fill=(250, 250, 250), outline=(10, 10, 10), width=3)
    centered(d, (W / 2, 383), 'RJ 14 GA %04d' % (1000 + v * 1337 % 9000), font(30), (10, 10, 10))
    im = im.filter(ImageFilter.GaussianBlur(0.6)); im.save(D + name)

def truck_side(name, base, v):
    W, H = 1024, 256; im = Image.new('RGB', (W, H), base); d = ImageDraw.Draw(im)
    for y in range(0, H - 40, 22): d.rectangle([0, y, W, y + 2], fill=tuple(max(0, c - 45) for c in base))   # wooden planks
    for x in range(0, W, 128): d.rectangle([x, 0, x + 8, H - 40], fill=(90, 92, 98))                       # steel stanchions
    for k in range(0, W, 48):
        d.polygon([(k + 24, 196), (k + 34, 206), (k + 24, 216), (k + 14, 206)], fill=[(242, 183, 5), (31, 169, 122), (217, 56, 43), (255, 255, 255)][(k // 48) % 4])
    bands = [(242, 183, 5), (31, 169, 122), (217, 56, 43)]
    for i, c in enumerate(bands): d.rectangle([0, H - 40 + i * 13, W, H - 27 + i * 13], fill=c)
    names = ['SHREE GANESH ROADWAYS', 'JAI MATA DI TRANSPORT', 'NATIONAL CARRIERS', 'SAI BABA LOGISTICS']
    tw = d.textlength(names[v % 4], font=font(40))
    d.rounded_rectangle([512 - tw / 2 - 28, 60, 512 + tw / 2 + 28, 160], 16, fill=(250, 246, 235), outline=(20, 20, 20), width=4)
    centered(d, (512, 88), names[v % 4], font(40), (180, 20, 20))
    im.save(D + name)

def bus_side(name):
    W, H = 1024, 256; im = Image.new('RGB', (W, H), (198, 45, 34)); d = ImageDraw.Draw(im)
    d.rectangle([0, 150, W, 176], fill=(242, 242, 242)); d.rectangle([0, 176, W, 186], fill=(242, 183, 5))
    for x in range(20, W - 40, 92):
        d.rounded_rectangle([x, 26, x + 80, 128], 8, fill=(22, 32, 44)); d.rectangle([x + 4, 30, x + 26, 124], fill=(52, 70, 88))
    centered(d, (512, 196), 'STATE TRANSPORT', font(40, oblique=True), (255, 255, 255))
    im.save(D + name)

def bus_rear(name):
    W, H = 512, 512; im = Image.new('RGB', (W, H), (198, 45, 34)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([50, 60, W - 50, 230], 16, fill=(22, 32, 44)); d.rectangle([70, 70, 200, 220], fill=(52, 70, 88))
    d.rectangle([120, 16, W - 120, 52], fill=(255, 179, 0)); centered(d, (W / 2, 18), 'PUNE - GOA', font(28), (20, 20, 20))
    d.rectangle([0, 300, W, 340], fill=(242, 242, 242)); d.rectangle([0, 340, W, 352], fill=(242, 183, 5))
    centered(d, (W / 2, 250), 'HORN OK PLEASE', font(34, oblique=True), (255, 255, 255))
    d.rectangle([170, 400, W - 170, 440], fill=(250, 250, 250), outline=(0, 0, 0), width=3); centered(d, (W / 2, 403), 'MH 14 BT 2046', font(28), (10, 10, 10))
    im.save(D + name)

def auto_rear(name):
    W, H = 256, 256; im = Image.new('RGB', (W, H), (20, 20, 20)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([20, 20, W - 20, 120], 10, fill=(40, 52, 64)); d.rectangle([30, 28, 90, 112], fill=(70, 86, 100))
    centered(d, (W / 2, 140), 'NO SMOKING', font(22), (255, 210, 0))
    centered(d, (W / 2, 175), 'LOVE ALL', font(26, oblique=True), (255, 255, 255))
    d.rectangle([60, 212, W - 60, 244], fill=(255, 210, 0)); centered(d, (W / 2, 214), 'KA 05 C 9921', font(22), (0, 0, 0))
    im.save(D + name)

plate('plate_mh.png', 'MH 01 AB 4521'); plate('plate_ka.png', 'KA 03 MN 7788'); plate('plate_taxi.png', 'MH 02 T 6650', bg=(255, 205, 0))
for v, base in enumerate([(33, 103, 214), (217, 56, 43), (232, 140, 30), (22, 140, 110)]):
    truck_rear('truck_rear_%d.png' % v, base, v); truck_side('truck_side_%d.png' % v, base, v)
bus_side('bus_side.png'); bus_rear('bus_rear.png'); auto_rear('auto_rear.png')
print('textures ok')
