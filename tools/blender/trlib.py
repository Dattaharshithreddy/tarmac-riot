"""Shared Blender helpers for Tarmac Riot assets. Blender coords: X right, Y forward, Z up (exported to glTF Y-up, forward = -Z)."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()

_mats = {}
def mat(name, color, metal=0.0, rough=0.5, emit=None, emit_str=1.0, alpha=1.0, coat=0.0):
    if name in _mats: return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    c = tuple(color) + (1.0,) if len(color) == 3 else tuple(color)
    b.inputs['Base Color'].default_value = c
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if coat and 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = coat
    if emit:
        b.inputs['Emission Color'].default_value = tuple(emit) + (1.0,)
        b.inputs['Emission Strength'].default_value = emit_str
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    m.diffuse_color = c
    _mats[name] = m
    return m

def hexc(h):
    h = h.lstrip('#'); v = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in v)  # sRGB -> linear

def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj); return obj

def mesh_obj(name, bm, material, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); link(ob)
    me.materials.append(material)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    return ob

def box(name, size, loc, material, rot=(0, 0, 0), bevel=0.0, subsurf=0, smooth=True, segments=2):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    ob = mesh_obj(name, bm, material, smooth)
    ob.location = loc; ob.rotation_euler = Euler(rot)
    if bevel: m = ob.modifiers.new('bev', 'BEVEL'); m.width = bevel; m.segments = segments; m.limit_method = 'ANGLE'
    if subsurf: m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = subsurf; m.render_levels = subsurf
    return ob

def cyl(name, r, depth, loc, material, rot=(0, 0, 0), seg=24, r2=None, smooth=True, caps=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    ob = mesh_obj(name, bm, material, smooth)
    ob.location = loc; ob.rotation_euler = Euler(rot)
    # flat caps, smooth sides
    if smooth:
        for p in ob.data.polygons:
            if abs(p.normal.z) > 0.99: p.use_smooth = False
    return ob

def sphere(name, r, loc, material, scale=(1, 1, 1), seg=24, rings=14, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    for v in bm.verts: v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    ob = mesh_obj(name, bm, material); ob.location = loc; ob.rotation_euler = Euler(rot); return ob

def torus(name, R, r, loc, material, rot=(0, 0, 0), seg=40, mseg=12):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(mseg):
            b = 2 * math.pi * j / mseg
            x = (R + r * math.cos(b)) * math.cos(a); y = (R + r * math.cos(b)) * math.sin(a); z = r * math.sin(b)
            ring.append(bm.verts.new((x, y, z)))
        verts.append(ring)
    for i in range(seg):
        for j in range(mseg):
            a, b2 = verts[i][j], verts[(i + 1) % seg][j]; c, d = verts[(i + 1) % seg][(j + 1) % mseg], verts[i][(j + 1) % mseg]
            bm.faces.new((a, b2, c, d))
    ob = mesh_obj(name, bm, material); ob.location = loc; ob.rotation_euler = Euler(rot); return ob

def tube(name, pts, r, material, seg=12):
    """Swept tube through points (list of xyz)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (p[0], p[1], p[2], 1)
    cu.bevel_depth = r; cu.bevel_resolution = max(1, seg // 4); cu.use_fill_caps = True
    ob = bpy.data.objects.new(name, cu); link(ob); ob.data.materials.append(material)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    return ob

def loft(name, sections, material, subsurf=2, cap=True):
    """Body from cross-sections. sections: list of (y, [ (x,z), ... ] ) with equal point counts, loop closed."""
    bm = bmesh.new(); rings = []
    for y, pts in sections:
        rings.append([bm.verts.new((x, y, z)) for x, z in pts])
    n = len(rings[0])
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap:
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_obj(name, bm, material)
    if subsurf: m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = subsurf; m.render_levels = subsurf
    return ob

def ell(cx, cz, rx, rz, n=8, squash=1.0):
    """Ellipse-ish section points (x,z), starting at bottom going round. squash<1 flattens bottom."""
    pts = []
    for i in range(n):
        a = -math.pi / 2 + 2 * math.pi * i / n
        z = math.sin(a) * rz
        if z < 0: z *= squash
        pts.append((cx + math.cos(a) * rx, cz + z))
    return pts

def mirror_x(ob):
    m = ob.modifiers.new('mir', 'MIRROR'); m.use_axis[0] = True; m.use_clip = True; return ob

def apply_all(objs):
    for ob in objs:
        if ob.type == 'CURVE':
            bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
            bpy.ops.object.convert(target='MESH')
    for ob in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        for m in list(ob.modifiers):
            try: bpy.ops.object.modifier_apply(modifier=m.name)
            except Exception as e: print('modifier fail', ob.name, m.name, e)

def join_by_material(name_prefix, exclude=()):
    """Merge meshes sharing a material into one object each (fewer draw calls)."""
    groups = {}
    for ob in [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.parent and o.name not in exclude]:
        key = ob.data.materials[0].name if ob.data.materials else 'none'
        groups.setdefault(key, []).append(ob)
    out = []
    for key, obs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs: o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        if len(obs) > 1: bpy.ops.object.join()
        obs[0].name = name_prefix + '_' + key; out.append(obs[0])
    return out

def tri_count():
    t = 0
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            for p in ob.data.polygons: t += len(p.vertices) - 2
    return t

def export(path, anim=False):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              export_animations=anim, export_animation_mode='ACTIONS' if anim else 'ACTIVE_ACTIONS',
                              export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False)

