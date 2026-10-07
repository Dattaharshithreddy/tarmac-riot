"""Precise Indian traffic: sedan, hatchback, SUV, taxi, truck, bus, auto rickshaw. Real-world dimensions (metres).
Blender: X right, Y forward (front of vehicle at +Y), Z up, origin on the ground at the centre."""
import sys, math, os; sys.path.insert(0, '/home/claude/blender')
from trlib import *
import parts as PT
import vehtex as VT
from shell import Shell
import bpy, bmesh
from mathutils import Vector, Matrix
V = Vector
TEX = '/home/claude/blender/tex'


def far_lod():
    if not os.environ.get('FAR'): return
    for ob in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        d = ob.modifiers.new('dec', 'DECIMATE'); d.ratio = float(os.environ.get('FAR')); bpy.ops.object.modifier_apply(modifier='dec')


def make_atlas(tag, plate_txt, plate_bg=(240, 240, 236)):
    AT = PT.Atlas('veh_' + tag, size=1024, cell=32)
    for k, h, m, r in (('black', '#121315', 0.0, 0.55), ('matte', '#0a0a0b', 0.0, 0.9), ('trim', '#1c1d21', 0.1, 0.45), ('chrome', '#e6e8ec', 1.0, 0.08),
                       ('alu', '#c4c7cd', 1.0, 0.28), ('alu_dark', '#55595f', 1.0, 0.35), ('rim', '#b7bcc4', 1.0, 0.22), ('rim_dark', '#3a3d43', 0.9, 0.3),
                       ('steelrim', '#d0d3d8', 0.9, 0.35), ('liner', '#0b0b0c', 0.0, 0.95), ('disc', '#6f7277', 1.0, 0.4), ('caliper', '#2b2d31', 0.6, 0.45),
                       ('rubber', '#111112', 0.0, 0.9), ('yellow', '#f2b705', 0.1, 0.4), ('red', '#c62d22', 0.2, 0.35), ('white', '#eeeeee', 0.0, 0.4),
                       ('green', '#1f7a3d', 0.2, 0.35), ('wood', '#7a5230', 0.0, 0.8), ('tarp', '#3d4a2c', 0.0, 0.9), ('blue', '#2167d6', 0.2, 0.35),
                       ('orange', '#e88c1e', 0.2, 0.35), ('cream', '#efe6cf', 0.0, 0.45), ('seat', '#2a2421', 0.0, 0.7), ('glassdark', '#0c1116', 0.3, 0.05)):
        AT.add(k, h, m, r)
    AT.region('grille_mesh', 0, 512, 256, 640, lambda s: VT.grille(s, 'mesh'), metal=0.5, rough=0.4)
    AT.region('grille_slats', 256, 512, 512, 640, lambda s: VT.grille(s, 'slats'), metal=0.8, rough=0.25)
    AT.region('grille_truck', 512, 512, 768, 640, lambda s: VT.grille(s, 'truck'), metal=0.9, rough=0.2)
    AT.region('headlamp', 0, 656, 256, 752, VT.headlamp, metal=0.6, rough=0.1)
    AT.region('taillamp', 256, 656, 448, 752, VT.taillamp, metal=0.0, rough=0.15)
    AT.region('plate', 512, 656, 768, 720, lambda s: VT.plate(s, plate_txt, bg=plate_bg), metal=0.0, rough=0.5)
    AT.save(TEX)
    return AT


def lamps_atlas():
    LA = PT.Atlas('veh_lamps', size=64, cell=16)
    for k, h in (('white', '#fffaf0'), ('red', '#ff1a12'), ('amber', '#ff9a00'), ('board', '#ffb300')): LA.add(k, h, 0.0, 0.2)
    LA.save(TEX)
    return LA


def place(ob, sh, y, u, side, off=0.0, spin=0.0):
    """Align ob's local Z with the shell normal and local Y with the length direction, at (y, u, side)."""
    p = sh.point(y, u, side); n = sh.normal(y, u, side)
    t = (sh.point(y + 0.01, u, side) - sh.point(y - 0.01, u, side)).normalized()
    t = (t - n * t.dot(n)).normalized(); x = t.cross(n)
    ob.matrix_world = Matrix.Translation(p + n * off) @ Matrix((x, t, n)).transposed().to_4x4() @ Matrix.Rotation(spin, 4, 'Z')
    return ob


def wheel_set(tag, centers, r, tw, rim_r, PARTS, AT, TYRE, spokes='alloy', hi=True):
    """Car/truck wheels at given centres (x side sign tells which way the face points)."""
    objs = []
    seg = 30 if hi else 18
    for k, c in enumerate(centers):
        s = 1 if c.x > 0 else -1
        hw = tw / 2
        Rc = tw / 2 / 0.9
        prof = [(-hw * 0.92, rim_r + 0.008), (-hw, rim_r + 0.03), (-hw - 0.004, (rim_r + r) / 2), (-hw + 0.004, r - 0.025)]
        for i in range(5):
            a = math.radians(-50 + 100 * i / 4); prof.append((Rc * math.sin(a) * 0.95, r - Rc + Rc * math.cos(a) if False else r - 0.012 * (1 - math.cos(a)) * 3))
        prof += [(hw - 0.004, r - 0.025), (hw + 0.004, (rim_r + r) / 2), (hw, rim_r + 0.03), (hw * 0.92, rim_r + 0.008)]
        ty = PT.lathe('tyre_%s%d' % (tag, k), prof, seg, TYRE, uv=2); ty.location = c; objs.append(ty)
        # rim: dish facing outward
        face = s
        rp = [(-hw * 0.85, rim_r + 0.01), (-hw * 0.85, rim_r - 0.01), (hw * 0.6, rim_r - 0.015), (hw * 0.85, rim_r - 0.005), (hw * 0.85, rim_r + 0.012)]
        rp = [(x * face, rr) for x, rr in rp]
        rim = PT.lathe('rim_%s%d' % (tag, k), rp, seg, PARTS, closed=True); PT.uv_const(rim, AT.cells['rim' if spokes == 'alloy' else 'steelrim']); rim.location = c; objs.append(rim)
        hub_x = face * hw * 0.55
        if spokes == 'alloy':
            for j in range(5):
                a = j * 2 * math.pi / 5 + 0.3
                for dd in (-1, 1):
                    a0, a1 = a + dd * 0.07, a + dd * 0.22
                    pts = [V((hub_x, math.cos(a0) * rim_r * 0.3, math.sin(a0) * rim_r * 0.3)), V((hub_x - face * 0.01, math.cos(a1) * rim_r * 0.97, math.sin(a1) * rim_r * 0.97))]
                    sp = PT.sweep('sp_%s%d%d%d' % (tag, k, j, dd), pts, PT.rect_section(0.028, 0.02, 0.006, 0), PARTS)
                    PT.uv_const(sp, AT.cells['rim']); sp.location = c; objs.append(sp)
            hubc = cyl('hub_%s%d' % (tag, k), rim_r * 0.32, 0.03, c + V((hub_x, 0, 0)), PARTS, rot=(0, math.pi / 2, 0), seg=16); PT.uv_const(hubc, AT.cells['rim']); objs.append(hubc)
            cap = cyl('cap_%s%d' % (tag, k), rim_r * 0.14, 0.012, c + V((hub_x + face * 0.016, 0, 0)), PARTS, rot=(0, math.pi / 2, 0), seg=12); PT.uv_const(cap, AT.cells['black']); objs.append(cap)
            # brake disc and caliper visible through the spokes
            dsk = cyl('disc_%s%d' % (tag, k), rim_r * 0.82, 0.02, c + V((-face * 0.02, 0, 0)), PARTS, rot=(0, math.pi / 2, 0), seg=24); PT.uv_const(dsk, AT.cells['disc']); objs.append(dsk)
        else:   # steel wheel with stud nuts (trucks, bus, auto)
            dish = cyl('dish_%s%d' % (tag, k), rim_r * 0.95, 0.02, c + V((hub_x, 0, 0)), PARTS, rot=(0, math.pi / 2, 0), seg=seg); PT.uv_const(dish, AT.cells['steelrim']); objs.append(dish)
            hubc = cyl('hub_%s%d' % (tag, k), rim_r * 0.40, 0.06, c + V((hub_x + face * 0.03, 0, 0)), PARTS, rot=(0, math.pi / 2, 0), seg=16); PT.uv_const(hubc, AT.cells['red']); objs.append(hubc)
            for j in range(8 if hi else 0):
                a = j * 2 * math.pi / 8
                nut = cyl('nut_%s%d%d' % (tag, k, j), 0.014, 0.03, c + V((hub_x + face * 0.035, math.cos(a) * rim_r * 0.55, math.sin(a) * rim_r * 0.55)), PARTS, rot=(0, math.pi / 2, 0), seg=6)
                PT.uv_const(nut, AT.cells['chrome']); objs.append(nut)
            for j in range(6 if hi else 0):
                a = j * 2 * math.pi / 6 + 0.26
                hole = cyl('vent_%s%d%d' % (tag, k, j), 0.03, 0.022, c + V((hub_x + face * 0.002, math.cos(a) * rim_r * 0.78, math.sin(a) * rim_r * 0.78)), PARTS, rot=(0, math.pi / 2, 0), seg=10)
                PT.uv_const(hole, AT.cells['matte']); objs.append(hole)
    return objs


