"""Precise 200cc-class faired sport bike (real dimensions), plus police variant.
Units: metres. Blender: X right, Y forward, Z up. Origin on the ground midway between the axles."""
import sys, math, os; sys.path.insert(0, '/home/claude/blender')
from trlib import *
import parts as PT
import biketex
import bpy, bmesh
from mathutils import Vector, Matrix
V = Vector
TEX = '/home/claude/blender/tex'

# ---- key dimensions ----
FA = V((0, 0.67, 0.293))      # front axle (110/70R17: OD 586 mm)
RA = V((0, -0.67, 0.306))     # rear axle  (150/60R17: OD 612 mm), wheelbase 1340 mm
RAKE = math.radians(23.5)
DST = V((0, -math.sin(RAKE), math.cos(RAKE)))   # steering axis direction (up the forks)
GST = V((0, 0.765, 0))        # steering axis meets the ground (trail ~95 mm)
FORK_X = 0.095
GRIP_C = V((0.275, 0.425, 0.80))
PEG_P = V((0.165, -0.17, 0.365))
SEAT_TOP = 0.832


def steer(s): return GST + DST * s
def fork(s, x=0.0): return FA + DST * s + V((x, 0, 0))


def loft_open(name, sections, material, subsurf=1):
    """Shell from open polylines: sections = [(y, [(x, z), ...]), ...] (same count)."""
    bm = bmesh.new(); rows = []
    for y, pts in sections: rows.append([bm.verts.new((x, y, z)) for x, z in pts])
    n = len(rows[0])
    for a, b in zip(rows[:-1], rows[1:]):
        for i in range(n - 1): bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_obj(name, bm, material)
    # outward normals (away from the bike's centre line)
    c = sum((v.co for v in ob.data.vertices), V((0, 0, 0))) / len(ob.data.vertices)
    out = sum(((p.center - V((0, p.center.y, c.z))).dot(p.normal) for p in ob.data.polygons))
    if out < 0:
        bm2 = bmesh.new(); bm2.from_mesh(ob.data); bmesh.ops.reverse_faces(bm2, faces=bm2.faces); bm2.to_mesh(ob.data); bm2.free()
    if subsurf: m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = subsurf; m.render_levels = subsurf
    return ob


def arc(cx, cz, rx, rz, a0, a1, n):
    """Open arc points (x, z), angles in degrees, 0 = +x, 90 = up."""
    return [(cx + math.cos(math.radians(a0 + (a1 - a0) * i / (n - 1))) * rx, cz + math.sin(math.radians(a0 + (a1 - a0) * i / (n - 1))) * rz) for i in range(n)]


def orient(ob, z_axis, y_hint=V((0, 1, 0))):
    z = V(z_axis).normalized(); y = (y_hint - z * y_hint.dot(z)).normalized(); x = y.cross(z)
    loc = ob.matrix_world.translation.copy()
    ob.matrix_world = Matrix.Translation(loc) @ Matrix((x, y, z)).transposed().to_4x4()


