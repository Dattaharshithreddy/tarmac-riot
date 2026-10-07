"""Realistic rider: MakeHuman CC0 body in one-piece racing leathers, posed on the new bike, with a game rig and fight clips."""
import sys, math, os; sys.path.insert(0, '/home/claude/blender')
from trlib import *
import mhlib
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion
V = Vector

# ---- bike contact points (must match bike2.py) ----
SEAT = V((0, -0.24, 0.915))       # where the rider's hip joints sit above
GRIP = V((0.275, 0.425, 0.80))    # right grip centre (mirror for left)
PEG = V((0.165, -0.15, 0.365))    # right footpeg (ball of the foot rests here)

GAME_MAP = {}
def game_bone(mh):
    n = mh
    side = '.L' if n.endswith('.L') else '.R' if n.endswith('.R') else ''
    b = n[:-2] if side else n
    if b in ('root', 'pelvis', 'spine05'): return 'hips'
    if b in ('spine04', 'spine03'): return 'spine'
    if b in ('spine02', 'spine01', 'breast'): return 'chest'
    if b.startswith('neck'): return 'neck'
    if b in ('clavicle', 'shoulder01'): return 'shoulder' + side
    if b.startswith('upperarm'): return 'upperarm' + side
    if b.startswith('lowerarm'): return 'forearm' + side
    if b in ('wrist',) or b.startswith('metacarpal') or b.startswith('finger'): return 'hand' + side
    if b.startswith('upperleg'): return 'thigh' + side
    if b.startswith('lowerleg'): return 'shin' + side
    if b == 'foot' or b.startswith('toe'): return 'foot' + side
    return 'head'   # head, jaw, eyes, tongue and facial bones

