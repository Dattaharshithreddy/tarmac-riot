import sys, math; sys.path.insert(0, '/home/claude/blender')
from trlib import *
import bpy
from mathutils import Vector
T = '/home/claude/blender/tex/'
OUT = '/home/claude/blender/out/'

def common_mats():
    return dict(
        rubber=mat('Rubber', hexc('#141414'), rough=0.9), rim=mat('RimSilver', hexc('#b9bec6'), metal=1.0, rough=0.28),
        dark=mat('Trim', hexc('#1a1b1f'), rough=0.6), glass=mat('Glass', hexc('#16222e'), metal=0.4, rough=0.06),
        chrome=mat('Chrome', hexc('#dfe2e6'), metal=1.0, rough=0.12), liner=mat('ArchLiner', hexc('#0c0c0d'), rough=0.95),
        tail=mat('TailLight', hexc('#ff2a2a'), emit=hexc('#ff1a1a'), emit_str=2.5), head=mat('HeadLight', hexc('#ffffff'), emit=hexc('#fff3d0'), emit_str=2.0),
        amber=mat('Indicator', hexc('#ff9a00'), emit=hexc('#ff8a00'), emit_str=1.2))

def wheel(name, x, y, r, w, M, wz=None):
    wz = r if wz is None else wz
    t = cyl(name + '_tire', r, w, (x, y, wz), M['rubber'], rot=(0, math.pi / 2, 0), seg=28)
    b = t.modifiers.new('bev', 'BEVEL'); b.width = r * 0.18; b.segments = 3; b.limit_method = 'ANGLE'
    s = 1 if x > 0 else -1
    cyl(name + '_rim', r * 0.62, 0.03, (x + s * (w / 2 - 0.005), y, wz), M['rim'], rot=(0, math.pi / 2, 0), seg=24)
    cyl(name + '_hub', r * 0.18, 0.04, (x + s * (w / 2 + 0.01), y, wz), M['dark'], rot=(0, math.pi / 2, 0), seg=12)
    for k in range(5):
        a = k * 2 * math.pi / 5
        box(name + '_sp%d' % k, (0.012, r * 0.09, r * 0.5), (x + s * (w / 2 + 0.012), y + math.cos(a) * r * 0.3, wz + math.sin(a) * r * 0.3), M['rim'], rot=(a + math.pi / 2, 0, 0))