def build(variant='sport', out=None, lod=0):
    reset()
    hi = lod == 0
    os.makedirs(TEX, exist_ok=True)
    police = variant == 'police'
    # ---------------- textures and materials ----------------
    AT = PT.Atlas('bikeparts' + ('_lo' if lod else ''), size=1024, cell=32)
    C = {}
    for k, h, m, r in (('black', '#141518', 0.0, 0.55), ('matte', '#0c0c0e', 0.0, 0.85), ('seat', '#161617', 0.0, 0.7), ('rubber', '#0f0f10', 0.0, 0.9),
                       ('frame', '#2b2d33', 0.7, 0.35), ('frame_or', '#e8590c', 0.35, 0.35), ('alu', '#c3c6cc', 1.0, 0.28), ('alu_dark', '#4d5158', 1.0, 0.32),
                       ('chrome', '#eceef2', 1.0, 0.07), ('gold', '#cf9a2a', 1.0, 0.25), ('engine', '#2a2c31', 0.75, 0.45), ('engine_lt', '#5c6068', 0.9, 0.35),
                       ('steel', '#a4a8b0', 1.0, 0.3), ('carbon', '#1b1c1f', 0.3, 0.25), ('caliper', '#d39b1d', 0.85, 0.3), ('rim', '#17181b', 0.55, 0.3),
                       ('spring', '#d42f22', 0.3, 0.35), ('header', '#7a6a58', 1.0, 0.38), ('ti', '#8c8f96', 1.0, 0.22), ('white', '#f0f0f0', 0.0, 0.4),
                       ('hose', '#101012', 0.0, 0.6), ('reflector', '#d8dbe0', 1.0, 0.05), ('lens_dark', '#121820', 0.2, 0.05), ('pannier', '#f2f2f2', 0.1, 0.3),
                       ('blue', '#1b3f8f', 0.2, 0.3)):
        AT.add(k, h, m, r); C[k] = k
    AT.region('chain', 0, 640, 1024, 656, biketex.chain, metal=0.9, rough=0.45)
    AT.region('radiator', 0, 672, 256, 928, biketex.radiator, metal=0.6, rough=0.5)
    AT.region('dash', 288, 672, 544, 800, biketex.dash, metal=0.0, rough=0.2)
    AT.region('plate', 576, 672, 832, 800, lambda sz: biketex.plate(sz, 'MH 12 PC 1001' if police else 'MH 12 TR 7777'), metal=0.0, rough=0.5)
    AT.save(TEX)
    PARTS = AT.material('Parts')
    LA = PT.Atlas('bikelamps', size=64, cell=16)
    for k, h in (('white', '#ffffff'), ('red', '#ff1a12'), ('amber', '#ff9a00'), ('drl', '#e8f4ff')): LA.add(k, h, 0.0, 0.2)
    LA.save(TEX)
    LAMPS = LA.material('Lamps', emissive=True, emit_str=4.0)
    biketex.tyre(TEX + '/tyre_f.png', '110/70 ZR17'); biketex.tyre(TEX + '/tyre_r.png', '150/60 ZR17'); biketex.disc(TEX + '/disc.png')
    liv = TEX + ('/livery_police.png' if police else '/livery.png'); biketex.livery(liv, police=police)
    PAINT = PT.tex_mr_material('BodyPaint', liv, liv.replace('.png', '_mr.png'), coat=1.0)
    TYRE_F = tex_mat('Tyre', TEX + '/tyre_f.png', rough=0.82)
    TYRE_R = TYRE_F if not hi else tex_mat('TyreR', TEX + '/tyre_r.png', rough=0.82)
    DISC = tex_mat('Disc', TEX + '/disc.png', rough=0.3, metal=1.0)
    nt = DISC.node_tree; rnd = nt.nodes.new('ShaderNodeMath'); rnd.operation = 'ROUND'
    nt.links.new(nt.nodes['Image Texture'].outputs['Alpha'], rnd.inputs[0]); nt.links.new(rnd.outputs[0], nt.nodes['Principled BSDF'].inputs['Alpha'])
    try: DISC.blend_method = 'CLIP'; DISC.alpha_threshold = 0.5
    except Exception: pass
    try: DISC.surface_render_method = 'DITHERED'
    except Exception: pass
    GLASS = mat('Glass', hexc('#22313d'), rough=0.04, metal=0.0, alpha=0.45)

    objs = []   # (object, atlas key or None)
    def P(ob, key):
        objs.append(ob)
        if key is not None:
            if key in AT.cells: PT.uv_const(ob, AT.cells[key])
        return ob
    SEG = 40 if hi else 22

    # ======================= WHEELS =======================
    def wheel(tag, center, r_tyre, tw, rw, tyre_mat, front):
        parts = []
        hw = rw / 2
        rim_prof = [(-hw - 0.006, 0.232), (-hw - 0.002, 0.234), (-hw + 0.002, 0.226), (-hw + 0.004, 0.217), (-0.022, 0.214), (-0.016, 0.201),
                    (0.016, 0.201), (0.022, 0.214), (hw - 0.004, 0.217), (hw - 0.002, 0.226), (hw + 0.002, 0.234), (hw + 0.006, 0.232),
                    (hw + 0.006, 0.222), (hw - 0.004, 0.205), (0.0, 0.193), (-hw + 0.004, 0.205), (-hw - 0.006, 0.222)]
        rim = PT.lathe('rim_' + tag, rim_prof if hi else [rim_prof[i] for i in (0, 2, 4, 7, 9, 11, 12, 14, 16)], SEG * 2 if hi else SEG, PARTS, closed=True); PT.uv_const(rim, AT.cells['rim']); parts.append(rim)
        for sx in (-1, 1):  # machined lip
            lip = PT.lathe('lip_%s%d' % (tag, sx), [(sx * (hw + 0.0065), 0.221), (sx * (hw + 0.0065), 0.2335)], SEG * 2 if hi else SEG, PARTS)
            PT.uv_const(lip, AT.cells['alu']); parts.append(lip)
        # tyre
        Rc = tw / 2 / 0.94
        prof = [(-hw - 0.003, 0.226), (-tw / 2 + 0.006, 0.236), (-tw / 2 + 0.001, 0.247)]
        for i in range(17 if hi else 5):
            a = math.radians(-70 + 140 * i / (16 if hi else 4)); prof.append((Rc * math.sin(a), r_tyre - Rc + Rc * math.cos(a)))
        prof += [(tw / 2 - 0.001, 0.247), (tw / 2 - 0.006, 0.236), (hw + 0.003, 0.226)]
        ty = PT.lathe('tyre_' + tag, prof, 64 if hi else 28, tyre_mat, uv=2); parts.append(ty)
        # split five-spoke alloy (10 spokes)
        for k in range(5):
            base = k * 72 + (18 if front else 0)
            for dd in (-1, 1):
                a0, a1 = math.radians(base + dd * 5), math.radians(base + dd * 15)
                am = (a0 + a1) / 2 + math.radians(dd * 1.5)
                pts = [V((0, math.cos(a0) * 0.052, math.sin(a0) * 0.052)), V((0, math.cos(am) * 0.125, math.sin(am) * 0.125)), V((0, math.cos(a1) * 0.197, math.sin(a1) * 0.197))]
                sp = PT.sweep('spoke_%s%d%d' % (tag, k, dd), pts, PT.rect_section(0.016, 0.011, 0.004, 1 if hi else 0), PARTS)
                PT.uv_const(sp, AT.cells['rim']); parts.append(sp)
        hub = PT.lathe('hub_' + tag, [(-hw - 0.02, 0.028), (-hw - 0.02, 0.040), (-0.03, 0.052), (0.03, 0.052), (hw + 0.02, 0.040), (hw + 0.02, 0.028)], 24, PARTS)
        PT.uv_const(hub, AT.cells['rim']); parts.append(hub)
        nut = PT.lathe('axle_' + tag, [(-hw - 0.05, 0.0), (-hw - 0.05, 0.016), (hw + 0.05, 0.016), (hw + 0.05, 0.0)], 12, PARTS)
        PT.uv_const(nut, AT.cells['steel']); parts.append(nut)
        # brake rotor(s)
        def rotor(x, R, carrier_col):
            bm_ = bmesh.new(); uvl = bm_.loops.layers.uv.new('UVMap')
            n = 64 if hi else 40
            ring_o = [bm_.verts.new((x, math.cos(2 * math.pi * i / n) * R, math.sin(2 * math.pi * i / n) * R)) for i in range(n)]
            ring_i = [bm_.verts.new((x, math.cos(2 * math.pi * i / n) * R * 0.66, math.sin(2 * math.pi * i / n) * R * 0.66)) for i in range(n)]
            for i in range(n):
                j = (i + 1) % n
                f = bm_.faces.new((ring_i[i], ring_i[j], ring_o[j], ring_o[i]))
                for loop in f.loops:
                    co = loop.vert.co; loop[uvl].uv = (0.5 + co.y / (2 * R), 0.5 + co.z / (2 * R))
            d_ = mesh_obj('disc_' + tag, bm_, DISC, smooth=False)
            so = d_.modifiers.new('sol', 'SOLIDIFY'); so.thickness = 0.005; so.offset = 0
            parts.append(d_)
            car = PT.lathe('carrier_' + tag, [(x - 0.004, 0.05), (x - 0.004, R * 0.68), (x + 0.004, R * 0.68), (x + 0.004, 0.05)], 36, PARTS, closed=True)
            PT.uv_const(car, AT.cells[carrier_col]); parts.append(car)
            if hi:
                for i in range(8):
                    a = 2 * math.pi * i / 8
                    bt = cyl('button_%s%d' % (tag, i), 0.007, 0.012, (x, math.cos(a) * R * 0.67, math.sin(a) * R * 0.67), PARTS, rot=(0, math.pi / 2, 0), seg=10)
                    PT.uv_const(bt, AT.cells['gold']); parts.append(bt)
        if front: rotor(-0.072, 0.150, 'alu_dark')
        else:
            rotor(0.088, 0.110, 'alu_dark')
            # rear sprocket (left), 42 teeth
            nT = 42; bm_ = bmesh.new(); outer = []
            for i in range(nT * 2):
                a = 2 * math.pi * i / (nT * 2); r_ = 0.112 if i % 2 == 0 else 0.103
                outer.append((math.cos(a) * r_, math.sin(a) * r_))
            inner = [(math.cos(2 * math.pi * i / (nT * 2)) * 0.075, math.sin(2 * math.pi * i / (nT * 2)) * 0.075) for i in range(nT * 2)]
            for side, xx in ((1, -0.085), (-1, -0.091)):
                pass
            vo = [bm_.verts.new((-0.085, a_, b_)) for a_, b_ in outer]; vi = [bm_.verts.new((-0.085, a_, b_)) for a_, b_ in inner]
            vo2 = [bm_.verts.new((-0.091, a_, b_)) for a_, b_ in outer]; vi2 = [bm_.verts.new((-0.091, a_, b_)) for a_, b_ in inner]
            m_ = len(outer)
            for i in range(m_):
                j = (i + 1) % m_
                bm_.faces.new((vi[i], vi[j], vo[j], vo[i])); bm_.faces.new((vo2[i], vo2[j], vi2[j], vi2[i]))
                bm_.faces.new((vo[i], vo[j], vo2[j], vo2[i])); bm_.faces.new((vi2[i], vi2[j], vi[j], vi[i]))
            bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)
            spk = mesh_obj('sprocket', bm_, PARTS, smooth=False); PT.uv_const(spk, AT.cells['alu']); parts.append(spk)
            for k in range(6):
                a = 2 * math.pi * k / 6
                arm = PT.sweep('sparm%d' % k, [V((-0.088, math.cos(a) * 0.045, math.sin(a) * 0.045)), V((-0.088, math.cos(a) * 0.08, math.sin(a) * 0.08))], PT.rect_section(0.006, 0.02), PARTS)
                PT.uv_const(arm, AT.cells['alu']); parts.append(arm)
        for o in parts: o.location = o.location + center
        return parts

    wf_parts = wheel('f', FA, 0.293, 0.110, 0.076, TYRE_F, True)
    wr_parts = wheel('r', RA, 0.306, 0.150, 0.102, TYRE_R, False)

    # ======================= FRONT END =======================
    s_top = (0.875 - FA.z) / DST.z
    for sx in (-1, 1):
        x = sx * FORK_X
        P(PT.sweep('stanchion%+d' % sx, [fork(0.03, x), fork(0.32, x)], PT.circle_section(0.0215, 16), PARTS), 'chrome' if police else 'gold')
        P(PT.sweep('forkouter%+d' % sx, [fork(0.30, x), fork(s_top + 0.03, x)], PT.circle_section(0.0275, 18), PARTS), 'alu_dark' if not police else 'alu')
        P(PT.sweep('forkcap%+d' % sx, [fork(s_top + 0.03, x), fork(s_top + 0.045, x)], PT.circle_section(0.019, 12), PARTS), 'alu_dark')
        lug = box('axlelug%+d' % sx, (0.045, 0.07, 0.085), fork(0.015, x) + V((sx * 0.004, 0, 0)), PARTS, bevel=0.012, segments=2); P(lug, 'alu_dark')
    # radial caliper on the left leg, behind the rotor
    ca = FA + V((-0.072, -0.128, -0.045))
    cal = box('caliper_f', (0.05, 0.11, 0.055), ca, PARTS, rot=(math.radians(-20), 0, 0), bevel=0.012, segments=2); P(cal, 'caliper')
    P(box('calmount_f', (0.018, 0.05, 0.10), FA + V((-0.095, -0.095, -0.0)), PARTS, rot=(math.radians(-20), 0, 0), bevel=0.006), 'alu_dark')
    # brake line
    P(PT.sweep('brakeline', [ca + V((0, 0.03, 0.03)), fork(0.35, -0.13) + V((0, -0.02, 0)), fork(s_top - 0.04, -0.06) + V((0, -0.03, 0)), V((-0.16, 0.40, 0.84))], PT.circle_section(0.004, 6), PARTS), 'hose')
    # triple clamps
    tc = steer((0.875 - GST.z) / DST.z)
    top = box('topclamp', (0.25, 0.09, 0.022), (FA + DST * s_top + tc) / 2 + V((0, 0, 0.0)), PARTS, rot=(-RAKE, 0, 0), bevel=0.01, segments=2); P(top, 'alu')
    P(box('lowclamp', (0.26, 0.08, 0.04), (FA + DST * (s_top - 0.15) + steer((0.875 - GST.z) / DST.z - 0.15)) / 2, PARTS, rot=(-RAKE, 0, 0), bevel=0.012), 'alu_dark')
    P(cyl('stemnut', 0.018, 0.015, tc + DST * 0.014, PARTS, rot=(-RAKE, 0, 0), seg=6), 'alu')
    # clip-ons, grips and controls
    for sx in (-1, 1):
        c0 = fork(s_top - 0.06, sx * FORK_X)
        c1 = V((sx * 0.215, GRIP_C.y + 0.01, GRIP_C.z + 0.01))
        P(PT.sweep('clipclamp%+d' % sx, [c0 - DST * 0.025, c0 + DST * 0.025], PT.circle_section(0.034, 16), PARTS), 'alu_dark')
        P(PT.sweep('clipbar%+d' % sx, [c0, c1], PT.circle_section(0.011, 10), PARTS), 'alu_dark')
        g0, g1 = V((sx * 0.215, GRIP_C.y + 0.01, GRIP_C.z + 0.01)), V((sx * 0.335, GRIP_C.y - 0.01, GRIP_C.z - 0.01))
        grip_prof = [(i / 10, 0.0155 + 0.0015 * math.sin(i * 1.5) ** 2) for i in range(11)]
        P(PT.sweep('grip%+d' % sx, [g0.lerp(g1, t) for t in (0.08, 0.3, 0.55, 0.8, 0.92)], PT.circle_section(0.0165, 14), PARTS), 'rubber')
        P(PT.sweep('barend%+d' % sx, [g1 - (g1 - g0).normalized() * 0.005, g1 + (g1 - g0).normalized() * 0.022], PT.circle_section(0.017, 14), PARTS), 'alu')
        P(box('switch%+d' % sx, (0.04, 0.05, 0.045), g0 + V((-sx * 0.012, 0, 0.004)), PARTS, bevel=0.012, segments=2), 'black')
        # lever: brake (right) / clutch (left), ahead of the grip
        lv = [g0 + V((-sx * 0.005, 0.03, 0.0)), g0.lerp(g1, 0.5) + V((0, 0.07, -0.01)), g1 + V((sx * 0.01, 0.06, -0.02))]
        P(PT.sweep('lever%+d' % sx, lv, PT.rect_section(0.008, 0.016, 0.003, 1), PARTS), 'alu' if sx > 0 else 'alu_dark')
        if sx > 0:
            P(cyl('reservoir', 0.017, 0.035, g0 + V((-0.02, 0.01, 0.045)), PARTS, seg=12), 'black')
    # dash
    dsh = box('dash', (0.17, 0.012, 0.10), tc + V((0, 0.07, 0.085)), PARTS, rot=(math.radians(-58), 0, 0), bevel=0.004)
    PT.uv_map(dsh, AT.regions['dash'], lambda co, n: ((co.x + 0.075) / 0.15, (co.z - (tc.z + 0.085 - 0.04)) / 0.08)) if n_ok(dsh) else None
    P(dsh, None)
    P(box('dashhousing', (0.19, 0.04, 0.115), tc + V((0, 0.09, 0.078)), PARTS, rot=(math.radians(-58), 0, 0), bevel=0.012), 'matte')

    # ======================= FRAME, SWINGARM, SUSPENSION =======================
    PIV = V((0, -0.15, 0.42))
    hd_top, hd_bot = steer((0.86 - GST.z) / DST.z), steer((0.70 - GST.z) / DST.z)
    P(PT.sweep('headtube', [hd_bot - DST * 0.02, hd_top + DST * 0.01], PT.circle_section(0.03, 16), PARTS), 'frame')
    fr = 'frame'
    tube_r = 0.0135
    for sx in (-1, 1):
        x = sx
        up = [hd_top + V((x * 0.03, -0.01, -0.01)), V((x * 0.115, 0.22, 0.80)), V((x * 0.13, 0.02, 0.74)), V((x * 0.12, -0.14, 0.63))]
        lo = [hd_bot + V((x * 0.03, 0.0, 0.0)), V((x * 0.12, 0.25, 0.60)), V((x * 0.13, 0.06, 0.56)), V((x * 0.12, -0.12, 0.50))]
        P(PT.sweep('rail_up%+d' % sx, up, PT.circle_section(tube_r * 1.25, 10), PARTS), fr)
        P(PT.sweep('rail_lo%+d' % sx, lo, PT.circle_section(tube_r, 10), PARTS), fr)
        # trellis diagonals
        for a_, b_ in ((up[1], lo[1]), (up[1], lo[2]), (up[2], lo[2]), (up[2], lo[3]), (up[3], lo[3]), (up[0].lerp(up[1], 0.5), lo[1])):
            P(PT.sweep('tr%+d_%d' % (sx, len(objs)), [a_, b_], PT.circle_section(tube_r * 0.85, 8), PARTS), fr)
        # swingarm pivot plate
        P(box('pivplate%+d' % sx, (0.022, 0.11, 0.26), V((x * 0.118, -0.14, 0.50)), PARTS, bevel=0.015, segments=2), 'alu')
        P(cyl('pivbolt%+d' % sx, 0.016, 0.012, V((x * 0.132, PIV.y, PIV.z)), PARTS, rot=(0, math.pi / 2, 0), seg=6), 'steel')
        # subframe
        sf = [V((x * 0.12, -0.14, 0.63)), V((x * 0.095, -0.45, 0.78)), V((x * 0.07, -0.80, 0.86))]
        P(PT.sweep('subframe%+d' % sx, sf, PT.circle_section(0.011, 8), PARTS), fr)
        P(PT.sweep('substay%+d' % sx, [V((x * 0.12, -0.12, 0.50)), V((x * 0.10, -0.45, 0.76))], PT.circle_section(0.009, 8), PARTS), fr)
    # swingarm: braced box section
    for sx in (-1, 1):
        x0, x1 = sx * 0.105, sx * 0.118
        pts = [V((x0, PIV.y - 0.02, PIV.z)), V((x1, -0.40, 0.375)), V((x1, RA.y + 0.02, RA.z))]
        P(PT.sweep('swing%+d' % sx, pts, PT.rect_section(0.034, 0.072, 0.012, 2), PARTS), 'alu')
        P(box('adjuster%+d' % sx, (0.03, 0.06, 0.035), V((x1 + sx * 0.002, RA.y - 0.035, RA.z)), PARTS, bevel=0.006), 'alu_dark')
    P(PT.sweep('swingbrace', [V((-0.105, -0.27, 0.40)), V((0.105, -0.27, 0.40))], PT.rect_section(0.04, 0.05, 0.01), PARTS), 'alu')
    P(PT.sweep('swingbrace2', [V((-0.07, -0.30, 0.43)), V((0, -0.25, 0.52)), V((0.07, -0.30, 0.43))], PT.circle_section(0.012, 8), PARTS), 'alu')
    # monoshock with a real coil spring
    s0, s1 = V((0, -0.27, 0.47)), V((0, -0.17, 0.70))
    P(PT.sweep('shockbody', [s0, s1], PT.circle_section(0.018, 14), PARTS), 'alu_dark')
    ax_ = (s1 - s0).normalized(); px = V((1, 0, 0)); py = ax_.cross(px)
    coil = [s0.lerp(s1, 0.15 + 0.6 * t / 120) + (px * math.cos(t / 120 * 2 * math.pi * 7) + py * math.sin(t / 120 * 2 * math.pi * 7)) * 0.03 for t in range(0, 121, 2 if hi else 4)]
    P(PT.sweep('spring', coil, PT.circle_section(0.0055, 6 if hi else 4), PARTS), 'spring')
    P(cyl('reservoir_r', 0.016, 0.07, s1 + V((0.04, -0.02, -0.02)), PARTS, rot=(0.6, 0, 0), seg=12), 'gold')

    # ======================= ENGINE =======================
    P(box('crankcase', (0.25, 0.34, 0.22), V((0, -0.01, 0.40)), PARTS, bevel=0.045, segments=3), 'engine')
    P(cyl('clutchcover', 0.095, 0.03, V((0.13, 0.0, 0.40)), PARTS, rot=(0, math.pi / 2, 0), seg=32), 'engine_lt')
    P(cyl('clutchcap', 0.04, 0.012, V((0.148, 0.0, 0.40)), PARTS, rot=(0, math.pi / 2, 0), seg=20), 'alu')
    P(cyl('magneto', 0.085, 0.03, V((-0.128, 0.04, 0.43)), PARTS, rot=(0, math.pi / 2, 0), seg=32), 'engine_lt')
    P(cyl('sprocketcover', 0.05, 0.025, V((-0.12, -0.08, 0.40)), PARTS, rot=(0, math.pi / 2, 0), seg=20), 'black')
    P(box('sump', (0.20, 0.26, 0.07), V((0, 0.0, 0.27)), PARTS, bevel=0.02), 'engine')
    cy0, cy1 = V((0, 0.10, 0.50)), V((0, 0.20, 0.70))
    cylb = PT.sweep('cylinder', [cy0, cy1], PT.rect_section(0.15, 0.14, 0.02, 2), PARTS); P(cylb, 'engine')
    P(PT.sweep('head', [cy1 - (cy1 - cy0).normalized() * 0.01, cy1 + (cy1 - cy0).normalized() * 0.07], PT.rect_section(0.18, 0.16, 0.025, 2), PARTS), 'engine_lt')
    P(PT.sweep('valvecover', [cy1 + (cy1 - cy0).normalized() * 0.07, cy1 + (cy1 - cy0).normalized() * 0.105], PT.rect_section(0.15, 0.13, 0.03, 2), PARTS), 'black')
    if hi:
        for k in range(6):   # cooling fins / ribs on the cylinder
            t = 0.15 + k * 0.13
            P(PT.sweep('fin%d' % k, [cy0.lerp(cy1, t), cy0.lerp(cy1, t + 0.02)], PT.rect_section(0.162, 0.152, 0.02, 1), PARTS), 'engine_lt')
    # radiator with shroud and grille, hoses
    rad_c = V((0, 0.37, 0.58))
    rad = box('radiator', (0.30, 0.045, 0.25), rad_c, PARTS, rot=(math.radians(-14), 0, 0), bevel=0.006)
    PT.uv_map(rad, AT.regions['radiator'], lambda co, n: ((co.x + 0.15) / 0.30, (co.z - (rad_c.z - 0.12)) / 0.24))
    P(rad, None)
    P(box('radshroud', (0.33, 0.06, 0.28), rad_c + V((0, -0.01, 0)), PARTS, rot=(math.radians(-14), 0, 0), bevel=0.01), 'black')
    P(PT.sweep('hose1', [rad_c + V((0.12, -0.03, 0.10)), V((0.06, 0.24, 0.70)), cy1 + V((0.05, 0.02, 0.0))], PT.circle_section(0.012, 8), PARTS), 'hose')
    P(PT.sweep('hose2', [rad_c + V((-0.12, -0.03, -0.10)), V((-0.10, 0.20, 0.38)), V((-0.11, 0.12, 0.40))], PT.circle_section(0.012, 8), PARTS), 'hose')
    # throttle body + airbox snorkel behind the cylinder
    P(PT.sweep('throttle', [cy1 + V((0, -0.08, 0.02)), V((0, 0.05, 0.78))], PT.circle_section(0.028, 12), PARTS), 'alu_dark')
    # exhaust: header round the front, under the engine, to a short side muffler (right)
    hdr = [cy1 + V((0, 0.07, -0.04)), V((0.0, 0.31, 0.50)), V((0.03, 0.30, 0.30)), V((0.06, 0.18, 0.20)), V((0.08, -0.05, 0.20)), V((0.13, -0.24, 0.30)), V((0.165, -0.33, 0.39))]
    P(PT.sweep('header', hdr, PT.circle_section(0.019, 12), PARTS), 'header')
    P(box('precat', (0.12, 0.22, 0.08), V((0.03, 0.04, 0.20)), PARTS, bevel=0.03, segments=2), 'black')
    m0, m1 = V((0.165, -0.33, 0.39)), V((0.205, -0.66, 0.56))
    msec = [(math.cos(2 * math.pi * i / 16) * 0.065, math.sin(2 * math.pi * i / 16) * 0.05) for i in range(16)]
    P(PT.sweep('muffler', [m0, m0.lerp(m1, 0.5), m1], msec, PARTS), 'ti')
    P(PT.sweep('mufflercap', [m1, m1 + (m1 - m0).normalized() * 0.03], [(x * 0.9, y * 0.9) for x, y in msec], PARTS), 'carbon')
    P(PT.sweep('tip', [m1 + (m1 - m0).normalized() * 0.02, m1 + (m1 - m0).normalized() * 0.05], PT.circle_section(0.022, 12), PARTS), 'black')
    P(box('heatshield', (0.012, 0.25, 0.07), m0.lerp(m1, 0.45) + V((0.062, 0, 0.01)), PARTS, rot=(math.radians(-27), 0, math.radians(6)), bevel=0.01), 'carbon')
    P(PT.sweep('mufflerhanger', [m0.lerp(m1, 0.6), V((0.10, -0.52, 0.66))], PT.rect_section(0.012, 0.03, 0.004), PARTS), 'alu')

    # ======================= CHAIN (left side) =======================
    fs_c, fs_r = V((-0.088, -0.08, 0.40)), 0.042
    rs_c, rs_r = V((-0.088, RA.y, RA.z)), 0.107
    def ang(p, c): return math.atan2(p.z - c.z, p.y - c.y)
    dvec = rs_c - fs_c; L = dvec.length; base_a = math.atan2(dvec.z, dvec.y); off = math.asin((fs_r - rs_r) / L)
    pts = []
    a_top = base_a + math.pi / 2 + off; a_bot = base_a - math.pi / 2 - off
    # around the front sprocket (front side), along top run, around rear sprocket, bottom run
    for i in range(13):
        a = a_bot + (a_top - a_bot) * i / 12 if a_top > a_bot else a_bot - (a_bot - a_top) * i / 12
        pts.append(fs_c + V((0, math.cos(a + 0.0) * fs_r, math.sin(a) * fs_r)))
    a_top2 = a_top; a_bot2 = a_bot + 2 * math.pi
    for i in range(1, 25):
        a = a_top2 + (a_bot2 - a_top2) * i / 24
        pts.append(rs_c + V((0, math.cos(a) * rs_r, math.sin(a) * rs_r)))
    pts = [p for p in pts]
    # make the loop go front->top->rear->bottom by sorting is unnecessary: arcs were built in order
    chainob = PT.sweep('chain', pts + [pts[0]], PT.rect_section(0.016, 0.009, 0.002, 1), PARTS, uv_rect=AT.regions['chain'], uv_len=2.7)
    P(chainob, None)
    P(PT.sweep('chainguard', [rs_c + V((0.0, 0.08, 0.13)), V((-0.088, -0.35, 0.47))], PT.rect_section(0.03, 0.006, 0.002), PARTS), 'black')

    # ======================= BODYWORK =======================
    # Closed panels built from stations along Y: (y, z_bottom, z_top, half-width bottom / middle / top).
    sub_ = 2 if hi else 1
    NS = 24 if hi else 12
    def section(zb, zt, wb, wm, wt, p=2.6, n=NS):
        pts = []; zc = (zb + zt) / 2; hh = (zt - zb) / 2
        for i in range(n):
            a_ = math.radians(-90 + 360 * i / n); c, s_ = math.cos(a_), math.sin(a_)
            h = (s_ + 1) / 2
            w = wb * (1 - h) * (1 - 2 * h) + wm * 4 * h * (1 - h) + wt * h * (2 * h - 1)
            x = math.copysign(abs(c) ** (2 / p), c) * w
            z = zc + math.copysign(abs(s_) ** (2 / p), s_) * hh
            pts.append((x, z))
        return pts
    def body(name, stations, m, p=2.6, crease=0.85):
        """Panels with sharp styling lines: 10-point sections, creased along the shoulders and lower corners."""
        bm_ = bmesh.new(); rows = []
        for y, zb, zt, wb, wm, wt in stations:
            h = zt - zb
            half = [(wb * 0.55, zb), (wb, zb + 0.10 * h), (wm, zb + 0.48 * h), (wt * 1.12, zb + 0.80 * h), (wt * 0.55, zb + 0.97 * h)]
            pts = [(0, zb - 0.004 * (1 if h > 0.05 else 0))] + half + [(0, zt)] + [(-x, z) for x, z in reversed(half)]
            rows.append([bm_.verts.new((x, y, z)) for x, z in pts])
        n = len(rows[0])
        cl = bm_.edges.layers.float.new('crease_edge')
        for r0, r1 in zip(rows[:-1], rows[1:]):
            for i in range(n):
                j = (i + 1) % n; bm_.faces.new((r0[i], r0[j], r1[j], r1[i]))
        bm_.faces.new(list(reversed(rows[0]))); bm_.faces.new(rows[-1])
        bm_.edges.ensure_lookup_table()
        sharp = {2, 4, n - 2, n - 4}
        for r0, r1 in zip(rows[:-1], rows[1:]):
            for i in sharp:
                e = bm_.edges.get((r0[i], r1[i]))
                if e: e[cl] = crease
        bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)
        ob = mesh_obj(name, bm_, m)
        sm = ob.modifiers.new('sub', 'SUBSURF'); sm.levels = sub_; sm.render_levels = sub_
        if not hi and len(stations) > 5: pass
        return ob
    fairing = body('fairing', [
        (1.010, 0.832, 0.858, 0.010, 0.016, 0.008),
        (0.990, 0.795, 0.885, 0.040, 0.060, 0.030),
        (0.950, 0.755, 0.918, 0.075, 0.100, 0.055),
        (0.885, 0.705, 0.950, 0.115, 0.148, 0.085),
        (0.800, 0.670, 0.972, 0.160, 0.195, 0.115),
        (0.700, 0.655, 0.978, 0.195, 0.232, 0.140),
        (0.600, 0.640, 0.958, 0.210, 0.258, 0.165),
        (0.500, 0.580, 0.925, 0.205, 0.258, 0.170),
        (0.410, 0.490, 0.890, 0.195, 0.255, 0.170),
        (0.350, 0.300, 0.865, 0.180, 0.250, 0.170),
        (0.240, 0.250, 0.835, 0.170, 0.240, 0.165),
        (0.120, 0.250, 0.800, 0.165, 0.222, 0.160),
        (0.030, 0.270, 0.760, 0.150, 0.195, 0.150),
        (-0.030, 0.310, 0.700, 0.110, 0.140, 0.110)], PAINT)
    P(fairing, None)
    tank = body('tank', [
        (0.470, 0.800, 0.900, 0.090, 0.110, 0.060),
        (0.400, 0.770, 0.965, 0.150, 0.180, 0.120),
        (0.280, 0.760, 0.998, 0.165, 0.200, 0.150),
        (0.160, 0.760, 0.992, 0.160, 0.195, 0.150),
        (0.040, 0.760, 0.950, 0.130, 0.165, 0.125),
        (-0.050, 0.780, 0.880, 0.090, 0.110, 0.080)], PAINT, p=2.4)
    P(tank, None)
    P(cyl('fuelcap', 0.04, 0.008, V((0, 0.25, 0.997)), PARTS, seg=24), 'alu')
    if hi:
        for k in range(6):
            a_ = 2 * math.pi * k / 6
            P(cyl('capbolt%d' % k, 0.004, 0.006, V((math.cos(a_) * 0.035, 0.25 + math.sin(a_) * 0.035, 1.0)), PARTS, seg=6), 'black')
    seat = body('seat', [
        (-0.020, 0.800, 0.848, 0.070, 0.090, 0.070),
        (-0.100, 0.790, 0.842, 0.105, 0.120, 0.105),
        (-0.220, 0.780, SEAT_TOP + 0.004, 0.125, 0.135, 0.120),
        (-0.330, 0.790, 0.845, 0.120, 0.130, 0.110),
        (-0.385, 0.810, 0.880, 0.095, 0.105, 0.085),
        (-0.400, 0.830, 0.885, 0.06, 0.07, 0.05)], PARTS, p=3.0)
    PT.uv_const(seat, AT.cells['seat']); P(seat, None)
    tail = body('tail', [
        (-0.240, 0.700, 0.800, 0.140, 0.150, 0.130),
        (-0.380, 0.715, 0.870, 0.140, 0.150, 0.130),
        (-0.520, 0.735, 0.900, 0.120, 0.132, 0.115),
        (-0.700, 0.775, 0.930, 0.095, 0.105, 0.090),
        (-0.860, 0.830, 0.952, 0.065, 0.075, 0.062),
        (-0.960, 0.880, 0.962, 0.040, 0.046, 0.038),
        (-1.005, 0.915, 0.958, 0.014, 0.018, 0.014)], PAINT, p=3.2)
    P(tail, None)
    pil = body('pillion', [(-0.40, 0.86, 0.905, 0.085, 0.095, 0.08), (-0.50, 0.875, 0.915, 0.09, 0.10, 0.085), (-0.62, 0.895, 0.937, 0.075, 0.085, 0.07), (-0.665, 0.905, 0.94, 0.05, 0.06, 0.045)], PARTS, p=3.0)
    PT.uv_const(pil, AT.cells['seat']); P(pil, None)
    # undertail, hugger, plate hanger, plate, lights
    P(box('undertail', (0.18, 0.40, 0.05), V((0, -0.72, 0.80)), PARTS, rot=(math.radians(10), 0, 0), bevel=0.02), 'black')
    P(PT.sweep('hanger', [V((0, -0.82, 0.80)), V((0, -0.95, 0.70)), V((0, -0.99, 0.62))], PT.rect_section(0.13, 0.008, 0.003), PARTS), 'black')
    pl = box('plate', (0.17, 0.004, 0.11), V((0, -1.0, 0.57)), PARTS, rot=(math.radians(15), 0, 0))
    PT.uv_map(pl, AT.regions['plate'], lambda co, n: ((co.x + 0.085) / 0.17 if n.y < 0 else (0.085 - co.x) / 0.17, (co.z - 0.515) / 0.11)); P(pl, None)
    taillamp = box('taillamp', (0.11, 0.02, 0.03), V((0, -0.995, 0.935)), LAMPS, bevel=0.008); PT.uv_const(taillamp, LA.cells['red']); P(taillamp, None)
    for sx in (-1, 1):
        ind = cyl('ind_r%+d' % sx, 0.012, 0.05, V((sx * 0.10, -0.96, 0.66)), LAMPS, rot=(0, math.pi / 2, 0), seg=10); PT.uv_const(ind, LA.cells['amber']); P(ind, None)
        P(PT.sweep('indstalk%+d' % sx, [V((sx * 0.03, -0.96, 0.66)), V((sx * 0.075, -0.96, 0.66))], PT.circle_section(0.006, 6), PARTS), 'black')
    P(PT.sweep('hugger', [RA + V((0, math.cos(math.radians(a)) * 0.34, math.sin(math.radians(a)) * 0.34)) for a in range(55, 136, 10)], PT.rect_section(0.14, 0.006, 0.003), PARTS), 'black')
    # front mudguard
    P(PT.sweep('mudguard', [FA + V((0, math.cos(math.radians(a)) * 0.325, math.sin(math.radians(a)) * 0.325)) for a in range(25, 141, 10)], PT.rect_section(0.125, 0.005, 0.002), PAINT if not police else PARTS), None if not police else 'white')
    # headlights: twin projectors in black-chrome pods + DRL strips
    for sx in (-1, 1):
        hc = V((sx * 0.052, 0.952, 0.838))
        pod = sphere('pod%+d' % sx, 1.0, hc, PARTS, scale=(0.042, 0.03, 0.026), seg=24 if hi else 10, rings=12 if hi else 5); P(pod, 'lens_dark')
        P(cyl('refl%+d' % sx, 0.026, 0.01, hc + V((0, 0.018, 0)), PARTS, rot=(math.pi / 2, 0, 0), seg=24), 'reflector')
        lens = cyl('lens%+d' % sx, 0.018, 0.012, hc + V((0, 0.024, 0)), LAMPS, rot=(math.pi / 2, 0, 0), seg=20); PT.uv_const(lens, LA.cells['white']); P(lens, None)
        drl = PT.sweep('drl%+d' % sx, [V((sx * 0.015, 0.997, 0.866)), V((sx * 0.07, 0.962, 0.892)), V((sx * 0.12, 0.905, 0.925))], PT.rect_section(0.006, 0.008, 0.002), LAMPS)
        PT.uv_const(drl, LA.cells['drl']); P(drl, None)
        # mirrors
        stalk = [V((sx * 0.20, 0.78, 0.955)), V((sx * 0.25, 0.77, 0.985)), V((sx * 0.29, 0.76, 1.0))]
        P(PT.sweep('mirrorstalk%+d' % sx, stalk, PT.circle_section(0.007, 8), PARTS), 'black')
        mh = sphere('mirror%+d' % sx, 1.0, V((sx * 0.31, 0.755, 1.005)), PARTS, scale=(0.065, 0.03, 0.038), seg=20 if hi else 10, rings=10 if hi else 5); P(mh, 'black')
        mg = sphere('mirrorglass%+d' % sx, 1.0, V((sx * 0.31, 0.738, 1.005)), PARTS, scale=(0.058, 0.012, 0.031), seg=20 if hi else 10, rings=10 if hi else 5); P(mg, 'reflector')
        ind = sphere('ind_f%+d' % sx, 1.0, V((sx * 0.355, 0.755, 1.0)), LAMPS, scale=(0.02, 0.022, 0.01), seg=12 if hi else 8, rings=6 if hi else 4); PT.uv_const(ind, LA.cells['amber']); P(ind, None)
    # windscreen (smoked), sits in the top of the cowl
    wsecs = []
    for y, xw, zl, zt in ((0.83, 0.150, 0.955, 0.968), (0.76, 0.155, 0.972, 1.03), (0.68, 0.145, 0.975, 1.08), (0.62, 0.120, 0.97, 1.105)):
        wsecs.append((y, [(math.cos(math.radians(a_)) * xw, zl + math.sin(math.radians(a_)) * (zt - zl)) for a_ in range(0, 181, 15)]))
    ws = loft_open('windscreen', wsecs if hi else [(y, p_[::2]) for y, p_ in wsecs], GLASS, subsurf=1 if hi else 0); so = ws.modifiers.new('sol', 'SOLIDIFY'); so.thickness = 0.003
    P(ws, None)

    # ======================= CONTROLS: pegs, rearsets, levers =======================
    for sx in (-1, 1):
        pg = V((sx * PEG_P.x, PEG_P.y, PEG_P.z))
        P(box('hanger%+d' % sx, (0.012, 0.16, 0.09), V((sx * 0.13, PEG_P.y - 0.02, PEG_P.z + 0.04)), PARTS, rot=(math.radians(15), 0, 0), bevel=0.01), 'alu')
        peg_pts = [V((sx * 0.135, pg.y, pg.z)), V((sx * 0.21, pg.y, pg.z))]
        P(PT.sweep('peg%+d' % sx, peg_pts, PT.circle_section(0.011, 10), PARTS), 'alu_dark')
        if hi:
            for k in range(5):
                P(cyl('pegknurl%+d%d' % (sx, k), 0.0125, 0.004, V((sx * (0.15 + k * 0.012), pg.y, pg.z)), PARTS, rot=(0, math.pi / 2, 0), seg=10), 'alu')
        # gear lever (left) / brake pedal (right)
        lv = [V((sx * 0.14, pg.y + 0.02, pg.z + 0.01)), V((sx * 0.15, pg.y + 0.14, pg.z - 0.01)), V((sx * 0.16, pg.y + 0.18, pg.z + 0.01))]
        P(PT.sweep('footlever%+d' % sx, lv, PT.rect_section(0.008, 0.016, 0.003), PARTS), 'alu')
        P(box('heelguard%+d' % sx, (0.004, 0.10, 0.07), V((sx * 0.215, pg.y - 0.05, pg.z + 0.05)), PARTS, bevel=0.003), 'alu_dark')
    # rear caliper and torque arm
    rc = RA + V((0.088, 0.03, -0.10))
    P(box('caliper_r', (0.035, 0.08, 0.045), rc, PARTS, rot=(math.radians(20), 0, 0), bevel=0.01), 'caliper')
    P(PT.sweep('torquearm', [rc + V((0.01, 0.02, 0)), V((0.10, -0.40, 0.37))], PT.rect_section(0.008, 0.02, 0.003), PARTS), 'alu_dark')
    # side stand (folded)
    P(PT.sweep('sidestand', [V((-0.12, -0.10, 0.30)), V((-0.15, -0.36, 0.33))], PT.circle_section(0.01, 8), PARTS), 'black')

    if police:
        BLUE = mat('Siren_B', hexc('#1f5bff'), emit=hexc('#2a62ff'), emit_str=4.0)
        RED = mat('Siren_R', hexc('#ff2020'), emit=hexc('#ff1a1a'), emit_str=4.0)
        P(PT.sweep('lightpost', [V((0, -0.72, 0.92)), V((0, -0.74, 1.18))], PT.circle_section(0.012, 8), PARTS), 'black')
        P(box('lightbar', (0.30, 0.05, 0.035), V((0, -0.74, 1.20)), PARTS, bevel=0.01), 'black')
        P(box('siren_r', (0.12, 0.055, 0.05), V((-0.08, -0.74, 1.24)), RED, bevel=0.012), None)
        P(box('siren_b', (0.12, 0.055, 0.05), V((0.08, -0.74, 1.24)), BLUE, bevel=0.012), None)
        for sx in (-1, 1):
            pn = box('pannier%+d' % sx, (0.15, 0.42, 0.30), V((sx * 0.27, -0.55, 0.72)), PARTS, bevel=0.045, segments=3); P(pn, 'pannier')
            P(box('pstripe%+d' % sx, (0.005, 0.40, 0.05), V((sx * 0.346, -0.55, 0.74)), PARTS), 'blue')
            P(sphere('beacon%+d' % sx, 0.028, V((sx * 0.13, 0.975, 0.80)), RED if sx < 0 else BLUE, scale=(1, 0.6, 0.6)), None)
        P(PT.sweep('crashbar', [V((-0.25, 0.30, 0.30)), V((-0.27, 0.32, 0.55)), V((-0.16, 0.36, 0.62))], PT.circle_section(0.013, 8), PARTS), 'chrome')
        P(PT.sweep('crashbar2', [V((0.25, 0.30, 0.30)), V((0.27, 0.32, 0.55)), V((0.16, 0.36, 0.62))], PT.circle_section(0.013, 8), PARTS), 'chrome')

    # ---------- UVs for painted panels: side projection (left/right halves) + top projection ----------
    def liv_uv(co, n):
        if n.z > 0.75:   # top strip
            return (1.05 - co.y) / 2.1, 0.75 + (co.x / 0.7 + 0.5) * 0.25
        vv = (co.z - 0.15) / 1.05 * 0.75
        if co.x >= 0: return (co.y + 1.05) / 2.1 * 0.5, vv
        return 0.5 + (1.05 - co.y) / 2.1 * 0.5, vv
    apply_all(list(bpy.context.scene.objects))
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH' and ob.data.materials and ob.data.materials[0].name == 'BodyPaint':
            PT.uv_map(ob, (0, 0, 1, 1), liv_uv)
    wf = join_group('WheelF', wf_parts, FA)
    wr = join_group('WheelR', wr_parts, RA)
    if os.environ.get('TRIREPORT'):
        rep = sorted(((sum(len(p.vertices) - 2 for p in o.data.polygons), o.name) for o in bpy.context.scene.objects if o.type == 'MESH'), reverse=True)[:25]
        print(rep)
    join_by_material('bike', exclude=('WheelF', 'WheelR'))
    if lod >= 2:   # far LOD: collapse-decimate everything (keeps UVs and the wheel nodes)
        for ob in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
            bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
            d = ob.modifiers.new('dec', 'DECIMATE'); d.ratio = 0.28; bpy.ops.object.modifier_apply(modifier='dec')
    print(variant, lod, 'TRIS', tri_count())
    if out: export(out)


def n_ok(ob): return True


if __name__ == '__main__':
    outd = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/home/claude/blender/out2'
    build('sport', outd + '/bike.glb')
    build('sport', outd + '/bike_lo.glb', lod=1)
    build('police', outd + '/policebike_lo.glb', lod=1)
    build('sport', outd + '/bike_far.glb', lod=2)
    build('police', outd + '/policebike_far.glb', lod=2)