def cyl_between(name, a, b, r, material, seg=16, r2=None):
    a, b = Vector(a), Vector(b); d = b - a
    ob = cyl(name, r, d.length, (a + b) / 2, material, seg=seg, r2=r2)
    ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return ob

def arc_strip(name, center_yz, R, a0, a1, width, thick, material, x=0.0, n=14):
    """Curved strip around the X axis (mudguards). Angles in degrees, 0 = +Y (forward), 90 = up."""
    bm = bmesh.new(); rows = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n); cy, cz = center_yz
        row = []
        for (dx, dr) in ((-width / 2, 0), (width / 2, 0), (width / 2, thick), (-width / 2, thick)):
            rr = R + dr
            row.append(bm.verts.new((x + dx, cy + math.cos(a) * rr, cz + math.sin(a) * rr)))
        rows.append(row)
    for p, q in zip(rows[:-1], rows[1:]):
        for k in range(4): bm.faces.new((p[k], p[(k + 1) % 4], q[(k + 1) % 4], q[k]))
    bm.faces.new(list(reversed(rows[0]))); bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, material)

def ell2(cx, cz, rx, top, bot, n=10, flat=0.0):
    """Egg section: different top/bottom heights. flat>0 flattens the sides (sportbike panels)."""
    pts = []
    for i in range(n):
        a = -math.pi / 2 + 2 * math.pi * i / n
        s, c = math.sin(a), math.cos(a)
        z = s * (top if s > 0 else bot)
        xx = c * rx
        if flat: xx = math.copysign(abs(c) ** (1 - flat), c) * rx
        pts.append((cx + xx, cz + z))
    return pts

def rbox(cx, cz, rx, top, bot, n=16, p=5.0):
    """Rounded-rectangle (superellipse) section points (x,z)."""
    pts = []
    for i in range(n):
        a = -math.pi / 2 + 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        x = math.copysign(abs(c) ** (2 / p), c) * rx
        z = math.copysign(abs(s) ** (2 / p), s) * (top if s > 0 else bot)
        pts.append((cx + x, cz + z))
    return pts

def tex_mat(name, path, rough=0.5, metal=0.0, emit=False):
    if name in _mats: return _mats[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit:
        nt.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 0.6
    _mats[name] = m; return m

def decal(name, w, h, loc, material, rot=(0, 0, 0)):
    """Flat textured quad in the XZ plane facing -Y by default (use rot to orient)."""
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(p) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = bm.faces.new(vs)
    for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): loop[uvl].uv = uv
    ob = mesh_obj(name, bm, material, smooth=False); ob.location = loc; ob.rotation_euler = Euler(rot); return ob

def textured_box(name, size, loc, mats6, rot=(0, 0, 0)):
    """Box whose 6 faces get their own material and full 0..1 UVs. mats6 order: +X, -X, +Y, -Y, +Z, -Z."""
    sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    faces = [
        ((sx, -sy, -sz), (sx, sy, -sz), (sx, sy, sz), (sx, -sy, sz)),
        ((-sx, sy, -sz), (-sx, -sy, -sz), (-sx, -sy, sz), (-sx, sy, sz)),
        ((sx, sy, -sz), (-sx, sy, -sz), (-sx, sy, sz), (sx, sy, sz)),
        ((-sx, -sy, -sz), (sx, -sy, -sz), (sx, -sy, sz), (-sx, -sy, sz)),
        ((-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)),
        ((-sx, sy, -sz), (sx, sy, -sz), (sx, -sy, -sz), (-sx, -sy, -sz)),
    ]
    me = bpy.data.meshes.new(name)
    for i, fv in enumerate(faces):
        f = bm.faces.new([bm.verts.new(p) for p in fv]); f.material_index = i
        for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): loop[uvl].uv = uv
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); link(ob)
    for m in mats6: me.materials.append(m)
    ob.location = loc; ob.rotation_euler = Euler(rot); return ob

def boolean_cut(target, cutters):
    for c in cutters:
        m = target.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = c; m.solver = 'EXACT'
        c.hide_render = True; c.display_type = 'WIRE'
    return cutters

def delete(objs):
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)

def split_multi_material_join(prefix):
    """join_by_material but objects with several materials stay on their own."""
    singles = [o for o in bpy.context.scene.objects if o.type == 'MESH' and len(o.data.materials) <= 1]
    groups = {}
    for ob in singles:
        key = ob.data.materials[0].name if ob.data.materials else 'none'
        groups.setdefault(key, []).append(ob)
    for key, obs in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs: o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        if len(obs) > 1: bpy.ops.object.join()
        obs[0].name = prefix + '_' + key


def join_group(name, objs, origin):
    """Join objects into one (multi-material) object whose origin is at `origin`."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    ob = objs[0]; ob.name = name
    # move origin to the axle
    off = Vector(origin) - ob.matrix_world.translation
    ob.data.transform(Matrix.Translation(-off) @ Matrix())
    ob.location = Vector(origin)
    return ob
