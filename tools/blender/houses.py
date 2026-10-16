"""Indian roadside buildings for Tarmac Riot, one GLB with roots house0..house3:
house0 Kerala tiled-roof house with verandah, house1 pastel flat-roof house with water tank and balcony,
house2 two-shutter shop with signboard, house3 Kerala house variant (green walls, smaller).
Front faces -Y in Blender (towards the road after placement). usage: python runb.py houses.py OUT.glb"""
import sys, math, os, random
sys.path.insert(0, '/home/claude/blender')
from trlib import *
import parts as PT
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import bpy, bmesh
from mathutils import Vector as V

TEX = '/home/claude/blender/tex'; os.makedirs(TEX, exist_ok=True)


def tex_tiles(path):
    W, H = 256, 256; im = Image.new('RGB', (W, H), (150, 60, 36)); d = ImageDraw.Draw(im); R = random.Random(2)
    for row in range(8):
        y = row * 32
        for col in range(9):
            x = col * 32 - (16 if row % 2 else 0)
            c = (int(170 + R.randint(-25, 20)), int(72 + R.randint(-15, 15)), int(40 + R.randint(-10, 10)))
            d.rounded_rectangle([x + 1, y + 1, x + 31, y + 30], radius=8, fill=c)
            d.line([(x + 2, y + 28), (x + 30, y + 28)], fill=(90, 34, 20), width=3)
    for i in range(400):     # moss / grime
        x, y = R.randint(0, W - 1), R.randint(0, H - 1); d.ellipse([x, y, x + R.randint(2, 6), y + R.randint(2, 5)], fill=(70, 70, 40))
    im.filter(ImageFilter.GaussianBlur(0.6)).save(path)


def tex_wall(path, base, stain=True):
    W, H = 256, 256; im = Image.new('RGB', (W, H), base); d = ImageDraw.Draw(im); R = random.Random(sum(base))
    for i in range(3000):
        x, y = R.randint(0, W - 1), R.randint(0, H - 1); v = R.randint(-12, 12)
        d.point((x, y), fill=tuple(max(0, min(255, c + v)) for c in base))
    if stain:   # monsoon streaks below the eaves and a dirty skirting
        for i in range(26):
            x = R.randint(0, W); l = R.randint(20, 90)
            for k in range(l): d.point((x + R.randint(-1, 1), k), fill=tuple(int(c * 0.82) for c in base))
        d.rectangle([0, H - 30, W, H], fill=tuple(int(c * 0.72) for c in base))
    im.save(path)


def tex_window(path):
    im = Image.new('RGB', (128, 128), (40, 60, 70)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 127, 127], outline=(230, 230, 225), width=8)
    for x in (42, 85): d.line([(x, 0), (x, 127)], fill=(20, 24, 26), width=4)
    d.line([(0, 64), (127, 64)], fill=(230, 230, 225), width=6)
    d.polygon([(10, 10), (50, 10), (20, 60), (10, 60)], fill=(70, 95, 110))
    im.save(path)


def tex_door(path, col):
    im = Image.new('RGB', (128, 256), col); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 127, 255], outline=tuple(int(c * 0.6) for c in col), width=8)
    for y in (20, 136): d.rectangle([20, y, 107, y + 100], outline=tuple(int(c * 0.7) for c in col), width=5)
    d.ellipse([96, 130, 106, 140], fill=(210, 180, 80))
    im.save(path)


def tex_shutter(path):
    im = Image.new('RGB', (256, 256), (130, 136, 142)); d = ImageDraw.Draw(im)
    for y in range(0, 256, 8): d.line([(0, y), (255, y)], fill=(95, 100, 106), width=3)
    d.rectangle([100, 230, 156, 246], fill=(60, 60, 60))
    im.save(path)


def tex_sign(path, txt, bg, fg):
    im = Image.new('RGB', (512, 128), bg); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(PT.FONT_B, 64)
    while d.textlength(txt, font=f) > 470: f = ImageFont.truetype(PT.FONT_B, f.size - 2)
    d.text(((512 - d.textlength(txt, font=f)) / 2, 26), txt, font=f, fill=fg)
    d.rectangle([0, 0, 511, 127], outline=fg, width=6)
    im.save(path)


def gable_roof(name, w, dpt, ridge, z0, over, M):
    """Two sloped planes plus thickness; tile texture repeats per metre."""
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    hw, hd = w / 2 + over, dpt / 2 + over
    for s in (1, -1):
        a = bm.verts.new((-hw, s * hd, z0)); b = bm.verts.new((hw, s * hd, z0)); c = bm.verts.new((hw, 0, z0 + ridge)); e = bm.verts.new((-hw, 0, z0 + ridge))
        f = bm.faces.new((a, b, c, e) if s < 0 else (e, c, b, a))
        L = math.hypot(hd, ridge)
        uvs = {a: (0, 0), b: (2 * hw / 1.6, 0), c: (2 * hw / 1.6, L / 1.6), e: (0, L / 1.6)}
        for loop in f.loops: loop[uvl].uv = uvs[loop.vert]
    ob = mesh_obj(name, bm, M, smooth=False)
    sol = ob.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.08
    return ob