def car(kind, paint_hex, out, roof_hex=None):
    reset(); M = common_mats()
    P = dict(sedan=dict(L=4.30, W=1.74, belt=0.93, roof=1.44, bonnet=0.84, boot=0.95, ws=0.62, rf=0.02, rr=-0.86, rg=-1.30, bot=0.30, wr=0.31, wb=1.30, wf=1.33),
             hatch=dict(L=3.84, W=1.70, belt=0.95, roof=1.50, bonnet=0.86, boot=0.97, ws=0.55, rf=-0.05, rr=-1.45, rg=-1.78, bot=0.30, wr=0.30, wb=1.22, wf=1.20),
             suv=dict(L=4.40, W=1.84, belt=1.10, roof=1.80, bonnet=1.02, boot=1.10, ws=0.80, rf=0.30, rr=-1.80, rg=-2.02, bot=0.42, wr=0.36, wb=1.40, wf=1.42))[kind]
    PAINT = mat('CarPaint', hexc(paint_hex), metal=0.45, rough=0.2, coat=1.0)
    L, W = P['L'], P['W']; hx = W / 2
    # lower body: a rounded box lofted along the length; top follows bonnet -> belt -> boot
    zc = lambda top: ((top + P['bot']) / 2, (top - P['bot']) / 2)
    secs = []
    for y, top, rx in ((L / 2, P['bonnet'] - 0.10, hx - 0.18), (L / 2 - 0.10, P['bonnet'] - 0.02, hx - 0.05), (L / 2 - 0.55, P['bonnet'], hx),
                       (P['ws'], P['belt'], hx), (P['rg'], P['belt'], hx), (-L / 2 + 0.45, P['boot'], hx), (-L / 2 + 0.08, P['boot'] - 0.02, hx - 0.04), (-L / 2, P['boot'] - 0.10, hx - 0.16)):
        c, h = zc(top); secs.append((y, rbox(0, c, rx, h, h, n=16, p=6)))
    body = loft('body', secs, PAINT, subsurf=1)
    cutters = [cyl('cut%d' % i, P['wr'] + 0.06, W + 0.4, (0, wy, P['wr'] + 0.01), M['dark'], rot=(0, math.pi / 2, 0), seg=28) for i, wy in enumerate((P['wf'], -P['wb']))]
    boolean_cut(body, cutters)
    # greenhouse (glass) + roof + pillars
    rxb, rxt = hx - 0.06, hx - 0.20
    def gsec(y, h):
        b = P['belt'] - 0.02
        return (y, [(-rxb, b), (rxb, b), (rxt + (rxb - rxt) * (1 - h), b + h * (P['roof'] - b)), (-(rxt + (rxb - rxt) * (1 - h)), b + h * (P['roof'] - b))])
    loft('greenhouse', [gsec(P['ws'], 0.03), gsec(P['rf'], 1.0), gsec(P['rr'], 1.0), gsec(P['rg'], 0.03)], M['glass'], subsurf=0)
    ROOF = mat('Roof', hexc(roof_hex), metal=0.4, rough=0.25, coat=1.0) if roof_hex else PAINT
    box('roof', (2 * rxt + 0.04, P['rf'] - P['rr'] + 0.06, 0.05), (0, (P['rf'] + P['rr']) / 2, P['roof'] + 0.012), ROOF, bevel=0.02, segments=2)
    for s in (-1, 1):
        cyl_between('apillar%+d' % s, (s * rxb, P['ws'], P['belt']), (s * rxt, P['rf'], P['roof']), 0.035, PAINT, seg=8)
        cyl_between('cpillar%+d' % s, (s * rxb, P['rg'], P['belt']), (s * rxt, P['rr'], P['roof']), 0.05, PAINT, seg=8)
        box('bpillar%+d' % s, (0.04, 0.09, P['roof'] - P['belt']), (s * ((rxb + rxt) / 2 + 0.01), (P['rf'] + P['rr']) / 2 + 0.1, (P['roof'] + P['belt']) / 2), M['dark'], rot=(0, -s * 0.12, 0))
        # lights, mirrors, handles
        box('tail%+d' % s, (0.34, 0.06, 0.13), (s * (hx - 0.24), -L / 2 + 0.03, P['boot'] - 0.13), M['tail'], bevel=0.02)
        box('head%+d' % s, (0.32, 0.06, 0.11), (s * (hx - 0.26), L / 2 - 0.04, P['bonnet'] - 0.16), M['head'], bevel=0.02)
        box('ind%+d' % s, (0.08, 0.05, 0.06), (s * (hx - 0.06), L / 2 - 0.06, P['bonnet'] - 0.18), M['amber'], bevel=0.01)
        sphere('mirror%+d' % s, 0.07, (s * (hx + 0.06), P['ws'] - 0.05, P['belt'] + 0.06), PAINT, scale=(0.9, 0.45, 0.6))
        box('handle%+d' % s, (0.02, 0.14, 0.03), (s * (hx + 0.005), -0.1, P['belt'] - 0.07), M['chrome'])
    box('bumper_r', (W - 0.1, 0.16, 0.16), (0, -L / 2 + 0.03, P['bot'] + 0.08), M['dark'], bevel=0.04, segments=2)
    box('bumper_f', (W - 0.12, 0.16, 0.16), (0, L / 2 - 0.03, P['bot'] + 0.08), M['dark'], bevel=0.04, segments=2)
    box('grille', (0.70, 0.04, 0.14), (0, L / 2 - 0.02, P['bonnet'] - 0.20), M['dark'], bevel=0.02)
    plate = tex_mat('PlateMH', T + ('plate_taxi.png' if kind == 'taxi' else 'plate_mh.png'), 0.5)
    decal('plate_r', 0.42, 0.11, (0, -L / 2 - 0.02, P['bot'] + 0.30), plate, rot=(0, 0, 0))
    for i, wy in enumerate((P['wf'], -P['wb'])):
        for s in (-1, 1):
            wheel('w%d%+d' % (i, s), s * (hx - 0.12), wy, P['wr'], 0.21, M)
        cyl('liner%d' % i, P['wr'] + 0.05, W - 0.08, (0, wy, P['wr'] + 0.01), M['liner'], rot=(0, math.pi / 2, 0), seg=24, caps=False)
    apply_all(list(bpy.context.scene.objects)); delete(cutters)
    split_multi_material_join('car'); print(kind, 'TRIS', tri_count()); export(out)