# ============================== CARS ==============================
CARS = {
    'sedan': dict(L=3.995, W=1.735, ax=(1.22, -1.23), r=0.31, tw=0.185, rim=0.19, track=0.745, glass=dict(ws=(0.84, 0.18), side=(0.24, -0.92), rear=(-1.06, -1.32)), stations=[
        (2.02, 0.34, 0.66, 0.70, 0.74, 0.48), (1.99, 0.27, 0.78, 0.76, 0.80, 0.58), (1.94, 0.24, 0.84, 0.81, 0.86, 0.67), (1.80, 0.23, 0.86, 0.85, 0.90, 0.72), (1.40, 0.22, 0.87, 0.90, 0.95, 0.75),
        (0.95, 0.21, 0.87, 0.96, 1.00, 0.74), (0.85, 0.21, 0.87, 0.97, 1.05, 0.72), (0.40, 0.21, 0.87, 0.99, 1.43, 0.66), (0.12, 0.21, 0.87, 1.00, 1.51, 0.64),
        (-0.70, 0.21, 0.87, 1.01, 1.50, 0.63), (-1.05, 0.22, 0.87, 1.02, 1.37, 0.64), (-1.35, 0.23, 0.86, 1.03, 1.10, 0.70), (-1.72, 0.25, 0.855, 1.03, 1.08, 0.72),
        (-1.92, 0.28, 0.84, 1.00, 1.05, 0.68), (-1.98, 0.32, 0.79, 0.97, 1.02, 0.63), (-2.01, 0.38, 0.70, 0.93, 0.97, 0.55)]),
    'hatch': dict(L=3.845, W=1.735, ax=(1.22, -1.23), r=0.30, tw=0.185, rim=0.19, track=0.745, glass=dict(ws=(0.84, 0.16), side=(0.22, -1.30), rear=(-1.62, -1.84)), stations=[
        (1.95, 0.34, 0.66, 0.71, 0.75, 0.48), (1.92, 0.27, 0.78, 0.77, 0.81, 0.58), (1.87, 0.24, 0.84, 0.82, 0.87, 0.67), (1.72, 0.23, 0.86, 0.86, 0.91, 0.72), (1.30, 0.22, 0.87, 0.92, 0.97, 0.75),
        (0.95, 0.21, 0.87, 0.97, 1.02, 0.74), (0.85, 0.21, 0.87, 0.98, 1.07, 0.72), (0.40, 0.21, 0.87, 1.00, 1.45, 0.66), (0.10, 0.21, 0.87, 1.01, 1.53, 0.64),
        (-1.20, 0.21, 0.87, 1.04, 1.52, 0.63), (-1.55, 0.23, 0.86, 1.05, 1.48, 0.64), (-1.80, 0.26, 0.85, 1.04, 1.30, 0.66), (-1.88, 0.30, 0.82, 1.02, 1.14, 0.66),
        (-1.91, 0.32, 0.80, 1.00, 1.08, 0.62), (-1.935, 0.38, 0.70, 0.95, 1.02, 0.54)]),
    'suv': dict(L=4.30, W=1.79, ax=(1.33, -1.28), r=0.345, tw=0.215, rim=0.215, track=0.77, glass=dict(ws=(0.88, 0.28), side=(0.34, -1.40), rear=(-1.78, -2.02)), stations=[
        (2.17, 0.40, 0.70, 0.80, 0.85, 0.50), (2.13, 0.33, 0.82, 0.86, 0.91, 0.62), (2.08, 0.30, 0.87, 0.91, 0.96, 0.70), (1.92, 0.30, 0.885, 0.93, 0.98, 0.74), (1.45, 0.28, 0.895, 1.02, 1.07, 0.78),
        (1.00, 0.27, 0.895, 1.08, 1.12, 0.78), (0.92, 0.27, 0.895, 1.09, 1.17, 0.76), (0.45, 0.27, 0.895, 1.11, 1.58, 0.70), (0.20, 0.27, 0.895, 1.12, 1.635, 0.69),
        (-1.40, 0.27, 0.895, 1.13, 1.63, 0.68), (-1.75, 0.28, 0.89, 1.14, 1.58, 0.68), (-1.98, 0.32, 0.88, 1.12, 1.40, 0.68), (-2.10, 0.36, 0.86, 1.04, 1.20, 0.66),
        (-2.13, 0.38, 0.82, 1.04, 1.13, 0.62), (-2.16, 0.44, 0.74, 1.00, 1.08, 0.54)]),
}


