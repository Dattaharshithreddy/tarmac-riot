"""Victory ceremony set for Tarmac Riot: stage with 1-2-3 podium, branded backdrop, lighting truss,
bunting, confetti cannons, and a separate golden trophy. Front of the stage faces -Y (towards the camera).
usage: python runb.py podium.py OUT.glb"""
import sys, math, os
sys.path.insert(0, '/home/claude/blender')
from trlib import *
import parts as PT
from PIL import Image, ImageDraw, ImageFont
import bpy, bmesh
from mathutils import Vector as V

TEX = '/home/claude/blender/tex'; os.makedirs(TEX, exist_ok=True)
FB = PT.FONT_B; FBO = PT.FONT_BO


def font(f, size): return ImageFont.truetype(f, size)


def tex_backdrop(path):
    W, H = 2048, 768
    im = Image.new('RGB', (W, H), (14, 16, 24)); d = ImageDraw.Draw(im)
    # diagonal speed stripes
    for k in range(-10, 40):
        x = k * 90
        d.polygon([(x, H), (x + 40, H), (x + 40 + H * 0.6, 0), (x + H * 0.6, 0)], fill=(22, 26, 38))
    # checkered bands top and bottom
    for y0 in (0, H - 48):
        for i in range(0, W, 48):
            for j in range(2):
                if (i // 48 + j) % 2 == 0: d.rectangle([i, y0 + j * 24, i + 47, y0 + j * 24 + 23], fill=(240, 240, 240))
    # title
    t1 = 'TARMAC RIOT'; f1 = font(FBO, 210)
    tw = d.textlength(t1, font=f1); d.text(((W - tw) / 2 + 6, 120 + 6), t1, font=f1, fill=(120, 40, 0))
    d.text(((W - tw) / 2, 120), t1, font=f1, fill=(255, 106, 0))
    t2 = 'CHAMPIONS'; f2 = font(FBO, 120)
    tw2 = d.textlength(t2, font=f2); d.text(((W - tw2) / 2, 370), t2, font=f2, fill=(255, 212, 0))
    # sponsor strip (made-up brands)
    sp = ['CHAI ₹5', 'HORN OK', 'NITRO X', 'DHABA 24x7', 'RIOT OIL']
    f3 = font(FB, 54); xs = W / len(sp)
    for i, s in enumerate(sp):
        x = xs * i + xs / 2; w = d.textlength(s, font=f3)
        d.rounded_rectangle([x - w / 2 - 24, 560, x + w / 2 + 24, 650], radius=14, fill=(255, 255, 255) if i % 2 else (230, 57, 70))
        d.text((x - w / 2, 572), s, font=f3, fill=(20, 20, 20) if i % 2 else (255, 255, 255))
    im.save(path)


def tex_number(path, n, base, dark):
    S = 512
    im = Image.new('RGB', (S, S), base); d = ImageDraw.Draw(im)
    for i in range(S):            # vertical sheen
        k = 0.85 + 0.25 * math.sin(i / S * math.pi)
        d.line([(i, 0), (i, S)], fill=tuple(min(255, int(c * k)) for c in base))
    d.rectangle([0, 0, S - 1, 26], fill=dark); d.rectangle([0, S - 27, S - 1, S - 1], fill=dark)
    f = font(FB, 330); t = str(n); w = d.textlength(t, font=f)
    d.text(((S - w) / 2 + 8, 70 + 8), t, font=f, fill=dark); d.text(((S - w) / 2, 70), t, font=f, fill=(255, 255, 255))
    im.save(path)


def tex_carpet(path):
    im = Image.new('RGB', (256, 512), (150, 18, 28)); d = ImageDraw.Draw(im)
    for y in range(0, 512, 3): d.line([(0, y), (255, y)], fill=(140 + (y * 7) % 20, 16, 26))
    d.rectangle([0, 0, 14, 511], fill=(212, 170, 60)); d.rectangle([241, 0, 255, 511], fill=(212, 170, 60))
    im.save(path)


def build(out):
    reset()
    tex_backdrop(TEX + '/pod_backdrop.png'); tex_carpet(TEX + '/pod_carpet.png')
    for n, base, dark in ((1, (226, 178, 40), (120, 84, 10)), (2, (176, 182, 192), (80, 86, 96)), (3, (196, 120, 62), (96, 52, 22))):
        tex_number(TEX + '/pod_%d.png' % n, n, base, dark)
    BACK = tex_mat('PodBackdrop', TEX + '/pod_backdrop.png', rough=0.5, emit=True)
    CARPET = tex_mat('PodCarpet', TEX + '/pod_carpet.png', rough=0.9)
    N = [tex_mat('PodNum%d' % n, TEX + '/pod_%d.png' % n, rough=0.35, metal=0.3) for n in (1, 2, 3)]
    TOPS = [mat('PodTop%d' % n, hexc(c), metal=0.6, rough=0.3) for n, c in ((1, '#d9a62a'), (2, '#aeb4bd'), (3, '#b8743c'))]
    STAGE = mat('PodStage', hexc('#1b1d24'), metal=0.2, rough=0.6)
    TRUSS = mat('PodTruss', hexc('#c9ccd2'), metal=0.9, rough=0.3)
    LAMP = mat('PodLamp', hexc('#ffffff'), rough=0.2, emit=hexc('#fff3d6'), emit_str=6.0)
    BLACK = mat('PodBlack', hexc('#0e0f12'), rough=0.6)
    objs = []
    # stage and carpet
    objs.append(box('stage', (14.0, 7.0, 0.35), (0, 0.8, 0.175), STAGE, bevel=0.04))
    objs.append(textured_box('carpet', (3.4, 6.0, 0.02), (0, -1.0, 0.36), [CARPET] * 6))
    for x in (-5.2, 5.2):
        objs.append(box('step%+.0f' % x, (2.2, 0.6, 0.18), (x, -2.95, 0.09), STAGE, bevel=0.02))
    # podium blocks: 1st centre, 2nd on its right (stage left of camera), 3rd on its left
    for i, (x, h) in enumerate(((0.0, 1.25), (-2.5, 0.9), (2.5, 0.62))):
        w, dpt = 2.4, 2.0
        blk = textured_box('pod%d' % (i + 1), (w, dpt, h), (x, 0.4, 0.35 + h / 2), [TOPS[i], TOPS[i], TOPS[i], N[i], TOPS[i], TOPS[i]])
        objs.append(blk)
        objs.append(box('podtop%d' % (i + 1), (w + 0.1, dpt + 0.1, 0.06), (x, 0.4, 0.35 + h + 0.03), TOPS[i], bevel=0.02))
    # backdrop panel, slightly curved, with frame
    bw, bh = 15.0, 5.6
    bp = textured_box('backdrop', (bw, 0.12, bh), (0, 3.9, 0.35 + bh / 2 + 0.2), [BLACK, BLACK, BLACK, BACK, BLACK, BLACK]); objs.append(bp)
    # truss: two towers and a header
    def truss_tower(x):
        for dx in (-0.25, 0.25):
            for dy in (-0.25, 0.25): objs.append(cyl('tt%+.1f%+.2f%+.2f' % (x, dx, dy), 0.035, 8.6, (x + dx, 3.6 + dy, 4.3), TRUSS, seg=8))
        for k in range(12):
            z = 0.4 + k * 0.7
            objs.append(cyl_between('tx%+.1f%d' % (x, k), (x - 0.25, 3.35, z), (x + 0.25, 3.85, z + 0.6), 0.015, TRUSS, seg=6))
    truss_tower(-8.0); truss_tower(8.0)
    for dz in (8.4, 8.9):
        for dy in (3.35, 3.85): objs.append(cyl_between('th%.1f%.2f' % (dz, dy), (-8.25, dy, dz), (8.25, dy, dz), 0.035, TRUSS, seg=8))
    for k in range(32):
        x = -8.0 + k * 0.5
        objs.append(cyl_between('thx%d' % k, (x, 3.35, 8.4), (x + 0.5, 3.85, 8.9), 0.015, TRUSS, seg=6))
    # stage lights hanging from the header, aimed at the podium
    for x in (-6, -3.5, -1.2, 1.2, 3.5, 6):
        can = cyl('lamp%+.1f' % x, 0.18, 0.4, (x, 3.3, 8.0), BLACK, rot=(math.radians(-55), 0, 0), seg=12)
        objs.append(can)
        lens = cyl('lens%+.1f' % x, 0.15, 0.02, (x, 3.14, 7.9), LAMP, rot=(math.radians(-55), 0, 0), seg=12); objs.append(lens)
    # bunting: triangles strung between the towers
    cols = [hexc(c) for c in ('#ff6a00', '#ffffff', '#138808', '#ffd400', '#2d6cdf', '#e63946')]
    BUNT = [mat('Bunt%d' % i, c, rough=0.6) for i, c in enumerate(cols)]
    for k in range(34):
        t = (k + 0.5) / 34; x = -7.8 + 15.6 * t; z = 8.2 - math.sin(t * math.pi) * 1.2
        bm = bmesh.new(); a = bm.verts.new((-0.2, 0, 0)); b = bm.verts.new((0.2, 0, 0)); c = bm.verts.new((0, 0, -0.45)); bm.faces.new((a, b, c))
        tri = mesh_obj('bunt%d' % k, bm, BUNT[k % len(BUNT)], smooth=False); tri.location = (x, 3.2, z); objs.append(tri)
    # confetti cannons on the stage corners
    for x in (-6.4, 6.4):
        objs.append(cyl('cannon%+.1f' % x, 0.22, 1.1, (x, -1.8, 0.95), BLACK, rot=(math.radians(-20), 0, 0), seg=16))
        objs.append(cyl('cannonring%+.1f' % x, 0.24, 0.12, (x, -1.98, 1.45), TOPS[0], rot=(math.radians(-20), 0, 0), seg=16))
    # big speakers either side
    for x in (-7.1, 7.1):
        objs.append(box('spk%+.1f' % x, (1.0, 0.8, 2.2), (x, 2.4, 0.35 + 1.1), BLACK, bevel=0.03))
        for z in (0.9, 1.9): objs.append(cyl('cone%+.1f%.1f' % (x, z), 0.28, 0.03, (x, 1.99, 0.35 + z), STAGE, rot=(math.pi / 2, 0, 0), seg=16))
    apply_all(objs); stage = join_by_material('podium')
    root = bpy.data.objects.new('podium', None); bpy.context.scene.collection.objects.link(root)
    for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']: o.parent = root

    # trophy: lathe cup, handles, two-tier base
    GOLD = mat('TrophyGold', hexc('#f2c24a'), metal=1.0, rough=0.18)
    BASE = mat('TrophyBase', hexc('#151515'), metal=0.4, rough=0.35)
    prof = [(0.0, 0.0), (0.06, 0.0), (0.05, 0.03), (0.022, 0.06), (0.02, 0.17), (0.05, 0.2), (0.09, 0.26), (0.115, 0.34), (0.12, 0.42), (0.125, 0.44), (0.0, 0.44)]
    tobjs = []
    bm = bmesh.new(); seg = 28; rings = []
    for x, z in prof:
        rings.append([bm.verts.new((x * math.cos(a * math.tau / seg), x * math.sin(a * math.tau / seg), z + 0.18)) for a in range(seg)])
    for r in range(len(rings) - 1):
        for a in range(seg):
            b2 = (a + 1) % seg
            try: bm.faces.new((rings[r][a], rings[r][b2], rings[r + 1][b2], rings[r + 1][a]))
            except ValueError: pass
    cup = mesh_obj('cup', bm, GOLD)
    tobjs.append(cup)
    for s in (1, -1):
        h = torus('handle%+d' % s, 0.07, 0.012, (s * 0.13, 0, 0.5), GOLD, rot=(math.pi / 2, 0, 0), seg=20, mseg=8); tobjs.append(h)
    tobjs.append(cyl('tbase1', 0.09, 0.08, (0, 0, 0.04), BASE, seg=24))
    tobjs.append(cyl('tbase2', 0.07, 0.06, (0, 0, 0.11), BASE, seg=24))
    tobjs.append(box('tplate', (0.1, 0.004, 0.035), (0, -0.088, 0.05), GOLD))
    tobjs.append(sphere('tlid', 0.03, (0, 0, 0.64), GOLD, seg=12, rings=8))
    apply_all(tobjs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in tobjs: o.select_set(True)
    bpy.context.view_layer.objects.active = tobjs[0]; bpy.ops.object.join()
    troot = bpy.data.objects.new('trophy', None); bpy.context.scene.collection.objects.link(troot)
    tobjs[0].parent = troot; troot.location = (0, -1.2, 0)
    print('podium TRIS', tri_count())
    export(out)


if __name__ == '__main__':
    build(sys.argv[sys.argv.index('--') + 1])
