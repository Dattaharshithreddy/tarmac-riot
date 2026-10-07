import sys, math; sys.path.insert(0, '/home/claude/blender')
from trlib import *
import bpy

def build(variant='sport', out='/home/claude/blender/out/bike.glb', lod=0):
    reset()
    SS = 2 if lod == 0 else 1
    TS, TM = (40, 14) if lod == 0 else (24, 8)
    paint_hex = '#ffffff' if variant == 'police' else '#c8102e'
    PAINT = mat('BodyPaint', hexc(paint_hex), metal=0.35, rough=0.22, coat=1.0)
    DARK = mat('BodyDark', hexc('#16171b'), metal=0.2, rough=0.45)
    CHROME = mat('Chrome', hexc('#dfe2e6'), metal=1.0, rough=0.12)
    METAL = mat('Metal', hexc('#8d939c'), metal=1.0, rough=0.35)
    ENGINE = mat('Engine', hexc('#3b3e44'), metal=0.8, rough=0.45)
    RUBBER = mat('Rubber', hexc('#121212'), rough=0.88)
    RIM = mat('Rim', hexc('#1c1c1f'), metal=0.7, rough=0.3)
    GOLD = mat('Gold', hexc('#c99a2e'), metal=1.0, rough=0.28)
    SEAT = mat('Seat', hexc('#0f0f10'), rough=0.75)
    GLASS = mat('Glass', hexc('#1d2b38'), rough=0.05, metal=0.2, alpha=0.5)
    HEAD = mat('HeadLight', hexc('#ffffff'), emit=hexc('#fff4d6'), emit_str=3.0)
    TAIL = mat('TailLight', hexc('#ff2020'), emit=hexc('#ff1010'), emit_str=3.0)
    CAL = mat('Caliper', hexc('#b8261c'), metal=0.4, rough=0.4)
    PLATE = mat('Plate', hexc('#f1f1f1'), rough=0.6)

    WF, WR, WZ = 0.70, -0.68, 0.31
    before = set(o.name for o in bpy.context.scene.objects)
    wheel_objs = {'front': [], 'rear': []}
    # wheels
    for name, wy in (('front', WF), ('rear', WR)):
        rot = (0, math.pi / 2, 0)
        made = [torus('tire_' + name, 0.245, 0.068, (0, wy, WZ), RUBBER, rot=rot, seg=TS, mseg=TM),
                torus('rimlip_' + name, 0.205, 0.016, (0, wy, WZ), RIM, rot=rot, seg=TS - 4, mseg=6),
                cyl('hub_' + name, 0.055, 0.15 if name == 'rear' else 0.12, (0, wy, WZ), RIM, rot=rot, seg=16)]
        wheel_objs[name] += made
        for k in range(6):
            a = k * math.pi / 3 + 0.25
            p0 = (0, wy + math.cos(a) * 0.05, WZ + math.sin(a) * 0.05)
            p1 = (0, wy + math.cos(a + 0.35) * 0.2, WZ + math.sin(a + 0.35) * 0.2)
            wheel_objs[name].append(cyl_between('spoke_%s%d' % (name, k), p0, p1, 0.013, RIM, seg=6))
    for sx in (-0.075, 0.075):
        wheel_objs['front'].append(cyl('disc_f%+.2f' % sx, 0.155, 0.008, (sx, WF, WZ), METAL, rot=(0, math.pi / 2, 0), seg=32 if lod == 0 else 20))
        box('caliper_f%+.2f' % sx, (0.03, 0.09, 0.06), (sx * 1.25, WF - 0.12, WZ + 0.08), CAL, bevel=0.01)
    wheel_objs['rear'].append(cyl('disc_r', 0.11, 0.007, (-0.085, WR, WZ), METAL, rot=(0, math.pi / 2, 0), seg=28 if lod == 0 else 18))
    wheel_objs['rear'].append(cyl('sprocket', 0.10, 0.012, (0.085, WR, WZ), RIM, rot=(0, math.pi / 2, 0), seg=28 if lod == 0 else 18))
    cyl_between('chain_top', (0.085, WR, WZ + 0.1), (0.085, -0.02, 0.50), 0.008, RIM, seg=6)
    cyl_between('chain_bot', (0.085, WR, WZ - 0.1), (0.085, -0.02, 0.40), 0.008, RIM, seg=6)

    # front forks (raked), triple clamp, steering head
    head = (0, 0.47, 0.96)
    for sx in (-0.1, 0.1):
        cyl_between('fork_low%+.1f' % sx, (sx, WF, WZ), (sx, 0.60, 0.62), 0.030, GOLD)
        cyl_between('fork_up%+.1f' % sx, (sx, 0.60, 0.62), (sx, 0.48, 0.97), 0.024, CHROME)
    box('triple', (0.26, 0.08, 0.03), (0, 0.48, 0.975), METAL, bevel=0.01)
    arc_strip('mudguard_f', (WF, WZ), 0.335, 30, 140, 0.15, 0.012, PAINT, n=16)
    arc_strip('hugger_r', (WR, WZ), 0.33, 60, 125, 0.13, 0.01, DARK, n=10)

    # frame spars, swingarm, shock
    for sx in (-1, 1):
        tube('spar%+d' % sx, [(sx * 0.11, 0.46, 0.92), (sx * 0.17, 0.25, 0.82), (sx * 0.17, 0.0, 0.70), (sx * 0.14, -0.20, 0.52)], 0.032, METAL)
        tube('swing%+d' % sx, [(sx * 0.13, -0.20, 0.47), (sx * 0.13, -0.45, 0.39), (sx * 0.11, WR, WZ)], 0.028, METAL)
    cyl_between('shock', (0, -0.18, 0.72), (0, -0.40, 0.42), 0.03, GOLD)
    # engine block + head + radiator
    box('engine', (0.30, 0.40, 0.30), (0, 0.06, 0.47), ENGINE, bevel=0.03, segments=3)
    box('cyl_head', (0.28, 0.20, 0.16), (0, 0.20, 0.66), ENGINE, rot=(0.45, 0, 0), bevel=0.025, segments=3)
    box('sump', (0.24, 0.30, 0.08), (0, 0.04, 0.30), ENGINE, bevel=0.02)
    box('radiator', (0.40, 0.05, 0.28), (0, 0.38, 0.62), RIM, rot=(-0.25, 0, 0), bevel=0.01)

    # bodywork: upper fairing (nose), belly pan, tank, tail
    fair = loft('fairing', [
        (0.98, ell2(0, 0.875, 0.025, 0.02, 0.03)),
        (0.92, ell2(0, 0.875, 0.10, 0.06, 0.08, flat=0.2)),
        (0.80, ell2(0, 0.86, 0.165, 0.11, 0.17, flat=0.35)),
        (0.64, ell2(0, 0.82, 0.20, 0.15, 0.20, flat=0.45)),
        (0.46, ell2(0, 0.77, 0.215, 0.16, 0.27, flat=0.5)),
        (0.26, ell2(0, 0.71, 0.21, 0.12, 0.28, flat=0.5)),
        (0.08, ell2(0, 0.67, 0.18, 0.08, 0.22, flat=0.4)),
        (-0.02, ell2(0, 0.66, 0.10, 0.05, 0.12)),
    ], PAINT, subsurf=SS)
    belly = loft('belly', [
        (0.40, ell(0, 0.46, 0.17, 0.12)),
        (0.30, ell(0, 0.47, 0.205, 0.18)),
        (0.12, ell(0, 0.47, 0.205, 0.17)),
        (-0.04, ell(0, 0.48, 0.17, 0.13)),
        (-0.12, ell(0, 0.50, 0.08, 0.07)),
    ], DARK, subsurf=SS)
    tank = loft('tank', [
        (0.44, ell(0, 0.92, 0.10, 0.06)),
        (0.36, ell(0, 0.96, 0.165, 0.11, squash=0.8)),
        (0.20, ell(0, 0.985, 0.185, 0.13, squash=0.8)),
        (0.04, ell(0, 0.96, 0.165, 0.11, squash=0.8)),
        (-0.04, ell(0, 0.92, 0.11, 0.07)),
    ], PAINT, subsurf=SS)
    tail = loft('tail', [
        (-0.06, ell2(0, 0.84, 0.16, 0.06, 0.09, flat=0.3)),
        (-0.30, ell2(0, 0.88, 0.15, 0.07, 0.09, flat=0.35)),
        (-0.56, ell2(0, 0.93, 0.115, 0.06, 0.08, flat=0.3)),
        (-0.78, ell2(0, 0.97, 0.06, 0.04, 0.05)),
        (-0.85, ell2(0, 0.98, 0.02, 0.015, 0.02)),
    ], PAINT, subsurf=SS)
    box('seat', (0.25, 0.36, 0.06), (0, -0.20, 0.905), SEAT, bevel=0.025, segments=3, rot=(0.05, 0, 0))
    box('pillion', (0.16, 0.18, 0.04), (0, -0.52, 0.985), SEAT, bevel=0.015, segments=2, rot=(0.12, 0, 0))
    ws = box('windscreen', (0.30, 0.30, 0.012), (0, 0.66, 1.03), GLASS, rot=(0.55, 0, 0), bevel=0.004)
    sub = ws.modifiers.new('sub', 'SUBSURF'); sub.levels = 2
    for sx in (-1, 1):
        sphere('headlight%+d' % sx, 0.06, (sx * 0.075, 0.905, 0.865), HEAD, scale=(0.95, 0.55, 0.42), rot=(0, 0, -sx * 0.25))
        sphere('mirror%+d' % sx, 0.05, (sx * 0.27, 0.70, 1.02), DARK, scale=(1.0, 0.45, 0.6))
        cyl_between('mirrorstalk%+d' % sx, (sx * 0.20, 0.72, 0.95), (sx * 0.26, 0.70, 1.01), 0.008, DARK, seg=6)
        tube('clipon%+d' % sx, [(sx * 0.10, 0.48, 0.955), (sx * 0.22, 0.43, 0.935)], 0.016, METAL)
        cyl_between('grip%+d' % sx, (sx * 0.21, 0.435, 0.937), (sx * 0.33, 0.405, 0.925), 0.022, RUBBER)
        cyl_between('peg%+d' % sx, (sx * 0.13, -0.24, 0.44), (sx * 0.22, -0.24, 0.44), 0.012, METAL, seg=8)
        box('rearset%+d' % sx, (0.015, 0.10, 0.06), (sx * 0.13, -0.24, 0.47), METAL, bevel=0.005)
    box('taillight', (0.10, 0.02, 0.035), (0, -0.805, 0.97), TAIL, bevel=0.008)
    box('plate_hanger', (0.05, 0.16, 0.02), (0, -0.82, 0.86), DARK, rot=(-0.9, 0, 0))
    box('plate', (0.17, 0.008, 0.11), (0, -0.88, 0.78), PLATE, bevel=0.004)
    # exhaust: header to side-slung muffler
    tube('header', [(0.06, 0.32, 0.50), (0.10, 0.25, 0.30), (0.14, 0.0, 0.30), (0.17, -0.28, 0.40)], 0.028, METAL)
    cyl_between('muffler', (0.17, -0.28, 0.41), (0.205, -0.66, 0.60), 0.062, CHROME, seg=24, r2=0.055)
    cyl_between('muffler_tip', (0.205, -0.66, 0.60), (0.21, -0.70, 0.62), 0.05, RIM, seg=24)

    if variant == 'police':
        BLUE = mat('Siren_B', hexc('#1f5bff'), emit=hexc('#2a62ff'), emit_str=4.0)
        RED = mat('Siren_R', hexc('#ff2020'), emit=hexc('#ff1a1a'), emit_str=4.0)
        STRIPE = mat('PoliceStripe', hexc('#1b3f8f'), metal=0.2, rough=0.3)
        box('lightbar_post', (0.03, 0.03, 0.30), (0, -0.66, 1.12), DARK)
        box('siren_r', (0.13, 0.06, 0.05), (-0.08, -0.66, 1.29), RED, bevel=0.01)
        box('siren_b', (0.13, 0.06, 0.05), (0.08, -0.66, 1.29), BLUE, bevel=0.01)
        for sx in (-1, 1):
            box('pannier%+d' % sx, (0.14, 0.40, 0.30), (sx * 0.28, -0.52, 0.72), mat('Pannier', hexc('#f2f2f2'), rough=0.35), bevel=0.04, segments=3)
            box('stripe%+d' % sx, (0.01, 0.38, 0.06), (sx * 0.351, -0.52, 0.74), STRIPE)
            sphere('beacon%+d' % sx, 0.03, (sx * 0.16, 0.92, 0.80), RED if sx < 0 else BLUE, scale=(1, 0.6, 0.6))

    apply_all(list(bpy.context.scene.objects))
    wf = join_group('WheelF', wheel_objs['front'], (0, WF, WZ))
    wr = join_group('WheelR', wheel_objs['rear'], (0, WR, WZ))
    join_by_material('bike', exclude=('WheelF', 'WheelR'))
    print(variant, lod, 'TRIS', tri_count())
    export(out)

if __name__ == '__main__':
    build('sport', '/home/claude/blender/out/bike.glb')
    build('sport', '/home/claude/blender/out/bike_lo.glb', lod=1)
    build('police', '/home/claude/blender/out/policebike_lo.glb', lod=1)