def wall_box(name, w, dpt, h, z, M, scale=2.5):
    ob = box(name, (w, dpt, h), (0, 0, z + h / 2), M, smooth=False)
    me = ob.data; me.uv_layers.new(name='UVMap'); uvl = me.uv_layers[0].data
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (co.x if abs(n.y) > 0.5 else co.y) / scale; v = (co.z + h / 2) / scale
            uvl[li].uv = (u, v)
    return ob


def decal_on(name, w, h, x, y, z, M):
    return decal(name, w, h, (x, y, z), M)


def house_kerala(tag, wall_col, M):
    objs = []
    W, D, H = 8.0, 6.5, 3.2
    objs.append(wall_box(tag + 'walls', W, D, H, 0.45, M['wall_' + wall_col]))
    objs.append(box(tag + 'plinth', (W + 1.4, D + 2.6, 0.45), (0, -0.6, 0.225), M['plinth'], smooth=False))
    objs.append(gable_roof(tag + 'roof', W, D + 2.0, 2.3, 0.45 + H, 0.7, M['tiles']))
    for x in (-3.4, -1.1, 1.1, 3.4):   # verandah pillars along the front
        objs.append(cyl(tag + 'pillar%+.1f' % x, 0.14, H, (x, -D / 2 - 1.1, 0.45 + H / 2), M['white'], seg=12))
    objs.append(decal_on(tag + 'door', 1.2, 2.2, -0.6, -D / 2 - 0.01, 0.45 + 1.1, M['door']))
    for x in (2.2, -2.8): objs.append(decal_on(tag + 'win%+.1f' % x, 1.2, 1.2, x, -D / 2 - 0.01, 0.45 + 1.7, M['window']))
    for x in (-1.6, 1.6): objs.append(decal(tag + 'swin%+.1f' % x, 1.0, 1.0, (W / 2 + 0.01, x, 0.45 + 1.7), M['window'], rot=(0, 0, math.pi / 2)))
    return objs


def house_flat(tag, M):
    objs = []
    W, D, H = 7.0, 7.0, 3.0
    objs.append(wall_box(tag + 'g', W, D, H, 0.3, M['wall_pink']))
    objs.append(wall_box(tag + 'f1', W, D, H, 0.3 + H + 0.2, M['wall_pink']))
    objs.append(box(tag + 'slab0', (W + 0.6, D + 0.6, 0.2), (0, 0, 0.3 + H + 0.1), M['white'], smooth=False))
    objs.append(box(tag + 'slab1', (W + 0.6, D + 0.6, 0.2), (0, 0, 0.5 + 2 * H + 0.1), M['white'], smooth=False))
    objs.append(box(tag + 'parapet', (W + 0.6, D + 0.6, 0.6), (0, 0, 0.6 + 2 * H + 0.5), M['white'], smooth=False))
    objs.append(box(tag + 'plinth', (W + 0.4, D + 0.4, 0.3), (0, 0, 0.15), M['plinth'], smooth=False))
    # black plastic water tank, the classic Indian rooftop
    objs.append(cyl(tag + 'tank', 0.65, 1.2, (1.8, 1.6, 2 * H + 1.8), M['tank'], seg=20))
    objs.append(cyl(tag + 'tanklid', 0.3, 0.1, (1.8, 1.6, 2 * H + 2.45), M['tank'], seg=16))
    # balcony with railing on the first floor
    objs.append(box(tag + 'balc', (3.2, 1.2, 0.15), (-1.2, -D / 2 - 0.6, 0.3 + H + 0.2), M['white'], smooth=False))
    for k in range(12): objs.append(box(tag + 'rail%d' % k, (0.04, 0.04, 0.9), (-2.7 + k * 0.27, -D / 2 - 1.15, 0.3 + H + 0.75), M['iron'], smooth=False))
    objs.append(box(tag + 'railtop', (3.2, 0.06, 0.06), (-1.2, -D / 2 - 1.15, 0.3 + H + 1.2), M['iron'], smooth=False))
    objs.append(decal_on(tag + 'door', 1.1, 2.1, 1.6, -D / 2 - 0.01, 0.3 + 1.05, M['door2']))
    objs.append(decal_on(tag + 'w0', 1.2, 1.2, -1.6, -D / 2 - 0.01, 0.3 + 1.6, M['window']))
    objs.append(decal_on(tag + 'w1', 1.2, 1.4, -1.2, -D / 2 - 0.01, 0.5 + H + 1.6, M['window']))
    objs.append(decal_on(tag + 'w2', 1.2, 1.2, 1.8, -D / 2 - 0.01, 0.5 + H + 1.6, M['window']))
    return objs


