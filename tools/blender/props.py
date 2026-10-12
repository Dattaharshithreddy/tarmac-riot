"""Road-work props for Tarmac Riot: highway cone, striped plastic drum with an amber blinker, and a road-work barricade.
Built to real sizes (metres) with retro-reflective bands so they stand out against asphalt.
usage: python runb.py props.py OUTDIR [cone,drum,barricade]"""
import sys, math, os
sys.path.insert(0, '/home/claude/blender')
from trlib import *
import parts as PT
from PIL import Image, ImageDraw, ImageFont
import bpy
from mathutils import Vector as V

TEX = '/home/claude/blender/tex'
os.makedirs(TEX, exist_ok=True)


def orange():  return mat('PropOrange', hexc('#ff5a0a'), rough=0.45, emit=hexc('#ff4a00'), emit_str=0.25)
def reflect(): return mat('Reflective', hexc('#f4f6f8'), metal=0.0, rough=0.25, emit=hexc('#ffffff'), emit_str=0.35)
def rubber(): return mat('PropRubber', hexc('#141416'), rough=0.9)


def cone(out):
    """90 cm highway cone: square rubber base, two reflective collars."""
    reset()
    objs = [box('base', (0.44, 0.44, 0.05), (0, 0, 0.025), rubber(), bevel=0.02)]
    H, r0, r1 = 0.86, 0.17, 0.035
    rad = lambda z: r0 + (r1 - r0) * (z / H)
    bands = [(0.0, 0.33, orange()), (0.33, 0.45, reflect()), (0.45, 0.55, orange()), (0.55, 0.64, reflect()), (0.64, H, orange())]
    for i, (z0, z1, m) in enumerate(bands):
        c = cyl('cone%d' % i, rad(z0), z1 - z0, (0, 0, 0.05 + (z0 + z1) / 2), m, seg=28, r2=rad(z1), caps=(i == len(bands) - 1))
        objs.append(c)
    objs.append(sphere('tip', r1 * 1.05, (0, 0, 0.05 + H), orange(), seg=16, rings=8))
    apply_all(objs); join_by_material('cone'); print('cone TRIS', tri_count()); export(out)


def drum(out):
    """Striped channelising drum (as used on Indian highways) with an amber lamp on top."""
    reset()
    H, R = 1.0, 0.29
    stripes = [orange(), reflect(), orange(), reflect(), orange()]
    objs = [cyl('foot', R + 0.08, 0.07, (0, 0, 0.035), rubber(), seg=32)]
    h = H / len(stripes)
    for i, m in enumerate(stripes):
        r_lo, r_hi = R - 0.012 * i, R - 0.012 * (i + 1)
        objs.append(cyl('ring%d' % i, r_lo, h, (0, 0, 0.07 + h * (i + 0.5)), m, seg=32, r2=r_hi, caps=(i == len(stripes) - 1)))
        if i < len(stripes) - 1: objs.append(torus('rib%d' % i, r_hi + 0.004, 0.012, (0, 0, 0.07 + h * (i + 1)), m if i % 2 else orange(), seg=32, mseg=6))
    amber = mat('Blinker', hexc('#ffb000'), rough=0.2, emit=hexc('#ffa000'), emit_str=4.0)
    objs.append(cyl('lamp_post', 0.025, 0.12, (0, 0, 1.13), rubber(), seg=10))
    objs.append(cyl('lamp', 0.085, 0.07, (0, 0, 1.22), amber, seg=20))
    objs.append(cyl('lamp_hood', 0.095, 0.02, (0, 0, 1.265), rubber(), seg=20))
    apply_all(objs); join_by_material('drum'); print('drum TRIS', tri_count()); export(out)


def barricade_tex(path):
    w, h = 512, 128
    im = Image.new('RGB', (w, h), (245, 245, 245)); d = ImageDraw.Draw(im)
    for k in range(-4, 14):
        x = k * 64
        d.polygon([(x, h), (x + 32, h), (x + 32 + h, 0), (x + h, 0)], fill=(210, 28, 24))
    im.save(path)
    sign = Image.new('RGB', (256, 256), (255, 205, 0)); d = ImageDraw.Draw(sign)
    d.rectangle([6, 6, 249, 249], outline=(20, 20, 20), width=10)
    f = ImageFont.truetype(PT.FONT_B, 54)
    for i, t in enumerate(('ROAD', 'WORK', 'AHEAD')):
        d.text(((256 - d.textlength(t, font=f)) / 2, 22 + i * 72), t, font=f, fill=(15, 15, 15))
    sign.save(path.replace('.png', '_sign.png'))


def barricade(out):
    """A-frame road-work barricade, 1.6 m wide, striped boards and a ROAD WORK sign."""
    reset()
    p = TEX + '/barricade.png'; barricade_tex(p)
    BOARD = tex_mat('BarricadeBoard', p, rough=0.35); SIGN = tex_mat('RoadWorkSign', p.replace('.png', '_sign.png'), rough=0.4)
    LEG = mat('BarricadeLeg', hexc('#e8e8e8'), metal=0.6, rough=0.4)
    objs = []
    for x in (-0.72, 0.72):
        for s in (1, -1): objs.append(cyl_between('leg%+.1f%+d' % (x, s), (x, s * 0.32, 0.0), (x, 0.0, 1.05), 0.025, LEG, seg=10))
        objs.append(box('foot%+.1f' % x, (0.08, 0.75, 0.04), (x, 0, 0.02), rubber()))
    for z in (0.92, 0.58):
        for side in (1, -1):
            b = textured_box('board%.2f%+d' % (z, side), (1.6, 0.025, 0.2), (0, side * 0.08 * (1.05 - z) / 0.5, z), [BOARD] * 6)
            b.rotation_euler = (side * 0.29, 0, 0); objs.append(b)
    s = textured_box('sign', (0.62, 0.02, 0.62), (0, -0.16, 1.45), [SIGN] * 6); objs.append(s)
    objs.append(cyl_between('signpost', (0, -0.12, 1.0), (0, -0.15, 1.2), 0.02, LEG, seg=8))
    amber = mat('Blinker', hexc('#ffb000'), rough=0.2, emit=hexc('#ffa000'), emit_str=4.0)
    for x in (-0.72, 0.72): objs.append(cyl('blink%+.1f' % x, 0.06, 0.06, (x, 0, 1.12), amber, seg=16))
    apply_all(objs); join_by_material('barricade'); print('barricade TRIS', tri_count()); export(out)


if __name__ == '__main__':
    outd = sys.argv[sys.argv.index('--') + 1]
    which = sys.argv[sys.argv.index('--') + 2].split(',') if len(sys.argv) > sys.argv.index('--') + 2 else ['cone', 'drum', 'barricade']
    for k in which: {'cone': cone, 'drum': drum, 'barricade': barricade}[k](outd + '/' + k + '.glb')
