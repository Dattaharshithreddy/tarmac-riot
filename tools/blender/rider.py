import sys, math; sys.path.insert(0, '/home/claude/blender')
from trlib import *
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion

V = Vector
# riding pose joints (Blender: X right, Y forward, Z up). Bike seat top ~0.935, grips ~(.27,.42,.93), pegs ~(.17,-.24,.44)
J = {
    'root': V((0, -0.25, 0.94)), 'pelvis': V((0, -0.24, 1.02)), 'waist': V((0, -0.13, 1.17)), 'chest': V((0, -0.02, 1.30)),
    'neck': V((0, 0.07, 1.40)), 'head': V((0, 0.11, 1.46)), 'headtop': V((0, 0.17, 1.63)),
}
for s, n in ((1, 'R'), (-1, 'L')):
    J['shoulder.' + n] = V((s * 0.19, 0.0, 1.32)); J['elbow.' + n] = V((s * 0.28, 0.18, 1.15))
    J['wrist.' + n] = V((s * 0.275, 0.39, 0.985)); J['handtip.' + n] = V((s * 0.28, 0.47, 0.955))
    J['hip.' + n] = V((s * 0.10, -0.22, 0.99)); J['knee.' + n] = V((s * 0.21, 0.14, 0.87))
    J['ankle.' + n] = V((s * 0.17, -0.17, 0.52)); J['toe.' + n] = V((s * 0.17, -0.04, 0.46))

# bones: name -> (head joint, tail joint, parent)
B = {'hips': ('root', 'pelvis', None), 'spine': ('pelvis', 'waist', 'hips'), 'chest': ('waist', 'chest', 'spine'),
     'neck': ('chest', 'neck', 'chest'), 'head': ('neck', 'headtop', 'neck')}
for n in ('L', 'R'):
    B['shoulder.' + n] = ('chest', 'shoulder.' + n, 'chest'); B['upperarm.' + n] = ('shoulder.' + n, 'elbow.' + n, 'shoulder.' + n)
    B['forearm.' + n] = ('elbow.' + n, 'wrist.' + n, 'upperarm.' + n); B['hand.' + n] = ('wrist.' + n, 'handtip.' + n, 'forearm.' + n)
    B['thigh.' + n] = ('hip.' + n, 'knee.' + n, 'hips'); B['shin.' + n] = ('knee.' + n, 'ankle.' + n, 'thigh.' + n)
    B['foot.' + n] = ('ankle.' + n, 'toe.' + n, 'shin.' + n)
ORDER = ['hips', 'spine', 'chest', 'neck', 'head'] + [p + s for s in ('.L', '.R') for p in ('shoulder', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot')]

def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab * t)).length