ORDER = ['hips', 'spine', 'chest', 'neck', 'head'] + [p + s for s in ('.L', '.R') for p in ('shoulder', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot')]


def two_bone(a, t, l1, l2, pole):
    """Return the middle joint for a two-bone chain from a towards t, bending towards pole."""
    d = t - a; L = d.length
    L = min(L, (l1 + l2) * 0.999); dn = d.normalized()
    x = (l1 * l1 - l2 * l2 + L * L) / (2 * L)
    h = math.sqrt(max(0.0, l1 * l1 - x * x))
    pn = (pole - dn * pole.dot(dn)).normalized()
    return a + dn * x + pn * h


def build(out, lod=0, report=None):
    reset()
    bpy.context.scene.render.fps = 30
    vall, uvs, faces = mhlib.male_body(muscle=0.62, weight=0.5, height=0.0, asian=0.6, caucasian=0.4, ideal=0.6)
    MB = mhlib.skeleton(vall)
    W = mhlib.weights()
    body_f = [f for f in faces if f[0] == 'body']
    used = sorted({i for f in body_f for i in f[1]})
    remap = {o: i for i, o in enumerate(used)}
    rest = vall[used]

    # ---------------- materials ----------------
    PRIM = mat('Jacket', hexc('#ff6a00'), rough=0.38, coat=0.35)        # main suit colour (recoloured in game)
    BLACK = mat('SuitBlack', hexc('#141518'), rough=0.5, coat=0.2)
    WHITE = mat('JacketTrim', hexc('#eeeeee'), rough=0.4, coat=0.3)
    STRETCH = mat('Stretch', hexc('#2a2b30'), rough=0.85)                # accordion panels
    GLOVE = mat('Gloves', hexc('#1a1b1f'), rough=0.55)
    BOOT = mat('Boots', hexc('#101114'), rough=0.32, coat=0.4)
    ARMOR = mat('Armor', hexc('#2e3138'), rough=0.3, metal=0.2)
    SLIDER = mat('Slider', hexc('#d8d8d8'), rough=0.5)
    HELMET = mat('Helmet', hexc('#ffd400'), rough=0.12, coat=1.0)
    HBLACK = mat('HelmetBlack', hexc('#0d0d10'), rough=0.3)
    VISOR = mat('Visor', hexc('#1b2733'), rough=0.04, metal=0.35, coat=1.0)
    mats = [PRIM, BLACK, WHITE, STRETCH, GLOVE, BOOT]
    MI = {m.name: i for i, m in enumerate(mats)}

    # ---------------- suit design on the standing (rest) body ----------------
    # regions from the dominant MakeHuman bone of each face
    vb = {}  # vertex -> (best bone, weight)
    for bn, lst in W.items():
        for vi, w in lst:
            if vi in remap and (vi not in vb or w > vb[vi][1]): vb[vi] = (bn, w)
    def region(vi):
        return game_bone(vb.get(vi, ('spine03', 1))[0])
    zs = rest[:, 2]
    hip_l, hip_r = MB['upperleg01.L']['head'], MB['upperleg01.R']['head']
    knee_r = MB['lowerleg01.R']['head']; ankle_r = MB['foot.R']['head']
    wrist_r = MB['wrist.R']['head']; elbow_r = MB['lowerarm01.R']['head']; sh_r = MB['upperarm01.R']['head']
    neck_z = MB['neck01']['head'][2]
    import suittex
    face_reg = []
    for g, idx, _ in body_f:
        regs = [region(i).split('.')[0] for i in idx]; face_reg.append(suittex.REG[max(set(regs), key=regs.count)])
    tex_path = '/home/claude/blender/tex/suit.png'
    if not os.path.exists(tex_path) or os.environ.get('RETEX'):
        suittex.paint(vall, [(f[1], f[2], r_) for f, r_ in zip(body_f, face_reg)], uvs, MB, size=2048, out=tex_path)
    import parts as PT
    SUIT = PT.tex_mr_material('Suit', tex_path, tex_path.replace('.png', '_mr.png'), coat=0.25)
    mats = [SUIT, BOOT]
    MI = {m.name: i for i, m in enumerate(mats)}
    face_mat = [0] * len(body_f)

    # ---------------- mesh ----------------
    me = bpy.data.meshes.new('RiderBody')
    me.from_pydata([tuple(p) for p in rest], [], [[remap[i] for i in f[1]] for f in body_f])
    body = bpy.data.objects.new('RiderMesh', me); link(body)
    for m in mats: me.materials.append(m)
    for p, mi in zip(me.polygons, face_mat): p.material_index = mi; p.use_smooth = True
    uvl = me.uv_layers.new(name='UVMap')
    li = 0
    for p, f in zip(me.polygons, body_f):
        for k, li_ in enumerate(p.loop_indices): uvl.data[li_].uv = uvs[f[2][k]]

    # MakeHuman weights as vertex groups
    for bn, lst in W.items():
        vg = body.vertex_groups.new(name=bn)
        for vi, w in lst:
            if vi in remap: vg.add([remap[vi]], w, 'REPLACE')

    # ---------------- full MakeHuman armature (for posing) ----------------
    ad = bpy.data.armatures.new('MHRig'); arm = bpy.data.objects.new('MHRig', ad); link(arm)
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for n, b in MB.items():
        e = ad.edit_bones.new(n); e.head = V(b['head']); e.tail = V(b['tail'])
        if (e.tail - e.head).length < 1e-4: e.tail = e.head + V((0, 0, 0.01))
    for n, b in MB.items():
        if b['parent']: ad.edit_bones[n].parent = ad.edit_bones[b['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    mod = body.modifiers.new('arm', 'ARMATURE'); mod.object = arm; mod.use_deform_preserve_volume = True
    pbs = arm.pose.bones
    for pb in pbs: pb.rotation_mode = 'QUATERNION'

    def aim(name, want_dir, twist_up=None):
        bpy.context.view_layer.update()
        pb = pbs[name]
        cur = (pb.tail - pb.head)
        if cur.length < 1e-6: return
        q = cur.normalized().rotation_difference(V(want_dir).normalized())
        m = pb.matrix.copy()
        pb.matrix = Matrix.Translation(pb.head) @ (q.to_matrix() @ m.to_3x3()).to_4x4()
        bpy.context.view_layer.update()

    def rot_about(name, axis, ang):
        bpy.context.view_layer.update()
        pb = pbs[name]; m = pb.matrix.copy()
        q = Quaternion(V(axis).normalized(), ang)
        pb.matrix = Matrix.Translation(pb.head) @ (q.to_matrix() @ m.to_3x3()).to_4x4()
        bpy.context.view_layer.update()

    def head_of(n): bpy.context.view_layer.update(); return arm.matrix_world @ pbs[n].head
    def tail_of(n): bpy.context.view_layer.update(); return arm.matrix_world @ pbs[n].tail

    # place the hips over the seat
    hipc = (V(MB['upperleg01.L']['head']) + V(MB['upperleg01.R']['head'])) / 2
    pbs['root'].location = V((0, 0, 0))
    arm.location = SEAT - hipc; body.location = SEAT - hipc
    bpy.context.view_layer.update()

    # torso lean: tuck forward; solved so the hands reach the grips with bent elbows
    def dirdeg(fwd_deg):  # direction in the YZ plane, degrees forward from vertical
        a = math.radians(fwd_deg); return V((0, math.sin(a), math.cos(a)))
    L_up = (V(MB['lowerarm01.R']['head']) - V(MB['upperarm01.R']['head'])).length
    L_fo = (V(MB['wrist.R']['head']) - V(MB['lowerarm01.R']['head'])).length
    lean = 40.0
    for it in range(14):
        for pb in pbs: pb.rotation_quaternion = Quaternion(); pb.location = V((0, 0, 0))
        bpy.context.view_layer.update()
        aim('spine05', dirdeg(lean * 0.55)); aim('spine04', dirdeg(lean * 0.85)); aim('spine03', dirdeg(lean)); aim('spine02', dirdeg(lean + 4)); aim('spine01', dirdeg(lean + 6))
        sh = head_of('upperarm01.R')
        wrist_t = GRIP + V((0.0, -0.045, 0.06))
        reach = (wrist_t - sh).length / (L_up + L_fo)
        if reach > 0.97: lean += 2.0
        elif reach < 0.80: lean -= 2.0
        else: break
    print('lean', lean, 'reach', round(reach, 3))
    aim('neck01', dirdeg(lean * 0.55)); aim('neck02', dirdeg(lean * 0.35)); aim('neck03', dirdeg(lean * 0.2))
    aim('head', dirdeg(12))
    # arms: two-bone IK to the grips, elbows bent out and down
    for s, n in ((1, 'R'), (-1, 'L')):
        g = V((GRIP.x * s, GRIP.y, GRIP.z))
        aim('clavicle.' + n, (tail_of('clavicle.' + n) - head_of('clavicle.' + n)).normalized() + V((0, 0.35, -0.1)))
        sh = head_of('upperarm01.' + n)
        wt = g + V((0.0, -0.045, 0.06))
        el = two_bone(sh, wt, L_up, L_fo, V((s * 0.8, -0.1, -0.6)))
        aim('shoulder01.' + n, el - head_of('shoulder01.' + n)) if (tail_of('shoulder01.' + n) - head_of('shoulder01.' + n)).length > 0.02 else None
        aim('upperarm01.' + n, el - head_of('upperarm01.' + n)); aim('upperarm02.' + n, el - head_of('upperarm02.' + n))
        aim('lowerarm01.' + n, wt - head_of('lowerarm01.' + n)); aim('lowerarm02.' + n, wt - head_of('lowerarm02.' + n))
        # hand points forward-down over the grip, palm wrapped round it
        aim('wrist.' + n, V((s * 0.10, 0.70, -0.62)))
        # curl fingers round the bar: axis across the palm
        # curl each finger joint round the bar; pick the bend direction that wraps towards the grip axis
        across = (head_of('finger5-1.' + n) - head_of('finger2-1.' + n)).normalized()
        gax = V((1, 0, 0))
        def dist_to_bar(p): d = p - g; return (d - gax * d.dot(gax)).length
        for f in range(1, 6):
            angs = ((1, 0.35), (2, 0.5), (3, 0.4)) if f == 1 else ((1, 0.75), (2, 1.0), (3, 0.75))
            for k, ang in angs:
                bn_ = 'finger%d-%d.%s' % (f, k, n)
                tip = 'finger%d-3.%s' % (f, n)
                best = None
                for sg in (1, -1):
                    rot_about(bn_, across, sg * ang)
                    d = dist_to_bar(tail_of(tip))
                    rot_about(bn_, across, -sg * ang)
                    if best is None or d < best[0]: best = (d, sg)
                rot_about(bn_, across, best[1] * ang)
    # legs: hips -> footpegs, knees forward and gripping the tank
    for s, n in ((1, 'R'), (-1, 'L')):
        hp = head_of('upperleg01.' + n)
        kn0, an0 = V(MB['lowerleg01.' + n]['head']), V(MB['foot.' + n]['head'])
        l1 = (kn0 - V(MB['upperleg01.' + n]['head'])).length; l2 = (an0 - kn0).length
        peg = V((PEG.x * s, PEG.y, PEG.z))
        at = peg + V((s * 0.005, -0.075, 0.075))   # ankle sits behind and above the ball of the foot
        kn = two_bone(hp, at, l1, l2, V((s * 0.12, 1.0, 0.3)))
        aim('upperleg01.' + n, kn - head_of('upperleg01.' + n)); aim('upperleg02.' + n, kn - head_of('upperleg02.' + n))
        aim('lowerleg01.' + n, at - head_of('lowerleg01.' + n)); aim('lowerleg02.' + n, at - head_of('lowerleg02.' + n))
        aim('foot.' + n, V((s * 0.12, 0.8, -0.42)))
    bpy.context.view_layer.update()
    # joints of the posed body (for the game rig)
    Jp = {}
    Jp['root'] = (head_of('upperleg01.L') + head_of('upperleg01.R')) / 2 + V((0, -0.01, 0))
    Jp['pelvis'] = head_of('spine04'); Jp['waist'] = head_of('spine02'); Jp['chest'] = head_of('spine01')
    Jp['neck'] = head_of('neck01'); Jp['head'] = head_of('head'); Jp['headtop'] = tail_of('head')
    for n in ('L', 'R'):
        Jp['shoulder.' + n] = head_of('upperarm01.' + n); Jp['elbow.' + n] = head_of('lowerarm01.' + n)
        Jp['wrist.' + n] = head_of('wrist.' + n); Jp['handtip.' + n] = head_of('finger3-1.' + n)
        Jp['hip.' + n] = head_of('upperleg01.' + n); Jp['knee.' + n] = head_of('lowerleg01.' + n)
        Jp['ankle.' + n] = head_of('foot.' + n); Jp['toe.' + n] = tail_of('foot.' + n)
    head_base, head_tip = head_of('head'), tail_of('head')
    shin_dir = {n: (head_of('foot.' + n) - head_of('lowerleg01.' + n)).normalized() for n in ('L', 'R')}
    fore_dir = {n: (head_of('wrist.' + n) - head_of('lowerarm01.' + n)).normalized() for n in ('L', 'R')}
    foot_dir = {n: (tail_of('foot.' + n) - head_of('foot.' + n)).normalized() for n in ('L', 'R')}

    # apply the pose to the mesh
    bpy.context.view_layer.objects.active = body; body.select_set(True)
    bpy.ops.object.modifier_apply(modifier='arm')
    bpy.data.objects.remove(arm)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # ---------------- game skeleton weights (merge MakeHuman groups) ----------------
    gw = np.zeros((len(me.vertices), len(ORDER)))
    gi = {b: i for i, b in enumerate(ORDER)}
    for vg in body.vertex_groups:
        gb = game_bone(vg.name)
        if gb == 'hips' and vg.name.startswith('pelvis'): gb = 'hips'
        col = gi[gb]
        for v in me.vertices:
            for g in v.groups:
                if g.group == vg.index: gw[v.index, col] += g.weight
    s_ = gw.sum(axis=1, keepdims=True); s_[s_ == 0] = 1; gw /= s_
    dom = [ORDER[i] for i in gw.argmax(axis=1)]
    for vg in list(body.vertex_groups): body.vertex_groups.remove(vg)

    # ---------------- leathers, gloves and boots shaping ----------------
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.normal_update()
    rest_z = rest[:, 2]
    ank_z = MB['foot.R']['head'][2]
    sh_z = MB['upperarm01.R']['head'][2]
    is_foot = [dom[i].startswith('foot') or (dom[i].startswith('shin') and rest_z[i] < ank_z + 0.16) for i in range(len(dom))]
    is_hand = [dom[i].startswith('hand') for i in range(len(dom))]
    bm.normal_update()
    offs = []
    for v in bm.verts:
        i = v.index; r = rest[i]
        o = 0.0055
        if is_hand[i]: o = 0.0035
        if is_foot[i]: o = 0.013
        # aero hump on the upper back
        # shoulder armour
        for sx in (1, -1):
            c = np.array([MB['upperarm01.R']['head'][0] * sx, MB['upperarm01.R']['head'][1], sh_z])
            d = np.linalg.norm(r - c)
            if d < 0.075: o += 0.012 * math.cos(d / 0.075 * math.pi / 2)
        # knuckle armour on the gloves
        offs.append(o)
    for v, o in zip(bm.verts, offs): v.co += v.normal * o
    # remove the head (inside the helmet)
    head_vs = [v for v in bm.verts if dom[v.index] == 'head' and (v.co - head_base).dot((head_tip - head_base).normalized()) > -0.01]
    foot_vs = [v for v in bm.verts if is_foot[v.index] and rest_z[v.index] < ank_z + 0.03]
    head_pts = [v.co.copy() for v in head_vs]
    dead_idx = {v.index for v in head_vs + foot_vs}
    keep_idx = [i for i in range(len(bm.verts)) if i not in dead_idx]
    bmesh.ops.delete(bm, geom=head_vs + foot_vs, context='VERTS')
    bm.to_mesh(me); bm.free()
    gw = gw[keep_idx]  # bmesh delete keeps the order of the survivors
    for p in me.polygons: p.use_smooth = True

    parts = [body]
    def puck(name, center, normal, along, size, m):
        ob = sphere(name, 1.0, (0, 0, 0), m, scale=size, seg=20 if lod == 0 else 12, rings=10 if lod == 0 else 6)
        n = V(normal).normalized(); al = (V(along) - n * V(along).dot(n)).normalized(); x = al.cross(n)
        R = Matrix((x, al, n)).transposed().to_4x4()
        ob.matrix_world = Matrix.Translation(center) @ R
        return ob
    # ---------------- helmet (full-face, race style) ----------------
    up = (head_tip - head_base).normalized()
    fwd = (V((0, 1, 0)) - up * up.y).normalized(); right = fwd.cross(up)
    HM = Matrix((right, fwd, up)).transposed()  # local -> world rotation
    loc = [HM.transposed() @ (p - head_base) for p in head_pts]
    mn = V((min(l.x for l in loc), min(l.y for l in loc), min(l.z for l in loc)))
    mx = V((max(l.x for l in loc), max(l.y for l in loc), max(l.z for l in loc)))
    a = max(0.122, (mx.x - mn.x) / 2 + 0.034); b_ = max(0.150, (mx.y - mn.y) / 2 + 0.038); c = 0.146
    ctr = V(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2 + 0.008, mx.z + 0.035 - c))
    HO = head_base + HM @ ctr
    HW = Matrix.Translation(HO) @ HM.to_4x4()
    seg, rings = (64, 40) if lod == 0 else (32, 20)
    bmh = bmesh.new(); bmesh.ops.create_uvsphere(bmh, u_segments=seg, v_segments=rings, radius=1.0)
    def shape(x, y, z):
        sx = 1 - 0.13 * max(0.0, y) - 0.04 * max(0.0, -y)
        t = min(1.0, max(0.0, (-z - 0.15) / 0.65))
        if y > 0: y = y * (1 + 0.16 * t * y); sx *= 1 - 0.14 * t   # chin bar: forward and narrower
        y -= 0.07 * max(0.0, z) ** 2                                  # crown sweeps back
        if y < 0 and z < 0: z = z * (1 + 0.08 * -y)                    # deeper at the back of the neck
        return V((x * a * sx, y * b_, z * c))
    def cut(yl):
        yn = yl / b_
        return c * (-0.66 - 0.30 * max(0.0, yn) ** 1.5 - 0.14 * max(0.0, -yn))
    def U(lon, lat):
        lo, la = math.radians(lon), math.radians(lat)
        return V((math.sin(lo) * math.cos(la), math.cos(lo) * math.cos(la), math.sin(la)))
    def SNu(u, eps=0.004):  # shell point + normal for a unit direction
        u = u.normalized(); p0 = shape(*u)
        t1 = u.cross(V((0, 0, 1)) if abs(u.z) < 0.9 else V((1, 0, 0))).normalized(); t2 = u.cross(t1)
        du = shape(*(u + t1 * eps).normalized()) - shape(*(u - t1 * eps).normalized())
        dv = shape(*(u + t2 * eps).normalized()) - shape(*(u - t2 * eps).normalized())
        nrm = du.cross(dv).normalized()
        return p0, (nrm if nrm.dot(p0) > 0 else -nrm)
    def SN(lon, lat): return SNu(U(lon, lat))
    for v in bmh.verts: v.co = shape(*v.co)
    for v in bmh.verts:
        if v.co.z < cut(v.co.y): v.co.z = cut(v.co.y)
    dead = [f for f in bmh.faces if all(v.co.z <= cut(v.co.y) + 1e-5 for v in f.verts)]
    bmesh.ops.delete(bmh, geom=dead, context='FACES')
    helm = mesh_obj('helmet', bmh, HELMET)
    helm.data.materials.append(HBLACK)
    sol = helm.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.016; sol.material_offset = 1; sol.offset = -1
    helm.matrix_world = HW
    def patch(name, m, cols, rows, lonlat, lift, thick=0.0):
        """Smooth patch on the shell: lonlat(i, j) -> (lon, lat) on a cols x rows grid."""
        bmp = bmesh.new(); grid = []
        for j in range(rows + 1):
            row = []
            for i in range(cols + 1):
                r_ = lonlat(i / cols, j / rows); p0, nn = SNu(r_) if isinstance(r_, Vector) else SN(*r_)
                row.append(bmp.verts.new(p0 + nn * lift))
            grid.append(row)
        for j in range(rows):
            for i in range(cols):
                bmp.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        bmesh.ops.recalc_face_normals(bmp, faces=bmp.faces)
        ob = mesh_obj(name, bmp, m); ob.matrix_world = HW
        if thick: so = ob.modifiers.new('sol', 'SOLIDIFY'); so.thickness = thick; so.offset = 1
        return ob
    # visor: superellipse window across the front, eye level
    VLON, VLAT, VH = 72.0, -5.0, 20.0
    def vis_ll(u, w):
        lo = (u * 2 - 1) * VLON; uu = abs(lo / VLON)
        hh = VH * (max(0.0, 1 - uu ** 5)) ** 0.2
        return lo, VLAT - hh + 2 * hh * w
    ccols, crows = (48, 10) if lod == 0 else (24, 5)
    vis = patch('visor', VISOR, ccols, crows, vis_ll, 0.0035, 0.003)
    # rubber seal round the visor
    edge = []
    for k in range(0, 121):
        t = k / 120.0
        if t < 0.25: u, w = t * 4, 0.0
        elif t < 0.5: u, w = 1.0, (t - 0.25) * 4
        elif t < 0.75: u, w = 1 - (t - 0.5) * 4, 1.0
        else: u, w = 0.0, 1 - (t - 0.75) * 4
        lo, la = vis_ll(u, w); p0, nn = SN(lo, la); edge.append(tuple(HW @ (p0 + nn * 0.0045)))
    seal = tube('vseal', edge, 0.0035, HBLACK, seg=6)
    # centre stripe over the crown
    stripe = patch('stripe', HBLACK, 2, 40 if lod == 0 else 20, lambda u, w: V(((u * 2 - 1) * 0.045, math.cos(math.radians(22 + w * 100)), math.sin(math.radians(22 + w * 100)))), 0.0009)
    parts += [helm, vis, seal, stripe]
    hverts = [(v.co.copy(), v.normal.copy()) for v in helm.data.vertices]
    def on_surf(name, lon, lat, size, m, lift=0.0, spin=0.0, kind='box'):
        co, nn = SN(lon, lat)
        if kind == 'box': ob = box(name, size, (0, 0, 0), m, bevel=min(size) * 0.45, segments=3)
        else: ob = cyl(name, size[0], size[2], (0, 0, 0), m, seg=24)
        zax = nn.normalized(); yax = (V((0, 0, 1)) - zax * zax.z); yax = yax.normalized() if yax.length > 1e-4 else V((0, 1, 0)); xax = yax.cross(zax)
        R = Matrix((xax, yax, zax)).transposed().to_4x4() @ Matrix.Rotation(spin, 4, 'Z')
        ob.matrix_world = HW @ Matrix.Translation(co + nn * lift) @ R
        return ob
    parts.append(on_surf('spoiler', 180, 18, (0.12, 0.045, 0.026), HELMET, lift=0.008))
    parts.append(on_surf('ventL', -13, 52, (0.022, 0.05, 0.010), HBLACK, lift=0.001))
    parts.append(on_surf('ventR', 13, 52, (0.022, 0.05, 0.010), HBLACK, lift=0.001))
    parts.append(on_surf('chinvent', 0, -40, (0.065, 0.03, 0.010), HBLACK, lift=0.001))
    for sx in (1, -1):
        parts.append(on_surf('pivot', sx * 76, -8, (0.022, 0.022, 0.006), HBLACK, lift=0.004, kind='cyl'))
    # neck roll under the rim
    rim = [HW @ co for co, nn in hverts if abs(co.z - cut(co.y)) < 1e-4]
    if rim:
        cen = sum(rim, V((0, 0, 0))) / len(rim)
        rim.sort(key=lambda p: math.atan2((HM.transposed() @ (p - cen)).x, (HM.transposed() @ (p - cen)).y))
        ring = [cen + (p - cen) * 0.94 + up * 0.004 for p in rim[::max(1, len(rim) // 40)]]
        ring.append(ring[0])
        parts.append(tube('neckroll', [tuple(p) for p in ring], 0.013, HBLACK, seg=8))

    # ---------------- aero hump (follows the back surface) ----------------
    ta = (Jp['neck'] - Jp['waist']).normalized(); back = V((1, 0, 0)).cross(ta).normalized()
    base_pt = Jp['waist']; span = (Jp['neck'] - Jp['waist']).length
    pts_ = [(v.co - base_pt) for v in me.vertices if abs(v.co.x) < 0.035]
    def back_surface(t):
        h = t * span; best = None
        for d in pts_:
            if abs(d.dot(ta) - h) < 0.02:
                bd = d.dot(back)
                if best is None or bd > best: best = bd
        return best if best is not None else 0.1
    HS = []
    for t, w, hgt in ((0.55, 0.03, 0.002), (0.68, 0.06, 0.012), (0.8, 0.07, 0.024), (0.9, 0.07, 0.032), (0.97, 0.06, 0.034), (1.01, 0.035, 0.028), (1.03, 0.015, 0.02)):
        bs = back_surface(min(t, 1.0)) - 0.012
        HS.append((t * span, [(x, bs + hgt / 2 + z) for x, z in ell(0, 0, w, hgt / 2 + 0.012, n=16, squash=0.6)]))
    hu = loft('hump', HS, PRIM, subsurf=1 if lod == 0 else 0)
    hu.matrix_world = Matrix.Translation(base_pt) @ Matrix((V((1, 0, 0)), ta, back)).transposed().to_4x4()
    parts.append(hu)

    # ---------------- racing boots ----------------
    for s, n in ((1, 'R'), (-1, 'L')):
        an = Jp['ankle.' + n]; fd = foot_dir[n]; upl = -shin_dir[n]
        fwd_ = fd.normalized(); upf = (V((0, 0, 1)) - fwd_ * fwd_.z).normalized(); rt = fwd_.cross(upf).normalized()
        FM = Matrix.Translation(an) @ Matrix((rt, fwd_, upf)).transposed().to_4x4()
        secs = []
        for y, w, top, bot in ((-0.075, 0.040, 0.05, 0.075), (-0.05, 0.048, 0.06, 0.08), (0.0, 0.052, 0.055, 0.082), (0.06, 0.055, 0.035, 0.08),
                               (0.12, 0.054, 0.022, 0.079), (0.16, 0.048, 0.016, 0.076), (0.19, 0.036, 0.010, 0.072), (0.205, 0.02, 0.004, 0.068)):
            secs.append((y, rbox(0, -0.035, w, top, bot, n=20, p=2.5)))
        bf = loft('bootfoot.' + n, secs, BOOT, subsurf=1 if lod == 0 else 0); bf.matrix_world = FM
        zb = {y: -0.035 - bot for y, w, top, bot in ((-0.075, 0.040, 0.05, 0.075), (-0.05, 0.048, 0.06, 0.08), (0.0, 0.052, 0.055, 0.082), (0.06, 0.055, 0.035, 0.08),
                               (0.12, 0.054, 0.022, 0.079), (0.16, 0.048, 0.016, 0.076), (0.19, 0.036, 0.010, 0.072), (0.205, 0.02, 0.004, 0.068))}
        wsec = {-0.075: 0.040, -0.05: 0.048, 0.0: 0.052, 0.06: 0.055, 0.12: 0.054, 0.16: 0.048, 0.19: 0.036, 0.205: 0.02}
        sole = loft('bootsole.' + n, [(y, rbox(0, zb[y] + 0.004, wsec[y] * 1.03, 0.006, 0.006, n=16, p=4)) for y in sorted(zb)], HBLACK, subsurf=0)
        sole.matrix_world = FM
        # shaft up the shin
        SM = Matrix.Translation(an) @ Matrix((rt, upl, rt.cross(upl))).transposed().to_4x4()
        ssecs = [(y, ell(0, 0.005, rx, rz, n=16)) for y, rx, rz in ((-0.03, 0.050, 0.058), (0.05, 0.047, 0.052), (0.13, 0.054, 0.058), (0.21, 0.060, 0.064), (0.25, 0.062, 0.066))]
        sh_ = loft('bootshaft.' + n, ssecs, BOOT, subsurf=1 if lod == 0 else 0, cap=False); sh_.matrix_world = SM
        parts += [bf, sole, sh_]
        # buckle strap and heel slider
        parts.append(puck('heel.' + n, an + fwd_ * -0.08 + upf * -0.03, -fwd_, upf, (0.03, 0.04, 0.01), SLIDER))

    # ---------------- sliders and armour pucks ----------------
    for s, n in ((1, 'R'), (-1, 'L')):
        kn = Jp['knee.' + n]
        outn = V((s, 0.35, 0.15))
        parts.append(puck('knee.' + n, kn + V((s * 0.062, 0.03, 0.0)), outn, shin_dir[n], (0.036, 0.055, 0.011), SLIDER))
        el = Jp['elbow.' + n]
        parts.append(puck('elbow.' + n, el + V((s * 0.03, -0.035, -0.02)), V((s * 0.6, -0.5, -0.6)), fore_dir[n], (0.032, 0.045, 0.012), ARMOR))
        parts.append(puck('toe.' + n, Jp['ankle.' + n] + foot_dir[n] * 0.16 + V((s * 0.05, 0, -0.035)), V((s, 0.1, 0.1)), foot_dir[n], (0.018, 0.045, 0.007), SLIDER))
    apply_all(parts)

    # ---------------- game armature ----------------
    B = {'hips': ('root', 'pelvis', None), 'spine': ('pelvis', 'waist', 'hips'), 'chest': ('waist', 'chest', 'spine'),
         'neck': ('chest', 'neck', 'chest'), 'head': ('neck', 'headtop', 'neck')}
    for n in ('L', 'R'):
        B['shoulder.' + n] = ('chest', 'shoulder.' + n, 'chest'); B['upperarm.' + n] = ('shoulder.' + n, 'elbow.' + n, 'shoulder.' + n)
        B['forearm.' + n] = ('elbow.' + n, 'wrist.' + n, 'upperarm.' + n); B['hand.' + n] = ('wrist.' + n, 'handtip.' + n, 'forearm.' + n)
        B['thigh.' + n] = ('hip.' + n, 'knee.' + n, 'hips'); B['shin.' + n] = ('knee.' + n, 'ankle.' + n, 'thigh.' + n)
        B['foot.' + n] = ('ankle.' + n, 'toe.' + n, 'shin.' + n)
    gd = bpy.data.armatures.new('RiderRig'); rig = bpy.data.objects.new('Rider', gd); link(rig)
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for bn in ORDER:
        h, t, par = B[bn]; e = gd.edit_bones.new(bn); e.head = Jp[h]; e.tail = Jp[t]; e.roll = 0
        if par: e.parent = gd.edit_bones[par]
    bpy.ops.object.mode_set(mode='OBJECT')
    for bn in ORDER: body.vertex_groups.new(name=bn)
    for i in range(len(me.vertices)):
        for j, w in enumerate(gw[i]):
            if w > 0.01: body.vertex_groups[ORDER[j]].add([i], float(w), 'REPLACE')
    rigid = {'helmet': 'head', 'visor': 'head', 'spoiler': 'head', 'ventL': 'head', 'ventR': 'head', 'chinvent': 'head', 'pivot': 'head',
             'knee': 'shin', 'elbow': 'forearm', 'toe': 'foot', 'rearvent': 'head', 'neckroll': 'head', 'vseal': 'head', 'stripe': 'head', 'hump': 'chest',
             'bootfoot': 'foot', 'bootsole': 'foot', 'bootshaft': 'shin', 'heel': 'foot'}
    for ob in parts[1:]:
        key = ob.name.split('.')[0]; side = ob.name.split('.')[1] if '.' in ob.name and ob.name.split('.')[1] in ('L', 'R') else None
        bn = rigid[key] + ('.' + side if side else '')
        vg = ob.vertex_groups.new(name=bn); vg.add([v.index for v in ob.data.vertices], 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts: ob.select_set(True)
    bpy.context.view_layer.objects.active = body; bpy.ops.object.join(); body.name = 'RiderMesh'
    if lod:
        dm = body.modifiers.new('dec', 'DECIMATE'); dm.ratio = 0.3
        bpy.ops.object.modifier_apply(modifier='dec')
    for p in body.data.polygons: p.use_smooth = True
    m = body.modifiers.new('arm', 'ARMATURE'); m.object = rig; body.parent = rig

    # ---------------- animation clips (old clip shapes re-targeted to this body) ----------------
    import rider as old
    Jo = old.J
    pbs = rig.pose.bones
    for pb in pbs: pb.rotation_mode = 'QUATERNION'
    def apply_pose(T, root_off=V((0, 0, 0))):
        for pb in pbs: pb.rotation_quaternion = Quaternion(); pb.location = V((0, 0, 0))
        pbs['hips'].location = gd.bones['hips'].matrix_local.inverted().to_3x3() @ root_off
        bpy.context.view_layer.update()
        for bn in ORDER:
            h, t, _ = B[bn]
            want = (T[t] - T[h])
            if want.length < 1e-6: continue
            bpy.context.view_layer.update()
            pb = pbs[bn]
            q = (pb.tail - pb.head).normalized().rotation_difference(want.normalized())
            mm = pb.matrix.copy()
            pb.matrix = Matrix.Translation(pb.head) @ (q.to_matrix() @ mm.to_3x3()).to_4x4()
        bpy.context.view_layer.update()
    def key_all(f):
        for pb in pbs: pb.keyframe_insert('rotation_quaternion', frame=f)
        pbs['hips'].keyframe_insert('location', frame=f)
    def mk(d):
        T = {k: v.copy() for k, v in Jp.items()}
        for k, v in d.items(): T[k] = Jp[k] + (V(v) - Jo[k])
        return T
    def side_pose(s, fn):
        d = fn()
        if s > 0: return d
        out_ = {}
        for k, v in d.items():
            k2 = k.replace('.R', '.X').replace('.L', '.R').replace('.X', '.L')
            # mirror the offset, not the absolute position
            out_[k2] = V((-v[0], v[1], v[2]))
        return out_
    def clip(name, frames):
        act = bpy.data.actions.new(name); act.use_fake_user = True
        if not rig.animation_data: rig.animation_data_create()
        rig.animation_data.action = act
        for f, T, off in frames: apply_pose(T, off); key_all(f)
    Z = V((0, 0, 0))
    old.define_clips(clip, mk, side_pose, Z)
    rig.animation_data.action = None
    for pb in pbs: pb.rotation_quaternion = Quaternion(); pb.location = V((0, 0, 0))
    print('TRIS', tri_count(), 'ACTIONS', [a.name for a in bpy.data.actions])
    if out: export(out, anim=True)
    return Jp


if __name__ == '__main__':
    out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/home/claude/blender/out2'
    build(out + '/rider.glb')
    build(out + '/rider_lo.glb', lod=1)