def truck(v, out):
    reset(); M = common_mats()
    cols = ['#2167d6', '#d9382b', '#e88c1e', '#168c6e']
    CAB = mat('CabPaint', hexc(['#f2b705', '#2167d6', '#e8e8e8', '#d9382b'][v]), metal=0.3, rough=0.3, coat=0.6)
    W, L = 2.40, 7.6
    # cab (front at +Y)
    cab = loft('cab', [(L / 2, rbox(0, 1.55, 1.12, 0.95, 1.0, p=7)), (L / 2 - 0.15, rbox(0, 1.6, 1.18, 1.05, 1.05, p=7)), (L / 2 - 1.75, rbox(0, 1.6, 1.18, 1.05, 1.05, p=7))], CAB, subsurf=1)
    box('crown', (2.2, 0.5, 0.42), (0, L / 2 - 0.55, 2.80), CAB, bevel=0.08, segments=2)
    box('windscreen', (2.0, 0.05, 0.75), (0, L / 2 + 0.01, 2.05), M['glass'], rot=(-0.12, 0, 0), bevel=0.02)
    box('grille', (1.4, 0.05, 0.5), (0, L / 2 + 0.01, 1.05), M['dark'], bevel=0.02)
    for s in (-1, 1):
        box('sidewin%+d' % s, (0.03, 0.9, 0.6), (s * 1.19, L / 2 - 0.65, 2.05), M['glass'])
        box('head%+d' % s, (0.28, 0.05, 0.2), (s * 0.85, L / 2 + 0.02, 0.85), M['head'], bevel=0.03)
        box('tail%+d' % s, (0.25, 0.05, 0.14), (s * 1.0, -L / 2 - 0.03, 0.75), M['tail'], bevel=0.02)
        box('mudflap%+d' % s, (0.45, 0.02, 0.45), (s * 0.9, -L / 2 + 0.25, 0.42), mat('Mudflap', hexc('#111111'), rough=0.8))
    # cargo body with painted panels
    rear = tex_mat('TruckRear%d' % v, T + 'truck_rear_%d.png' % v, 0.7)
    side = tex_mat('TruckSide%d' % v, T + 'truck_side_%d.png' % v, 0.7)
    top = mat('Tarp', hexc('#3d4a2c'), rough=0.9)
    cl = L - 1.9
    textured_box('cargo', (W, cl, 2.1), (0, -L / 2 + cl / 2, 1.95), [side, side, CAB, rear, top, M['dark']])
    box('chassis', (1.0, L - 0.4, 0.3), (0, 0, 0.65), M['dark'])
    box('bumper_r', (W, 0.12, 0.2), (0, -L / 2 - 0.02, 0.62), mat('BumperYellow', hexc('#f2b705'), rough=0.5))
    for i, wy in enumerate((L / 2 - 1.1, -L / 2 + 2.3, -L / 2 + 1.25)):
        for s in (-1, 1):
            wheel('tw%d%+d' % (i, s), s * (W / 2 - 0.2), wy, 0.52, 0.3, M)
    apply_all(list(bpy.context.scene.objects)); split_multi_material_join('truck'); print('truck', v, 'TRIS', tri_count()); export(out)