def build(out, lod=0):
    reset()
    bpy.context.scene.render.fps = 30
    JACKET = mat('Jacket', hexc('#ff6a00'), rough=0.42, metal=0.05, coat=0.4)
    TRIM = mat('JacketTrim', hexc('#f2f2f2'), rough=0.45)
    PANTS = mat('Pants', hexc('#1c1e24'), rough=0.6)
    GLOVES = mat('Gloves', hexc('#16171b'), rough=0.55)
    BOOTS = mat('Boots', hexc('#0e0f12'), rough=0.4, metal=0.1)
    HELMET = mat('Helmet', hexc('#ffd400'), rough=0.18, metal=0.1, coat=1.0)
    VISOR = mat('Visor', hexc('#0b1118'), rough=0.04, metal=0.6)
    ARMOR = mat('Armor', hexc('#2b2e35'), rough=0.35, metal=0.3)

    # ---- body from a skin-modifier skeleton ----
    names = ['pelvis', 'waist', 'chest', 'neck', 'head'] + [p + s for s in ('.L', '.R') for p in ('shoulder', 'elbow', 'wrist', 'handtip', 'hip', 'knee', 'ankle', 'toe')]
    idx = {n: i for i, n in enumerate(names)}
    edges = [('pelvis', 'waist'), ('waist', 'chest'), ('chest', 'neck'), ('neck', 'head')]
    for s in ('.L', '.R'):
        edges += [('chest', 'shoulder' + s), ('shoulder' + s, 'elbow' + s), ('elbow' + s, 'wrist' + s), ('wrist' + s, 'handtip' + s),
                  ('pelvis', 'hip' + s), ('hip' + s, 'knee' + s), ('knee' + s, 'ankle' + s), ('ankle' + s, 'toe' + s)]
    me = bpy.data.meshes.new('skel'); me.from_pydata([tuple(J[n]) for n in names], [(idx[a], idx[b]) for a, b in edges], [])
    body = bpy.data.objects.new('Body', me); link(body)
    sk = body.modifiers.new('skin', 'SKIN'); sk.branch_smoothing = 0.6; sk.use_smooth_shade = True
    R = {'pelvis': (0.215, 0.17), 'waist': (0.19, 0.15), 'chest': (0.245, 0.17), 'neck': (0.075, 0.075), 'head': (0.08, 0.08)}
    for s in ('.L', '.R'):
        R.update({'shoulder' + s: (0.095, 0.095), 'elbow' + s: (0.072, 0.072), 'wrist' + s: (0.056, 0.05), 'handtip' + s: (0.062, 0.045),
                  'hip' + s: (0.13, 0.13), 'knee' + s: (0.088, 0.088), 'ankle' + s: (0.068, 0.068), 'toe' + s: (0.06, 0.056)})
    sv = me.skin_vertices[0].data
    for n, i in idx.items():
        sv[i].radius = R[n]
    sv[idx['pelvis']].use_root = True
    sub = body.modifiers.new('sub', 'SUBSURF'); sub.levels = 2 if lod == 0 else 1
    bpy.context.view_layer.objects.active = body; body.select_set(True)
    for m in list(body.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    for p in body.data.polygons: p.use_smooth = True

    # materials by nearest bone region
    for m_ in (JACKET, TRIM, PANTS, GLOVES, BOOTS): body.data.materials.append(m_)
    region_mat = {'hips': 0, 'spine': 0, 'chest': 0, 'neck': 0, 'head': 0, 'shoulder': 0, 'upperarm': 0, 'forearm': 0, 'hand': 3, 'thigh': 2, 'shin': 2, 'foot': 4}
    vs = body.data.vertices
    def nearest_bone(p):
        best, bd = None, 9
        for bn, (h, t, _) in B.items():
            d = seg_dist(p, J[h], J[t])
            if d < bd: bd, best = d, bn
        return best
    back = V((0, -0.79, 0.62)).normalized()
    for poly in body.data.polygons:
        c = poly.center; bn = nearest_bone(c); base = bn.split('.')[0]
        mi = region_mat[base]
        if base in ('spine', 'chest') and abs(c.x) < 0.032 and poly.normal.dot(back) > 0.75: mi = 1   # spine stripe
        if base == 'upperarm' and poly.normal.z > 0.6 and abs(poly.normal.x) < 0.45: mi = 1  # arm stripe
        if base == 'shin' and (c - J['ankle.' + bn[-1]]).length < 0.16: mi = 4   # boot shaft
        if base == 'forearm' and (c - J['wrist.' + bn[-1]]).length < 0.07: mi = 3  # gauntlet
        poly.material_index = mi

    parts = [body]
    # ---- helmet, visor, spoiler ----
    hc = V((0, 0.15, 1.545))
    helm = sphere('helmet', 0.145, hc, HELMET, scale=(0.92, 1.1, 1.0), seg=28 if lod == 0 else 16, rings=18 if lod == 0 else 10); parts.append(helm)
    vis = sphere('visor', 0.147, hc, VISOR, scale=(0.93, 1.105, 1.005), seg=28 if lod == 0 else 16, rings=18 if lod == 0 else 10)
    bm = bmesh.new(); bm.from_mesh(vis.data)
    kill = [v for v in bm.verts if not (v.co.y > 0.06 and -0.055 < v.co.z < 0.05)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(vis.data); bm.free(); parts.append(vis)
    parts.append(box('spoiler', (0.13, 0.07, 0.035), hc + V((0, -0.15, 0.05)), HELMET, rot=(-0.4, 0, 0), bevel=0.015, segments=2))
    # aero hump, shoulder and knee armour, boots
    parts.append(sphere('hump', 0.12, V((0, -0.115, 1.40)), JACKET, scale=(0.85, 0.6, 0.75), rot=(0.65, 0, 0)))
    for s, n in ((1, 'R'), (-1, 'L')):
        parts.append(sphere('shpad.' + n, 0.085, J['shoulder.' + n] + V((s * 0.03, 0.0, 0.025)), TRIM, scale=(0.62, 0.95, 0.8)))
        parts.append(sphere('kneeslider.' + n, 0.06, J['knee.' + n] + V((s * 0.07, 0.03, -0.01)), ARMOR, scale=(0.45, 0.85, 0.75)))
        a, t = J['ankle.' + n], J['toe.' + n]
        boot = box('boot.' + n, (0.115, 0.27, 0.10), (a + t) / 2 + V((0, 0.01, -0.03)), BOOTS, bevel=0.035, segments=3)
        boot.rotation_mode = 'QUATERNION'; boot.rotation_quaternion = V((0, 1, 0)).rotation_difference((t - a).normalized()); parts.append(boot)
    apply_all(parts)

    # ---- armature ----
    arm_data = bpy.data.armatures.new('RiderRig'); arm = bpy.data.objects.new('Rider', arm_data); link(arm)
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for bn in ORDER:
        h, t, par = B[bn]; b = arm_data.edit_bones.new(bn); b.head = J[h]; b.tail = J[t]; b.roll = 0
        if par: b.parent = arm_data.edit_bones[par]; b.use_connect = False
        eb[bn] = b
    bpy.ops.object.mode_set(mode='OBJECT')

    # ---- weights: rigid parts by name, body by distance to bone segments ----
    rigid = {'helmet': 'head', 'visor': 'head', 'spoiler': 'head', 'helmstripe': 'head', 'hump': 'chest'}
    for ob in parts:
        for bn in ORDER: ob.vertex_groups.new(name=bn)
        key = ob.name.split('.')[0]
        side = ob.name.split('.')[-1] if '.' in ob.name else None
        fixed = rigid.get(key) or {'shpad': 'upperarm', 'kneeslider': 'shin', 'boot': 'foot'}.get(key)
        if fixed and side and fixed not in ('head', 'chest'): fixed = fixed + '.' + side
        mw = ob.matrix_world
        for v in ob.data.vertices:
            if fixed:
                ob.vertex_groups[fixed].add([v.index], 1.0, 'REPLACE'); continue
            p = mw @ v.co
            ds = sorted(((seg_dist(p, J[B[bn][0]], J[B[bn][1]]), bn) for bn in ORDER if bn != 'hips'), key=lambda x: x[0])[:3]
            # pelvis region belongs to hips, not to the spine
            if (p - J['pelvis']).length < 0.13 and p.z < 1.06: ds = [(0.0, 'hips')]
            ws = [(1.0 / max(d, 0.004) ** 4, bn) for d, bn in ds]
            tot = sum(w for w, _ in ws)
            for w, bn in ws:
                if w / tot > 0.02: ob.vertex_groups[bn].add([v.index], w / tot, 'REPLACE')
        mod = ob.modifiers.new('arm', 'ARMATURE'); mod.object = arm
        ob.parent = arm
    # join all rider meshes into one skinned mesh
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts: ob.select_set(True)
    bpy.context.view_layer.objects.active = body; bpy.ops.object.join(); body.name = 'RiderMesh'
    for p_ in body.data.polygons: p_.use_smooth = True

    # ---- animation clips ----
    arm.rotation_mode = 'XYZ'
    pbs = arm.pose.bones
    for pb in pbs: pb.rotation_mode = 'QUATERNION'
    rest_dir = {bn: (J[B[bn][1]] - J[B[bn][0]]).normalized() for bn in ORDER}

    def apply_pose(T, root_off=V((0, 0, 0))):
        for pb in pbs: pb.rotation_quaternion = Quaternion(); pb.location = V((0, 0, 0))
        pbs['hips'].location = arm_data.bones['hips'].matrix_local.inverted().to_3x3() @ root_off
        bpy.context.view_layer.update()
        for bn in ORDER:
            h, t, _ = B[bn]
            want = (T[t] - T[h])
            if want.length < 1e-6: continue
            pb = pbs[bn]
            bpy.context.view_layer.update()
            cur_head = pb.head.copy()
            # current direction after parents moved
            cur_dir = (pb.tail - pb.head).normalized()
            q = cur_dir.rotation_difference(want.normalized())
            m = pb.matrix.copy()
            new = Matrix.Translation(cur_head) @ (q.to_matrix() @ m.to_3x3()).to_4x4()
            pb.matrix = new
        bpy.context.view_layer.update()

    def key_all(f):
        for pb in pbs:
            pb.keyframe_insert('rotation_quaternion', frame=f)
        pbs['hips'].keyframe_insert('location', frame=f)

    def P(**mods):
        T = {k: v.copy() for k, v in J.items()}
        for k, v in mods.items(): T[k.replace('_', '.')] = V(v)
        return T

    def side_pose(s, fn):
        """fn(s) returns dict joint->pos for the right side; mirror for left."""
        d = fn()
        if s > 0: return d
        out = {}
        for k, v in d.items():
            k2 = k.replace('.R', '.X').replace('.L', '.R').replace('.X', '.L')
            out[k2] = V((-v[0], v[1], v[2]))
        return out

    def clip(name, frames, loop=False):
        act = bpy.data.actions.new(name); act.use_fake_user = True
        if not arm.animation_data: arm.animation_data_create()
        arm.animation_data.action = act
        for f, T, off in frames:
            apply_pose(T, off)
            key_all(f)
        # keep slots/channels clean
        return act

    Z = V((0, 0, 0))
    base = {k: v.copy() for k, v in J.items()}
    def mk(d):
        T = {k: v.copy() for k, v in base.items()}
        for k, v in d.items(): T[k] = V(v)
        return T
    define_clips(clip, mk, side_pose, Z)

    # leave the rig in rest pose with no active action
    arm.animation_data.action = None
    for pb in pbs: pb.rotation_quaternion = Quaternion(); pb.location = V((0, 0, 0))
    print('TRIS', tri_count(), 'ACTIONS', [a.name for a in bpy.data.actions])
    export(out, anim=True)

def define_clips(clip, mk, side_pose, Z):
    """Fight/ride clips as joint targets in this file's J coordinates (re-targeted by rider2.py)."""
    # Ride: subtle breathing / bump loop
    clip('Ride', [(0, mk({}), Z), (8, mk({'head': (0, 0.115, 1.455), 'headtop': (0.01, 0.18, 1.62)}), V((0, 0, -0.008))),
                  (16, mk({}), Z), (24, mk({'headtop': (-0.01, 0.175, 1.625)}), V((0, 0, -0.006))), (32, mk({}), Z)])
    for s, n in ((1, 'R'), (-1, 'L')):
        def punch_wind():
            return {'chest': (-0.03, -0.04, 1.31), 'elbow.R': (0.33, -0.08, 1.24), 'wrist.R': (0.30, 0.04, 1.32), 'handtip.R': (0.30, 0.10, 1.36)}
        def punch_hit():
            return {'chest': (0.05, 0.0, 1.30), 'shoulder.R': (0.24, 0.02, 1.33), 'elbow.R': (0.50, 0.08, 1.30), 'wrist.R': (0.76, 0.14, 1.28), 'handtip.R': (0.84, 0.16, 1.28),
                    'headtop': (0.03, 0.17, 1.62)}
        sp = lambda fn: mk(side_pose(s, fn))
        clip('Punch' + n, [(0, mk({}), Z), (4, sp(punch_wind), Z), (8, sp(punch_hit), Z), (11, sp(punch_hit), Z), (17, mk({}), Z)])
        def swing_up():
            return {'chest': (-0.04, -0.05, 1.32), 'elbow.R': (0.36, -0.10, 1.40), 'wrist.R': (0.34, -0.12, 1.62), 'handtip.R': (0.33, -0.14, 1.70)}
        def swing_hit():
            return {'chest': (0.06, 0.02, 1.29), 'shoulder.R': (0.25, 0.03, 1.32), 'elbow.R': (0.52, 0.16, 1.24), 'wrist.R': (0.74, 0.30, 1.12), 'handtip.R': (0.80, 0.36, 1.08)}
        clip('Swing' + n, [(0, mk({}), Z), (5, sp(swing_up), Z), (9, sp(swing_hit), Z), (13, sp(swing_hit), Z), (20, mk({}), Z)])
        def kick_out():
            return {'chest': (-0.05, -0.02, 1.30), 'knee.R': (0.42, -0.02, 0.86), 'ankle.R': (0.82, -0.02, 0.80), 'toe.R': (0.92, 0.02, 0.84),
                    'elbow.R': (0.30, 0.16, 1.18), 'headtop': (0.04, 0.16, 1.62)}
        clip('Kick' + n, [(0, mk({}), Z), (5, sp(kick_out), V((-s * 0.04, 0, 0.02))), (11, sp(kick_out), V((-s * 0.04, 0, 0.02))), (18, mk({}), Z)])
        def hit_pose():
            return {'chest': (-0.06, -0.10, 1.34), 'neck': (-0.07, -0.02, 1.45), 'headtop': (-0.10, 0.0, 1.66),
                    'elbow.R': (0.36, 0.10, 1.22), 'elbow.L': (-0.24, 0.12, 1.20)}
        clip('Hit' + n, [(0, mk({}), Z), (3, sp(hit_pose), V((-s * 0.05, -0.03, 0.03))), (8, sp(hit_pose), V((-s * 0.04, -0.02, 0.02))), (14, mk({}), Z)])
    # Fall: limbs fly out (the game tumbles the whole rider)
    fall = {'elbow.R': (0.45, 0.0, 1.45), 'wrist.R': (0.62, -0.05, 1.70), 'handtip.R': (0.66, -0.06, 1.78),
            'elbow.L': (-0.45, 0.05, 1.40), 'wrist.L': (-0.65, 0.0, 1.62), 'handtip.L': (-0.70, -0.02, 1.70),
            'knee.R': (0.35, 0.05, 0.75), 'ankle.R': (0.55, -0.20, 0.45), 'toe.R': (0.60, -0.12, 0.38),
            'knee.L': (-0.30, 0.20, 0.80), 'ankle.L': (-0.45, 0.10, 0.45), 'toe.L': (-0.48, 0.20, 0.40),
            'headtop': (0.05, 0.05, 1.65)}
    clip('Fall', [(0, mk({}), Z), (6, mk(fall), V((0, 0, 0.08))), (14, mk(fall), V((0, 0, 0.08)))])
    # Taunt: fist pump with the left arm, head turned
    taunt = {'elbow.L': (-0.36, 0.0, 1.45), 'wrist.L': (-0.34, -0.02, 1.70), 'handtip.L': (-0.34, -0.03, 1.78), 'headtop': (-0.06, 0.13, 1.63), 'chest': (-0.03, -0.03, 1.31)}
    taunt2 = dict(taunt); taunt2.update({'wrist.L': (-0.35, 0.0, 1.62), 'handtip.L': (-0.35, -0.01, 1.70)})
    clip('Taunt', [(0, mk({}), Z), (6, mk(taunt), Z), (12, mk(taunt2), Z), (18, mk(taunt), Z), (24, mk(taunt2), Z), (32, mk({}), Z)])


if __name__ == '__main__':
    build('/home/claude/blender/out/rider.glb')
    build('/home/claude/blender/out/rider_lo.glb', lod=1)