def car(kind, out, lod=0, taxi=False):
    reset(); hi = lod == 0
    C = CARS['hatch' if taxi else kind]
    AT = make_atlas(kind + ('_taxi' if taxi else ''), 'MH 01 TX 4321' if taxi else {'sedan': 'MH 12 AB 2024', 'hatch': 'KA 05 MN 7788', 'suv': 'DL 3C AK 0909'}[kind],
                    plate_bg=(250, 205, 0) if taxi else (240, 240, 236))
    PARTS = AT.material('Parts')
    LA = lamps_atlas(); LAMPS = LA.material('Lamps', emissive=True, emit_str=2.5)
    VT.tyre_tex(TEX + '/car_tyre.png', 'TARMAC  ECO  %d/%d R%d' % (int(C['tw'] * 1000), 65 if C['r'] < 0.33 else 60, 15 if C['r'] < 0.33 else 17))
    TYRE = tex_mat('Tyre', TEX + '/car_tyre.png', rough=0.85)
    PAINT = mat('CarPaint', hexc('#141414' if taxi else '#c0392b'), metal=0.5, rough=0.22, coat=1.0)
    GLASS = mat('Glass', hexc('#0e1820'), metal=0.3, rough=0.03, coat=1.0)
    st = [dict(y=y, zb=zb, w=w, belt=b, top=t, wtop=wt) for y, zb, w, b, t, wt in C['stations']]
    sh = Shell(st, side_bulge=0.045)
    body = sh.mesh('body', PAINT, ny=48 if hi else 30, nu=16 if hi else 10)
    # wheel arches
    fa, ra = C['ax']; r = C['r']
    cutters = [cyl('cut%d' % i, r + 0.055, 2.6, (0, ay, r + 0.015), PARTS, rot=(0, math.pi / 2, 0), seg=32) for i, ay in enumerate((fa, ra))]
    for cc in cutters:
        m = body.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cc; m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = body
    for m in list(body.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    delete(cutters)
    objs = [body]
    U_SH, U_WB, U_RR = 5 / 9, 6 / 9, 7 / 9
    g = C['glass']
    # glass: windscreen (two halves meet at the centre), side windows, rear screen
    for s in (1, -1):
        objs.append(sh.patch('ws%+d' % s, GLASS, g['ws'][0], g['ws'][1], U_WB + 0.035, 1.0, lift=0.004, ny=10 if hi else 5, nu=6 if hi else 3, side=s))
        objs.append(sh.patch('side%+d' % s, GLASS, g['side'][0], g['side'][1], U_WB + 0.02, U_RR - 0.012, lift=0.004, ny=16 if hi else 8, nu=3, side=s))
        objs.append(sh.patch('rear%+d' % s, GLASS, g['rear'][0], g['rear'][1], U_WB + 0.04, 1.0, lift=0.004, ny=6 if hi else 3, nu=6 if hi else 3, side=s))
        # B / C pillar black-outs and door shut lines
        mid = (g['side'][0] + g['side'][1]) / 2 + 0.05
        bp = sh.patch('bpillar%+d' % s, PARTS, mid + 0.05, mid - 0.06, U_WB + 0.01, U_RR - 0.005, lift=0.0055, ny=2, nu=3, side=s); PT.uv_const(bp, AT.cells['black']); objs.append(bp)
        for yy in (g['side'][0] + 0.10, mid, g['side'][1] + (0.10 if kind != 'hatch' and not taxi else 0.05)):
            ln = sh.patch('shut%+d_%d' % (s, len(objs)), PARTS, yy + 0.0025, yy - 0.0025, 0.26, U_SH - 0.005, lift=0.0015, ny=1, nu=8 if hi else 4, side=s); PT.uv_const(ln, AT.cells['matte']); objs.append(ln)
        ln = sh.patch('sill%+d' % s, PARTS, g['side'][0] + 0.12, g['side'][1] + 0.02, 0.12, 0.2, lift=0.002, ny=10 if hi else 4, nu=2, side=s); PT.uv_const(ln, AT.cells['trim']); objs.append(ln)
        # door handles
        for yy in (mid + 0.22, g['side'][1] + 0.30):
            hdl = box('handle%+d%d' % (s, len(objs)), (0.12, 0.028, 0.012), (0, 0, 0), PARTS, bevel=0.005); place(hdl, sh, yy, U_SH - 0.07, s, 0.008, spin=0)
            PT.uv_const(hdl, AT.cells['chrome' if kind == 'suv' else 'black']); objs.append(hdl)
        # mirrors
        my = g['ws'][0] - 0.10
        mb = box('mirrorbase%+d' % s, (0.06, 0.12, 0.04), (0, 0, 0), PARTS, bevel=0.01); place(mb, sh, my, U_WB + 0.02, s, 0.02); PT.uv_const(mb, AT.cells['black']); objs.append(mb)
        mh = box('mirror%+d' % s, (0.20, 0.08, 0.12), (0, 0, 0), PAINT, bevel=0.035, segments=3 if hi else 1)
        p0 = sh.point(my, U_WB + 0.02, s); mh.location = p0 + V((s * 0.13, -0.02, 0.04)); objs.append(mh)
        mg = box('mirrorglass%+d' % s, (0.17, 0.01, 0.095), (0, 0, 0), PARTS, bevel=0.02); mg.location = mh.location + V((0, -0.042, 0)); PT.uv_const(mg, AT.cells['chrome']); objs.append(mg)
        # headlamp / tail lamp clusters wrapping the front and rear corners
        yF0, yR0 = st[0]['y'], st[-1]['y']
        fz = st[0]['belt'] - 0.03; hw0 = st[0]['w']
        hl = box('headlamp%+d' % s, (0.34, 0.16, 0.12), (s * (hw0 - 0.12), yF0 - 0.05, fz), PARTS, rot=(0, 0, s * 0.35), bevel=0.03, segments=2)
        PT.uv_map(hl, AT.regions['headlamp'], (lambda sg, cx: lambda co, n: ((co.x - (cx - 0.17)) / 0.34 if sg > 0 else (cx + 0.17 - co.x) / 0.34, (co.z - fz + 0.06) / 0.12))(s, s * (hw0 - 0.12)))
        objs.append(hl)
        drl = box('drl%+d' % s, (0.26, 0.02, 0.012), (s * (hw0 - 0.12), yF0 + 0.02, fz + 0.055), LAMPS, rot=(0, 0, s * 0.35), bevel=0.004); PT.uv_const(drl, LA.cells['white']); objs.append(drl)
        rz = st[-1]['belt'] - 0.06; rw0 = st[-1]['w']
        tl = box('taillamp%+d' % s, (0.32, 0.16, 0.13), (s * (rw0 - 0.10), yR0 + 0.05, rz), PARTS, rot=(0, 0, -s * 0.35), bevel=0.03, segments=2)
        PT.uv_map(tl, AT.regions['taillamp'], lambda co, n: (0.5 + (abs(co.x) - (rw0 - 0.10)) / 0.32 * (1 if co.y < yR0 + 0.05 else -1), (co.z - rz + 0.065) / 0.13))
        objs.append(tl)
        tlg = box('tailglow%+d' % s, (0.22, 0.02, 0.025), (s * (rw0 - 0.12), yR0 - 0.03, rz + 0.03), LAMPS, rot=(0, 0, -s * 0.35), bevel=0.005); PT.uv_const(tlg, LA.cells['red']); objs.append(tlg)
        ind = sh.patch('repeater%+d' % s, LAMPS, fa - 0.40, fa - 0.46, 0.50, 0.53, lift=0.003, ny=1, nu=1, side=s); PT.uv_const(ind, LA.cells['amber']); objs.append(ind)
        # wheel arch liners
        for ay in (fa, ra):
            ln = PT.lathe('liner%+d%.1f' % (s, ay), [(s * 0.55, r + 0.05), (s * 0.95, r + 0.05)], 24 if hi else 14, PARTS); ln.location = V((0, ay, r + 0.015)); PT.uv_const(ln, AT.cells['liner']); objs.append(ln)
    # front: grille, lower intake, plate, fog lamps; rear: plate, bumper insert, reflectors
    yF, yR = st[0]['y'], st[-1]['y']
    p_grille = sh.point(yF, 0.40, 1)
    gz = st[0]['belt'] - 0.06
    gr = box('grille', (0.66, 0.03, 0.11), (0, yF - 0.005, gz), PARTS, bevel=0.012); PT.uv_map(gr, AT.regions['grille_slats' if kind == 'suv' else 'grille_mesh'], lambda co, n: ((co.x + 0.33) / 0.66, (co.z - gz + 0.055) / 0.11)); objs.append(gr)
    iz = st[0]['zb'] + 0.08
    intake = box('intake', (0.95, 0.03, 0.11), (0, yF - 0.0, iz), PARTS, bevel=0.01); PT.uv_map(intake, AT.regions['grille_mesh'], lambda co, n: ((co.x + 0.475) / 0.95, (co.z - iz + 0.055) / 0.11)); objs.append(intake)
    for yy, zz, nm, sgn in ((yF + 0.005, st[0]['zb'] + 0.215, 'plate_f', 1), (yR - 0.005, st[-1]['zb'] + 0.25, 'plate_r', -1)):
        pl = box(nm, (0.50, 0.012, 0.12), (0, yy, zz), PARTS)
        PT.uv_map(pl, AT.regions['plate'], (lambda sg: (lambda co, n: (((-co.x if sg > 0 else co.x) + 0.25) / 0.5 if n.y * sg > 0 else 0.5, (co.z - zz + 0.06) / 0.12)))(sgn) if False else (lambda co, n, sg=sgn, zz=zz: ((((-co.x) if sg > 0 else co.x) + 0.25) / 0.5, (co.z - zz + 0.06) / 0.12)))
        objs.append(pl)
    for s in (1, -1):
        fog = cyl('fog%+d' % s, 0.035, 0.02, (s * 0.60, yF - 0.01, st[0]['zb'] + 0.08), LAMPS, rot=(math.pi / 2, 0, 0), seg=14); PT.uv_const(fog, LA.cells['white']); objs.append(fog)
        rf = box('reflector%+d' % s, (0.12, 0.012, 0.03), (s * 0.55, yR + 0.005, st[-1]['zb'] + 0.12), LAMPS, bevel=0.004); PT.uv_const(rf, LA.cells['red']); objs.append(rf)
    bins = box('rearbumper', (1.2, 0.03, 0.10), (0, yR + 0.004, st[-1]['zb'] + 0.04), PARTS, bevel=0.01); PT.uv_const(bins, AT.cells['matte']); objs.append(bins)
    # wipers, aerial
    for s in (0.25, -0.15):
        wp = PT.sweep('wiper%.2f' % s, [V((s - 0.25, g['ws'][0] - 0.04, sh.point(g['ws'][0] - 0.04, 0.9).z + 0.012)), V((s + 0.22, g['ws'][0] - 0.06, sh.point(g['ws'][0] - 0.06, 0.95).z + 0.015))], PT.rect_section(0.012, 0.01, 0.003), PARTS)
        PT.uv_const(wp, AT.cells['matte']); objs.append(wp)
    fin = sphere('sharkfin', 1.0, (0, 0, 0), PARTS, scale=(0.03, 0.09, 0.04), seg=12, rings=6); fin.location = sh.point(g['side'][1] + 0.15, 0.999) + V((0, 0, 0.02)); PT.uv_const(fin, AT.cells['black']); objs.append(fin)
    # roof rails on the SUV, roof sign on the taxi (yellow roof)
    if kind == 'suv':
        for s in (1, -1):
            pts = [sh.point(y, U_RR + 0.09, s) + V((0, 0, 0.035)) for y in (g['side'][0] - 0.12, -0.3, g['side'][1] + 0.12)]
            rr = PT.sweep('roofrail%+d' % s, pts, PT.rect_section(0.03, 0.03, 0.008), PARTS); PT.uv_const(rr, AT.cells['alu']); objs.append(rr)
    if taxi:
        ROOF = mat('Roof', hexc('#ffcd00'), metal=0.3, rough=0.25, coat=1.0)
        for s in (1, -1):
            objs.append(sh.patch('roofpaint%+d' % s, ROOF, g['ws'][1] + 0.02, g['side'][1] + 0.04, U_RR - 0.004, 1.0, lift=0.0012, ny=14 if hi else 6, nu=5 if hi else 3, side=s))
        sign = box('taxisign', (0.42, 0.14, 0.13), (0, -0.4, sh.point(-0.4, 1.0).z + 0.07), PARTS, bevel=0.02)
        PT.uv_const(sign, AT.cells['yellow']); objs.append(sign)
    # wheels
    tr = C['track']
    centers = [V((sx * tr, ay, r)) for ay in (fa, ra) for sx in (1, -1)]
    objs += wheel_set('w', centers, r, C['tw'], C['rim'], PARTS, AT, TYRE, 'alloy', hi)
    apply_all(list(bpy.context.scene.objects))
    join_by_material(kind)
    print(kind, lod, 'taxi' if taxi else '', 'TRIS', tri_count())
    far_lod()
    if out: export(out)


# ============================== TRUCK ==============================
from shell import crease_loft


def open_loft(name, sections, material, subsurf=1):
    bm = bmesh.new(); rows = []
    for y, pts in sections: rows.append([bm.verts.new((x, y, z)) for x, z in pts])
    for a_, b_ in zip(rows[:-1], rows[1:]):
        for i in range(len(a_) - 1): bm.faces.new((a_[i], a_[i + 1], b_[i + 1], b_[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_obj(name, bm, material)
    if subsurf: m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = subsurf; m.render_levels = subsurf
    return ob


def hazard(size):
    from PIL import Image, ImageDraw
    w, h = size; im = Image.new('RGB', size, (242, 183, 5)); d = ImageDraw.Draw(im)
    for x in range(-h, w + h, 40): d.polygon([(x, h), (x + 20, h), (x + 20 + h, 0), (x + h, 0)], fill=(18, 18, 20))
    return im


def boxp(name, size, loc, PARTS, AT, key, rot=(0, 0, 0), bevel=0.0, seg=2):
    ob = box(name, size, loc, PARTS, rot=rot, bevel=bevel, segments=seg); PT.uv_const(ob, AT.cells[key]); return ob


def truck(v, out, lod=0):
    reset(); hi = lod == 0
    AT = make_atlas('truck%d' % v, 'RJ 14 GA %04d' % (1000 + v * 1337 % 9000), plate_bg=(250, 205, 0))
    AT.region('hazard', 768, 512, 1024, 576, hazard, metal=0.0, rough=0.5)
    AT.save(TEX)
    PARTS = AT.material('Parts')
    LA = lamps_atlas(); LAMPS = LA.material('Lamps', emissive=True, emit_str=2.5)
    VT.tyre_tex(TEX + '/truck_tyre.png', 'TARMAC  HAUL  9.00 R20  16PR')
    TYRE = tex_mat('Tyre', TEX + '/truck_tyre.png', rough=0.88)
    CAB = mat('CabPaint', hexc(['#f2b705', '#2167d6', '#e8e8e8', '#d9382b'][v % 4]), metal=0.25, rough=0.3, coat=0.6)
    GLASS = mat('Glass', hexc('#101a22'), metal=0.3, rough=0.04, coat=1.0)
    SIDE = tex_mat('TruckSide%d' % v, TEX + '/truck_side_%d.png' % v, 0.7)
    REAR = tex_mat('TruckRear%d' % v, TEX + '/truck_rear_%d.png' % v, 0.7)
    objs = []
    W2 = 1.20
    # ---- cab ----
    cab = crease_loft('cab', [(3.80, 0.86, 2.62, 1.06, 1.10, 1.00), (3.74, 0.80, 2.73, 1.13, 1.16, 1.09), (3.40, 0.78, 2.77, 1.16, 1.18, 1.12),
                              (2.06, 0.78, 2.77, 1.16, 1.18, 1.12), (1.98, 0.86, 2.70, 1.12, 1.14, 1.08)], CAB, subsurf=2 if hi else 1, shape=(0.04, 0.45, 0.92, 0.995))
    objs.append(cab)
    for sx in (-1, 1):
        objs.append(box('ws%+d' % sx, (0.98, 0.04, 0.70), (sx * 0.52, 3.79, 2.13), GLASS, rot=(math.radians(-6), 0, 0), bevel=0.03, segments=2))
        objs.append(box('sidewin%+d' % sx, (0.03, 0.78, 0.58), (sx * 1.175, 3.10, 2.18), GLASS, bevel=0.02))
        objs.append(boxp('doorline%+d' % sx, (0.012, 0.012, 1.40), (sx * 1.18, 2.62, 1.65), PARTS, AT, 'matte'))
        objs.append(boxp('doorline2%+d' % sx, (0.012, 0.012, 1.40), (sx * 1.18, 3.55, 1.65), PARTS, AT, 'matte'))
        objs.append(boxp('handle%+d' % sx, (0.03, 0.14, 0.03), (sx * 1.19, 2.75, 1.75), PARTS, AT, 'chrome'))
        objs.append(boxp('step1%+d' % sx, (0.30, 0.50, 0.05), (sx * 1.05, 3.05, 0.58), PARTS, AT, 'alu_dark', bevel=0.01))
        objs.append(boxp('step2%+d' % sx, (0.26, 0.50, 0.05), (sx * 1.08, 3.05, 0.90), PARTS, AT, 'alu_dark', bevel=0.01))
        # round headlamps with chrome bezels, indicators
        objs.append(boxp('lampbox%+d' % sx, (0.40, 0.08, 0.24), (sx * 0.78, 3.80, 1.14), PARTS, AT, 'chrome', bevel=0.03))
        for dx in (-0.09, 0.09):
            hl = cyl('head%+d%.2f' % (sx, dx), 0.085, 0.03, (sx * 0.78 + dx, 3.85, 1.14), LAMPS, rot=(math.pi / 2, 0, 0), seg=20); PT.uv_const(hl, LA.cells['white']); objs.append(hl)
        ind = cyl('ind%+d' % sx, 0.05, 0.03, (sx * 1.04, 3.83, 1.14), LAMPS, rot=(math.pi / 2, 0, 0), seg=14); PT.uv_const(ind, LA.cells['amber']); objs.append(ind)
        # mirror arms and mirrors
        objs.append(PT.sweep('mirrorarm%+d' % sx, [V((sx * 1.16, 3.60, 2.45)), V((sx * 1.42, 3.55, 2.40)), V((sx * 1.42, 3.55, 1.95))], PT.circle_section(0.015, 8), PARTS)); PT.uv_const(objs[-1], AT.cells['black'])
        objs.append(boxp('mirror%+d' % sx, (0.06, 0.20, 0.36), (sx * 1.44, 3.53, 2.18), PARTS, AT, 'black', bevel=0.02))
        objs.append(boxp('mirrorglass%+d' % sx, (0.01, 0.17, 0.32), (sx * 1.44, 3.63, 2.18), PARTS, AT, 'chrome'))
    objs.append(boxp('centrepost', (0.08, 0.06, 0.72), (0, 3.80, 2.13), PARTS, AT, 'black'))
    gr = box('grille', (1.25, 0.05, 0.50), (0, 3.81, 1.30), PARTS, bevel=0.02); PT.uv_map(gr, AT.regions['grille_truck'], lambda co, n: ((co.x + 0.625) / 1.25, (co.z - 1.05) / 0.5)); objs.append(gr)
    bp = box('bumper', (2.36, 0.22, 0.30), (0, 3.80, 0.70), PARTS, bevel=0.03); PT.uv_map(bp, AT.regions['hazard'], lambda co, n: ((co.x + 1.2) / 2.4, (co.z - 0.55) / 0.3)); objs.append(bp)
    objs.append(boxp('visor', (2.25, 0.32, 0.06), (0, 3.86, 2.62), PARTS, AT, 'black', rot=(math.radians(10), 0, 0), bevel=0.02))
    for k in range(5):
        ml = cyl('marker%d' % k, 0.03, 0.03, (-0.8 + k * 0.4, 3.95, 2.60), LAMPS, rot=(math.pi / 2, 0, 0), seg=10); PT.uv_const(ml, LA.cells['amber']); objs.append(ml)
    pl = box('plate_f', (0.52, 0.012, 0.13), (0, 3.92, 0.70), PARTS); PT.uv_map(pl, AT.regions['plate'], lambda co, n: ((-co.x + 0.26) / 0.52, (co.z - 0.635) / 0.13)); objs.append(pl)
    # ---- chassis, tank, cargo body ----
    for sx in (-1, 1): objs.append(boxp('rail%+d' % sx, (0.10, 7.2, 0.26), (sx * 0.45, 0.0, 0.88), PARTS, AT, 'black'))
    tk = cyl('fueltank', 0.26, 0.85, (-0.92, 1.35, 0.82), PARTS, rot=(math.pi / 2, 0, 0), seg=20); PT.uv_const(tk, AT.cells['alu']); objs.append(tk)
    objs.append(boxp('battery', (0.40, 0.55, 0.35), (0.92, 1.35, 0.82), PARTS, AT, 'black', bevel=0.02))
    cy0, cy1 = 1.88, -3.72; cl = cy0 - cy1; cyc = (cy0 + cy1) / 2
    objs.append(boxp('bed', (2.44, cl, 0.16), (0, cyc, 1.17), PARTS, AT, 'wood'))
    for sx in (-1, 1):
        sd = box('cargoside%+d' % sx, (0.06, cl, 1.35), (sx * 1.20, cyc, 1.92), SIDE)
        PT.uv_map(sd, (0, 0, 1, 1), (lambda sg: lambda co, n: (((co.y - cy1) / cl) if sg > 0 else ((cy0 - co.y) / cl), (co.z - 1.245) / 1.35))(sx)); objs.append(sd)
    fw = boxp('frontwall', (2.44, 0.06, 1.35), (0, cy0, 1.92), PARTS, AT, 'wood'); objs.append(fw)
    rg = box('reargate', (2.44, 0.06, 1.35), (0, cy1, 1.92), REAR); PT.uv_map(rg, (0, 0, 1, 1), lambda co, n: ((co.x + 1.22) / 2.44, (co.z - 1.245) / 1.35)); objs.append(rg)
    tarp = crease_loft('tarp', [(cy0, 2.55, 2.88, 1.22, 1.24, 1.0), (cyc, 2.55, 2.92, 1.22, 1.24, 1.02), (cy1, 2.55, 2.88, 1.22, 1.24, 1.0)], PARTS, subsurf=1, crease=0.3, shape=(0.05, 0.3, 0.6, 0.95))
    PT.uv_const(tarp, AT.cells['tarp']); objs.append(tarp)
    if hi:   # tie-down ropes crossing the tarp sides
        for sx in (-1, 1):
            for k in range(6):
                y0 = cy1 + 0.3 + k * 0.9
                rp = PT.sweep('rope%+d%d' % (sx, k), [V((sx * 1.255, y0, 2.62)), V((sx * 1.235, y0 + 0.45, 2.20)), V((sx * 1.235, y0 + 0.9, 1.55))], PT.circle_section(0.01, 5), PARTS)
                PT.uv_const(rp, AT.cells['cream']); objs.append(rp)
    for sx in (-1, 1):
        tl = box('tail%+d' % sx, (0.28, 0.06, 0.16), (sx * 0.95, cy1 - 0.05, 1.02), LAMPS, bevel=0.02); PT.uv_const(tl, LA.cells['red']); objs.append(tl)
        objs.append(boxp('mudflap%+d' % sx, (0.50, 0.02, 0.50), (sx * 0.95, -2.40, 0.48), PARTS, AT, 'black'))
    ub = box('underride', (2.2, 0.12, 0.16), (0, cy1 - 0.06, 0.70), PARTS); PT.uv_map(ub, AT.regions['hazard'], lambda co, n: ((co.x + 1.1) / 2.2, (co.z - 0.62) / 0.16)); objs.append(ub)
    pr = box('plate_r', (0.52, 0.012, 0.13), (0, cy1 - 0.13, 0.86), PARTS); PT.uv_map(pr, AT.regions['plate'], lambda co, n: ((co.x + 0.26) / 0.52, (co.z - 0.795) / 0.13)); objs.append(pr)
    # ---- wheels: front single, rear duals ----
    r = 0.51
    cent = [V((sx * 1.00, 2.75, r)) for sx in (1, -1)] + [V((sx * xx, -1.75, r)) for sx in (1, -1) for xx in (0.80, 1.07)]
    objs += wheel_set('t', cent, r, 0.24, 0.32, PARTS, AT, TYRE, 'steel', hi)
    apply_all(list(bpy.context.scene.objects)); join_by_material('truck')
    print('truck', v, lod, 'TRIS', tri_count())
    far_lod()
    if out: export(out)


# ============================== BUS ==============================
def bus(out, lod=0):
    reset(); hi = lod == 0
    AT = make_atlas('bus', 'MH 14 BT 2046', plate_bg=(250, 205, 0))
    AT.region('dest', 768, 512, 1024, 576, lambda sz: VT.text_panel(sz, ['PUNE  →  GOA'], (10, 8, 4), (255, 170, 20)), metal=0.0, rough=0.3)
    AT.region('stname', 0, 768, 1024, 832, lambda sz: VT.text_panel(sz, ['STATE  TRANSPORT'], (198, 45, 34), (245, 236, 210)), metal=0.1, rough=0.35)
    AT.region('busrear', 512, 832, 768, 1024, lambda sz: __import__('PIL.Image', fromlist=['Image']).open(TEX + '/bus_rear.png').convert('RGB').resize(sz), metal=0.1, rough=0.4)
    AT.save(TEX)
    PARTS = AT.material('Parts')
    LA = lamps_atlas(); LAMPS = LA.material('Lamps', emissive=True, emit_str=2.5)
    VT.tyre_tex(TEX + '/truck_tyre.png', 'TARMAC  HAUL  10.00 R20  16PR')
    TYRE = tex_mat('Tyre', TEX + '/truck_tyre.png', rough=0.88)
    RED = mat('BusPaint', hexc('#c62d22'), metal=0.2, rough=0.32, coat=0.6)
    GLASS = mat('Glass', hexc('#101a22'), metal=0.3, rough=0.04, coat=1.0)
    objs = []
    Lh = 5.45
    body = crease_loft('busbody', [(Lh, 0.42, 3.02, 1.20, 1.26, 1.16), (Lh - 0.08, 0.36, 3.14, 1.27, 1.29, 1.24), (-Lh + 0.08, 0.36, 3.14, 1.27, 1.29, 1.24), (-Lh, 0.42, 3.04, 1.20, 1.26, 1.16)],
                       RED, subsurf=2 if hi else 1, shape=(0.03, 0.45, 0.93, 0.995))
    objs.append(body)
    # windows: continuous glass band per side with body-colour pillars
    for sx in (-1, 1):
        gy0, gy1 = 4.6, -5.0
        objs.append(box('sideglass%+d' % sx, (0.02, gy0 - gy1, 0.78), (sx * 1.292, (gy0 + gy1) / 2, 2.38), GLASS, bevel=0.01))
        n = 8
        for k in range(n + 1):
            yy = gy1 + (gy0 - gy1) * k / n
            objs.append(box('pillar%+d%d' % (sx, k), (0.03, 0.09, 0.80), (sx * 1.30, yy, 2.38), RED))
        # cream belt stripe and the name
        objs.append(boxp('stripe%+d' % sx, (0.02, 2 * Lh - 0.3, 0.14), (sx * 1.293, 0, 1.86), PARTS, AT, 'cream'))
        objs.append(boxp('stripe2%+d' % sx, (0.02, 2 * Lh - 0.3, 0.05), (sx * 1.293, 0, 1.70), PARTS, AT, 'cream'))
        nm = box('name%+d' % sx, (0.02, 3.6, 0.22), (sx * 1.294, -0.6, 1.30), PARTS)
        PT.uv_map(nm, AT.regions['stname'], (lambda sg: lambda co, n: (((co.y + 2.4) / 3.6) if sg > 0 else ((1.2 - co.y) / 3.6), (co.z - 1.19) / 0.22))(sx)); objs.append(nm)
        objs.append(boxp('skirt%+d' % sx, (0.02, 2 * Lh - 0.2, 0.22), (sx * 1.285, 0, 0.52), PARTS, AT, 'black'))
        tl = box('tail%+d' % sx, (0.20, 0.06, 0.40), (sx * 1.0, -Lh - 0.01, 1.15), LAMPS, bevel=0.02); PT.uv_const(tl, LA.cells['red']); objs.append(tl)
        hl = box('head%+d' % sx, (0.34, 0.06, 0.18), (sx * 0.88, Lh + 0.01, 0.95), LAMPS, bevel=0.03); PT.uv_const(hl, LA.cells['white']); objs.append(hl)
        objs.append(PT.sweep('busmirror%+d' % sx, [V((sx * 1.2, Lh - 0.1, 2.6)), V((sx * 1.45, Lh + 0.25, 2.7)), V((sx * 1.45, Lh + 0.3, 2.3))], PT.circle_section(0.02, 8), PARTS)); PT.uv_const(objs[-1], AT.cells['black'])
        objs.append(boxp('busmirrorhead%+d' % sx, (0.08, 0.14, 0.32), (sx * 1.45, Lh + 0.3, 2.15), PARTS, AT, 'black', bevel=0.02))
    # entry door, front left (India drives on the left)
    objs.append(box('doorglass', (0.025, 0.85, 1.9), (-1.295, Lh - 1.05, 1.55), GLASS, bevel=0.01))
    objs.append(boxp('doorframe', (0.03, 0.06, 2.0), (-1.30, Lh - 1.50, 1.55), PARTS, AT, 'black'))
    # front: big two-piece windscreen, destination board, grille, bumper; rear window and art
    for sx in (-1, 1):
        objs.append(box('ws%+d' % sx, (1.14, 0.04, 1.18), (sx * 0.60, Lh + 0.005, 2.35), GLASS, rot=(math.radians(-4), 0, 0), bevel=0.03))
    ds = box('dest', (1.7, 0.04, 0.26), (0, Lh + 0.01, 3.00), LAMPS); PT.uv_map(ds, AT.regions['dest'], lambda co, n: ((-co.x + 0.85) / 1.7, (co.z - 2.87) / 0.26)); objs.append(ds)
    for m_ in ds.data.materials: pass
    ds.data.materials[0] = PARTS
    gr = box('grille', (1.2, 0.04, 0.40), (0, Lh + 0.01, 1.05), PARTS, bevel=0.02); PT.uv_map(gr, AT.regions['grille_slats'], lambda co, n: ((co.x + 0.6) / 1.2, (co.z - 0.85) / 0.4)); objs.append(gr)
    objs.append(boxp('bumper', (2.5, 0.2, 0.3), (0, Lh + 0.04, 0.55), PARTS, AT, 'black', bevel=0.03))
    pl = box('plate_f', (0.52, 0.012, 0.13), (0, Lh + 0.15, 0.55), PARTS); PT.uv_map(pl, AT.regions['plate'], lambda co, n: ((-co.x + 0.26) / 0.52, (co.z - 0.485) / 0.13)); objs.append(pl)
    objs.append(box('rearglass', (2.1, 0.04, 0.8), (0, -Lh - 0.005, 2.40), GLASS, bevel=0.02))
    ra = box('rearart', (2.0, 0.03, 0.75), (0, -Lh - 0.01, 1.45), PARTS); PT.uv_map(ra, AT.regions['busrear'], lambda co, n: ((co.x + 1.0) / 2.0, (co.z - 1.075) / 0.75)); objs.append(ra)
    objs.append(boxp('bumper_r', (2.5, 0.18, 0.28), (0, -Lh - 0.03, 0.55), PARTS, AT, 'black', bevel=0.03))
    objs.append(boxp('roofhatch', (0.8, 0.8, 0.08), (0, 1.5, 3.17), PARTS, AT, 'white', bevel=0.03))
    objs.append(boxp('roofhatch2', (0.8, 0.8, 0.08), (0, -2.5, 3.17), PARTS, AT, 'white', bevel=0.03))
    r = 0.52
    cent = [V((sx * 1.02, 3.55, r)) for sx in (1, -1)] + [V((sx * xx, -2.55, r)) for sx in (1, -1) for xx in (0.82, 1.08)]
    objs += wheel_set('b', cent, r, 0.25, 0.33, PARTS, AT, TYRE, 'steel', hi)
    for ay in (3.55, -2.55):   # dark wheel wells
        ww = PT.lathe('well%.1f' % ay, [(-1.30, r + 0.06), (1.30, r + 0.06)], 24, PARTS); ww.location = V((0, ay, r)); PT.uv_const(ww, AT.cells['liner']); objs.append(ww)
    cutters = [cyl('cut%d' % i, r + 0.06, 3.0, (0, ay, r), PARTS, rot=(0, math.pi / 2, 0), seg=28) for i, ay in enumerate((3.55, -2.55))]
    for cc in cutters:
        m = body.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cc; m.solver = 'EXACT'
    apply_all(list(bpy.context.scene.objects)); delete(cutters); join_by_material('bus')
    print('bus', lod, 'TRIS', tri_count())
    far_lod()
    if out: export(out)


# ============================== AUTO RICKSHAW ==============================
def auto(out, lod=0):
    reset(); hi = lod == 0
    AT = make_atlas('auto', 'KA 05 C 9921', plate_bg=(250, 205, 0))
    AT.region('autorear', 768, 512, 1024, 768, lambda sz: __import__('PIL.Image', fromlist=['Image']).open(TEX + '/auto_rear.png').convert('RGB').resize(sz), metal=0.0, rough=0.5)
    AT.save(TEX)
    PARTS = AT.material('Parts')
    LA = lamps_atlas(); LAMPS = LA.material('Lamps', emissive=True, emit_str=2.5)
    VT.tyre_tex(TEX + '/auto_tyre.png', 'TARMAC  CITY  4.00-8  6PR')
    TYRE = tex_mat('Tyre', TEX + '/auto_tyre.png', rough=0.88)
    GRN = mat('AutoGreen', hexc('#1f7a3d'), metal=0.2, rough=0.3, coat=0.7)
    YEL = mat('AutoYellow', hexc('#f6c700'), metal=0.2, rough=0.3, coat=0.7)
    CAN = mat('Canvas', hexc('#141416'), rough=0.85)
    GLASS = mat('Glass', hexc('#16222e'), metal=0.2, rough=0.04, alpha=0.6)
    objs = []
    # front cowl: narrow nose with the headlamp, widening into the dash
    cowl = crease_loft('cowl', [(1.36, 0.42, 1.02, 0.10, 0.13, 0.10), (1.30, 0.36, 1.06, 0.20, 0.24, 0.20), (1.12, 0.32, 1.10, 0.40, 0.46, 0.42), (0.92, 0.32, 1.12, 0.56, 0.60, 0.58)],
                       YEL, subsurf=2 if hi else 1, shape=(0.06, 0.45, 0.85, 0.99))
    objs.append(cowl)
    lower = crease_loft('cowllow', [(1.37, 0.40, 0.70, 0.105, 0.135, 0.12), (1.30, 0.34, 0.70, 0.205, 0.245, 0.23), (1.12, 0.30, 0.70, 0.405, 0.465, 0.45), (0.92, 0.30, 0.70, 0.565, 0.605, 0.60)],
                        GRN, subsurf=2 if hi else 1, shape=(0.06, 0.45, 0.85, 0.99))
    objs.append(lower)
    # passenger tub and rear body
    tub = crease_loft('tub', [(0.94, 0.30, 0.66, 0.58, 0.62, 0.60), (0.40, 0.28, 0.64, 0.62, 0.66, 0.64), (-0.55, 0.28, 0.70, 0.64, 0.68, 0.66), (-1.20, 0.30, 0.95, 0.62, 0.66, 0.62), (-1.28, 0.36, 0.98, 0.56, 0.60, 0.56)],
                      GRN, subsurf=2 if hi else 1, shape=(0.05, 0.5, 0.88, 0.99))
    objs.append(tub)
    stripe = crease_loft('tubstripe', [(0.92, 0.60, 0.665, 0.605, 0.625, 0.605), (-1.22, 0.86, 0.96, 0.63, 0.665, 0.63)], YEL, subsurf=0)
    objs.append(stripe)
    # canopy: black canvas hood on a frame, open sides
    secs = []
    for y, hw, zt, zl in ((0.98, 0.64, 1.64, 1.40), (0.90, 0.68, 1.72, 1.36), (0.0, 0.70, 1.75, 1.32), (-0.75, 0.70, 1.74, 1.10), (-1.24, 0.66, 1.68, 0.98)):
        pts = []
        for i in range(13):
            a = math.radians(180 - 180 * i / 12)
            pts.append((math.cos(a) * hw, zl + (zt - zl) * (math.sin(a) ** 0.35 if math.sin(a) > 0 else 0)))
        secs.append((y, pts))
    can = open_loft('canopy', secs, CAN, subsurf=1)
    so = can.modifiers.new('sol', 'SOLIDIFY'); so.thickness = 0.012; objs.append(can)
    # rear canvas wall with the painted panel
    rp = box('rearpanel', (1.24, 0.03, 0.62), (0, -1.26, 1.30), PARTS); PT.uv_map(rp, AT.regions['autorear'], lambda co, n: ((co.x + 0.62) / 1.24, (co.z - 0.99) / 0.62)); objs.append(rp)
    objs.append(boxp('canopytrim', (1.42, 0.06, 0.05), (0, 0.97, 1.66), PARTS, AT, 'yellow', bevel=0.02))
    objs.append(box('windscreen', (0.98, 0.025, 0.52), (0, 0.97, 1.33), GLASS, rot=(math.radians(-12), 0, 0), bevel=0.01))
    for sx in (-1, 1):
        objs.append(PT.sweep('pillar%+d' % sx, [V((sx * 0.56, 0.95, 1.08)), V((sx * 0.62, 0.95, 1.62))], PT.circle_section(0.018, 8), PARTS)); PT.uv_const(objs[-1], AT.cells['black'])
        objs.append(PT.sweep('rpillar%+d' % sx, [V((sx * 0.64, -0.55, 0.70)), V((sx * 0.68, -0.55, 1.72))], PT.circle_section(0.015, 8), PARTS)); PT.uv_const(objs[-1], AT.cells['black'])
        tl = box('tail%+d' % sx, (0.10, 0.04, 0.08), (sx * 0.52, -1.30, 0.62), LAMPS, bevel=0.01); PT.uv_const(tl, LA.cells['red']); objs.append(tl)
        ind = box('ind%+d' % sx, (0.06, 0.04, 0.05), (sx * 0.26, 1.24, 0.98), LAMPS, bevel=0.01); PT.uv_const(ind, LA.cells['amber']); objs.append(ind)
        mr = PT.sweep('mirrorstalk%+d' % sx, [V((sx * 0.56, 0.95, 1.08)), V((sx * 0.70, 0.98, 1.16))], PT.circle_section(0.008, 6), PARTS); PT.uv_const(mr, AT.cells['black']); objs.append(mr)
        objs.append(boxp('mirror%+d' % sx, (0.10, 0.02, 0.07), (sx * 0.72, 0.98, 1.18), PARTS, AT, 'chrome', bevel=0.01))
    hl = cyl('headlamp', 0.075, 0.05, (0, 1.36, 0.94), PARTS, rot=(math.pi / 2, 0, 0), seg=20); PT.uv_const(hl, AT.cells['chrome']); objs.append(hl)
    hll = cyl('headlens', 0.06, 0.02, (0, 1.39, 0.94), LAMPS, rot=(math.pi / 2, 0, 0), seg=20); PT.uv_const(hll, LA.cells['white']); objs.append(hll)
    # seats, handlebar
    objs.append(boxp('rearseat', (1.12, 0.45, 0.14), (0, -0.85, 0.80), PARTS, AT, 'seat', bevel=0.04, seg=3))
    objs.append(boxp('rearback', (1.12, 0.12, 0.40), (0, -1.10, 1.08), PARTS, AT, 'seat', rot=(math.radians(-10), 0, 0), bevel=0.04, seg=3))
    objs.append(boxp('driverseat', (0.42, 0.40, 0.12), (0, 0.10, 0.88), PARTS, AT, 'seat', bevel=0.04, seg=3))
    objs.append(PT.sweep('handlebar', [V((-0.38, 0.62, 1.10)), V((-0.2, 0.75, 1.15)), V((0.2, 0.75, 1.15)), V((0.38, 0.62, 1.10))], PT.circle_section(0.014, 8), PARTS)); PT.uv_const(objs[-1], AT.cells['chrome'])
    # front fork, mudguard and wheels
    r = 0.205
    for sx in (-1, 1):
        objs.append(PT.sweep('fork%+d' % sx, [V((sx * 0.07, 1.10, r)), V((sx * 0.07, 1.20, 0.55))], PT.circle_section(0.02, 8), PARTS)); PT.uv_const(objs[-1], AT.cells['black'])
    objs.append(PT.sweep('fguard', [V((0, 1.10 + math.cos(math.radians(a)) * 0.25, r + math.sin(math.radians(a)) * 0.25)) for a in range(10, 171, 20)], PT.rect_section(0.14, 0.008, 0.003), YEL))
    cent = [V((0.001, 1.10, r))] + [V((sx * 0.58, -0.62, r)) for sx in (1, -1)]
    objs += wheel_set('a', cent, r, 0.10, 0.11, PARTS, AT, TYRE, 'steel', hi)
    pl = box('plate_r', (0.30, 0.012, 0.09), (0, -1.31, 0.50), PARTS); PT.uv_map(pl, AT.regions['plate'], lambda co, n: ((co.x + 0.15) / 0.3, (co.z - 0.455) / 0.09)); objs.append(pl)
    apply_all(list(bpy.context.scene.objects)); join_by_material('auto')
    print('auto', lod, 'TRIS', tri_count())
    far_lod()
    if out: export(out)


if __name__ == '__main__':
    outd = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/home/claude/blender/out2'
    sfx = '_far' if os.environ.get('FAR') else ''
    which = sys.argv[sys.argv.index('--') + 2].split(',') if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 2 else ['sedan', 'hatch', 'suv', 'taxi']
    for k in which:
        lod = 1 if sfx else 0
        if k == 'taxi': car('hatch', outd + '/taxi%s.glb' % sfx, taxi=True, lod=lod)
        elif k.startswith('truck'): truck(int(k[5:]), outd + '/%s%s.glb' % (k, sfx), lod=lod)
        elif k == 'bus': bus(outd + '/bus%s.glb' % sfx, lod=lod)
        elif k == 'auto': auto(outd + '/auto%s.glb' % sfx, lod=lod)
        else: car(k, outd + '/%s%s.glb' % (k, sfx), lod=lod)