def bus(out):
    reset(); M = common_mats()
    side = tex_mat('BusSide', T + 'bus_side.png', 0.5); rear = tex_mat('BusRear', T + 'bus_rear.png', 0.5)
    RED = mat('BusPaint', hexc('#c62d22'), metal=0.2, rough=0.35); W, L, H = 2.55, 10.8, 3.0
    textured_box('busbody', (W, L, H), (0, 0, 0.55 + H / 2), [side, side, RED, rear, mat('BusRoof', hexc('#e6e6e6'), rough=0.6), M['dark']])
    box('bus_ws', (W - 0.25, 0.06, 1.25), (0, L / 2 + 0.02, 0.55 + H - 0.85), M['glass'], bevel=0.03)
    box('bus_board', (1.4, 0.06, 0.28), (0, L / 2 + 0.04, 0.55 + H - 0.12), mat('DestBoard', hexc('#ffb300'), emit=hexc('#ff9a00'), emit_str=0.6))
    box('bus_grille', (1.2, 0.05, 0.35), (0, L / 2 + 0.03, 0.95), M['dark'], bevel=0.02)
    box('bus_stripe', (W + 0.01, 0.04, 0.16), (0, L / 2 + 0.03, 1.55), mat('BusCream', hexc('#f2f2f2'), rough=0.5))
    box('roofrail', (W - 0.3, L - 2.5, 0.12), (0, -0.4, 0.55 + H + 0.1), M['chrome'])
    box('frontskirt', (W, 0.1, 0.8), (0, L / 2 + 0.01, 0.95), RED)
    for s in (-1, 1):
        box('tail%+d' % s, (0.22, 0.05, 0.35), (s * 1.05, -L / 2 - 0.03, 1.2), M['tail'], bevel=0.02)
        box('head%+d' % s, (0.3, 0.05, 0.2), (s * 0.9, L / 2 + 0.06, 0.95), M['head'], bevel=0.02)
    for i, wy in enumerate((L / 2 - 2.0, -L / 2 + 2.6)):
        for s in (-1, 1): wheel('bw%d%+d' % (i, s), s * (W / 2 - 0.18), wy, 0.53, 0.32, M)
    apply_all(list(bpy.context.scene.objects)); split_multi_material_join('bus'); print('bus TRIS', tri_count()); export(out)

def auto(out):
    reset(); M = common_mats()
    YEL = mat('AutoYellow', hexc('#f6c700'), metal=0.2, rough=0.35, coat=0.5); GRN = mat('AutoGreen', hexc('#1f7a3d'), metal=0.2, rough=0.35, coat=0.5)
    CAN = mat('Canvas', hexc('#17171a'), rough=0.9)
    loft('tub', [(1.25, rbox(0, 0.62, 0.30, 0.30, 0.22, p=4)), (0.9, rbox(0, 0.62, 0.55, 0.32, 0.25, p=5)), (-0.3, rbox(0, 0.60, 0.68, 0.30, 0.25, p=6)), (-1.25, rbox(0, 0.62, 0.66, 0.30, 0.25, p=6))], GRN, subsurf=1)
    loft('nose', [(1.40, rbox(0, 1.0, 0.18, 0.12, 0.28, p=4)), (1.20, rbox(0, 1.0, 0.36, 0.20, 0.30, p=4)), (0.95, rbox(0, 1.02, 0.50, 0.24, 0.30, p=4))], YEL, subsurf=1)
    loft('canopy', [(1.05, rbox(0, 1.30, 0.66, 0.42, 0.42, n=16, p=3)), (0.2, rbox(0, 1.32, 0.70, 0.46, 0.44, n=16, p=3)), (-1.10, rbox(0, 1.28, 0.70, 0.44, 0.44, n=16, p=3))], CAN, subsurf=1)
    box('windscreen', (0.9, 0.03, 0.42), (0, 1.12, 1.30), M['glass'], rot=(-0.15, 0, 0), bevel=0.01)
    box('canopy_trim', (1.42, 0.06, 0.05), (0, 1.07, 1.72), YEL, bevel=0.02)
    rearp = tex_mat('AutoRear', T + 'auto_rear.png', 0.7)
    decal('rearpanel', 1.1, 1.0, (0, -1.29, 1.22), rearp)
    box('headlight', (0.2, 0.05, 0.14), (0, 1.43, 1.02), M['head'], bevel=0.03)
    for s in (-1, 1): box('tail%+d' % s, (0.12, 0.04, 0.1), (s * 0.55, -1.27, 0.55), M['tail'], bevel=0.01)
    wheel('fw', 0, 1.15, 0.22, 0.12, M)
    for s in (-1, 1): wheel('rw%+d' % s, s * 0.62, -0.75, 0.22, 0.14, M)
    apply_all(list(bpy.context.scene.objects)); split_multi_material_join('auto'); print('auto TRIS', tri_count()); export(out)

if __name__ == '__main__':
    car('sedan', '#c0392b', OUT + 'sedan.glb'); car('hatch', '#2a7de1', OUT + 'hatch.glb'); car('suv', '#e8e8e8', OUT + 'suv.glb')
    car('sedan', '#141414', OUT + 'taxi.glb', roof_hex='#ffcd00')
    for v in range(4): truck(v, OUT + 'truck%d.glb' % v)
    bus(OUT + 'bus.glb'); auto(OUT + 'auto.glb')