def shop(tag, M):
    objs = []
    W, D, H = 8.0, 5.0, 3.4
    objs.append(wall_box(tag + 'walls', W, D, H, 0.3, M['wall_cream']))
    objs.append(box(tag + 'plinth', (W + 0.4, D + 1.6, 0.3), (0, -0.6, 0.15), M['plinth'], smooth=False))
    objs.append(box(tag + 'slab', (W + 0.6, D + 0.6, 0.25), (0, 0, 0.3 + H + 0.12), M['white'], smooth=False))
    objs.append(box(tag + 'awning', (W + 0.4, 1.6, 0.06), (0, -D / 2 - 0.75, 0.3 + H - 0.5), M['awning'], rot=(math.radians(-12), 0, 0), smooth=False))
    for x in (-1.95, 1.95): objs.append(decal_on(tag + 'shut%+.1f' % x, 3.4, 2.6, x, -D / 2 - 0.01, 0.3 + 1.3, M['shutter']))
    objs.append(decal_on(tag + 'sign', 7.4, 1.0, 0, -D / 2 - 0.03, 0.3 + H - 0.0, M['sign']))
    for x in (-3.0, 3.0): objs.append(cyl(tag + 'pole%+.0f' % x, 0.05, H - 0.4, (x, -D / 2 - 1.5, 0.3 + (H - 0.4) / 2), M['iron'], seg=8))
    # crates of produce outside
    for i, x in enumerate((-3.2, -2.4, 2.6)):
        objs.append(box(tag + 'crate%d' % i, (0.7, 0.5, 0.45), (x, -D / 2 - 0.9, 0.3 + 0.22), M['wood'], smooth=False))
        objs.append(box(tag + 'fruit%d' % i, (0.62, 0.42, 0.12), (x, -D / 2 - 0.9, 0.3 + 0.48), M['fruit%d' % (i % 2)], smooth=False))
    return objs


def build(out):
    reset()
    tex_tiles(TEX + '/h_tiles.png')
    walls = {'white': (238, 234, 222), 'green': (196, 222, 196), 'pink': (240, 196, 196), 'cream': (240, 228, 196)}
    for k, c in walls.items(): tex_wall(TEX + '/h_wall_%s.png' % k, c)
    tex_window(TEX + '/h_window.png'); tex_door(TEX + '/h_door.png', (110, 70, 40)); tex_door(TEX + '/h_door2.png', (40, 90, 130))
    tex_shutter(TEX + '/h_shutter.png'); tex_sign(TEX + '/h_sign.png', 'SRI GANESH STORES', (255, 205, 0), (170, 20, 20))
    M = {'tiles': tex_mat('HTiles', TEX + '/h_tiles.png', rough=0.8), 'window': tex_mat('HWindow', TEX + '/h_window.png', rough=0.2, metal=0.3),
         'door': tex_mat('HDoor', TEX + '/h_door.png', rough=0.6), 'door2': tex_mat('HDoor2', TEX + '/h_door2.png', rough=0.5),
         'shutter': tex_mat('HShutter', TEX + '/h_shutter.png', rough=0.5, metal=0.6), 'sign': tex_mat('HSign', TEX + '/h_sign.png', rough=0.5),
         'plinth': mat('HPlinth', hexc('#7a7068'), rough=0.9), 'white': mat('HWhite', hexc('#efede6'), rough=0.7),
         'tank': mat('HTank', hexc('#141414'), rough=0.5), 'iron': mat('HIron', hexc('#2b3a33'), metal=0.6, rough=0.4),
         'awning': mat('HAwning', hexc('#2167d6'), rough=0.6), 'wood': mat('HWood', hexc('#8a5a30'), rough=0.8),
         'fruit0': mat('HFruit0', hexc('#f2a01c'), rough=0.6), 'fruit1': mat('HFruit1', hexc('#d0302a'), rough=0.6)}
    for k in walls: M['wall_' + k] = tex_mat('HWall_' + k, TEX + '/h_wall_%s.png' % k, rough=0.9)
    sets = [('house0', lambda: house_kerala('h0', 'white', M)), ('house1', lambda: house_flat('h1', M)),
            ('house2', lambda: shop('h2', M)), ('house3', lambda: house_kerala('h3', 'green', M))]
    x = 0
    for name, fn in sets:
        before = set(bpy.context.scene.objects)
        objs = fn()
        apply_all(objs)
        root = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(root)
        for o in objs: o.parent = root
        root.location = (x, 0, 0); x += 14
    print('houses TRIS', tri_count())
    export(out)


if __name__ == '__main__':
    build(sys.argv[sys.argv.index('--') + 1])
