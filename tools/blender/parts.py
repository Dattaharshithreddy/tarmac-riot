"""Palette/texture atlas so many small vehicle parts share ONE material (one draw call in the game).
Top half of the atlas: solid colour cells (base colour + metallic/roughness).  Bottom half: painted regions
(chain links, radiator grille, dash screen...)."""
import bpy, bmesh, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from mathutils import Vector

FONT_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_BO = '/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf'
FONT_C = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'


def srgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Atlas:
    def __init__(self, name, size=1024, cell=32):
        self.name, self.size, self.cell = name, size, cell
        self.base = Image.new('RGB', (size, size), (128, 128, 128))
        self.mr = Image.new('RGB', (size, size), (0, 128, 0))   # R unused, G roughness, B metallic
        self.cells, self.n = {}, 0
        self.regions = {}
        self.cols = size // cell

    def add(self, key, hex_, metal=0.0, rough=0.5):
        i = self.n; self.n += 1
        cx, cy = (i % self.cols) * self.cell, (i // self.cols) * self.cell
        assert cy + self.cell <= self.size // 2, 'palette full'
        ImageDraw.Draw(self.base).rectangle([cx, cy, cx + self.cell - 1, cy + self.cell - 1], fill=srgb(hex_))
        ImageDraw.Draw(self.mr).rectangle([cx, cy, cx + self.cell - 1, cy + self.cell - 1], fill=(0, int(rough * 255), int(metal * 255)))
        self.cells[key] = ((cx + self.cell / 2) / self.size, 1 - (cy + self.cell / 2) / self.size)
        return key

    def region(self, key, x0, y0, x1, y1, painter, metal=0.0, rough=0.5):
        """Painted rectangle in pixel coords (y down). painter(draw_base_image, (w, h)) -> PIL RGB image of that size."""
        w, h = x1 - x0, y1 - y0
        im = painter((w, h)); self.base.paste(im, (x0, y0))
        ImageDraw.Draw(self.mr).rectangle([x0, y0, x1 - 1, y1 - 1], fill=(0, int(rough * 255), int(metal * 255)))
        self.regions[key] = (x0 / self.size, 1 - y1 / self.size, x1 / self.size, 1 - y0 / self.size)  # u0, v0, u1, v1

    def save(self, folder):
        self.bpath, self.mpath = '%s/%s_base.png' % (folder, self.name), '%s/%s_mr.png' % (folder, self.name)
        self.base.save(self.bpath); self.mr.save(self.mpath)

    def material(self, mat_name, emissive=False, emit_str=1.0):
        m = bpy.data.materials.new(mat_name); m.use_nodes = True
        nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
        tb = nt.nodes.new('ShaderNodeTexImage'); tb.image = bpy.data.images.load(self.bpath)
        nt.links.new(tb.outputs['Color'], b.inputs['Base Color'])
        tm = nt.nodes.new('ShaderNodeTexImage'); tm.image = bpy.data.images.load(self.mpath); tm.image.colorspace_settings.name = 'Non-Color'
        sp = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(tm.outputs['Color'], sp.inputs['Color'])
        nt.links.new(sp.outputs['Green'], b.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], b.inputs['Metallic'])
        if emissive:
            nt.links.new(tb.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = emit_str
        return m


def uv_const(ob, uv):
    me = ob.data
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    d = me.uv_layers[0].data
    for i in range(len(d)): d[i].uv = uv


def uv_map(ob, rect, fn):
    """fn(world_co, normal) -> (s, t) in 0..1, mapped into rect (u0, v0, u1, v1)."""
    me = ob.data
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    bpy.context.view_layer.update()
    d = me.uv_layers[0].data; mw = ob.matrix_world
    u0, v0, u1, v1 = rect
    for p in me.polygons:
        nrm = (mw.to_3x3() @ p.normal).normalized()
        for li, vi in zip(p.loop_indices, p.vertices):
            s, t = fn(mw @ me.vertices[vi].co, nrm)
            d[li].uv = (u0 + (u1 - u0) * min(1, max(0, s)), v0 + (v1 - v0) * min(1, max(0, t)))


def lathe(name, profile, seg, material, uv=None, axis_x=True, closed=False):
    """Revolve a profile [(x_axial, r), ...] around the X axis. uv=(u_repeats) adds u = angle, v = profile length."""
    bm = bmesh.new(); rings = []
    uvl = bm.loops.layers.uv.new('UVMap')
    L = [0.0]
    for a, b in zip(profile[:-1], profile[1:]): L.append(L[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    for i in range(seg):
        th = 2 * math.pi * i / seg
        rings.append([bm.verts.new((x, math.cos(th) * r, math.sin(th) * r)) for x, r in profile])
    n = len(profile)
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for k in range(n - 1 + (1 if closed else 0)):
            k2 = (k + 1) % n
            f = bm.faces.new((a[k], a[k2], b[k2], b[k]))
            if uv:
                for loop, (ii, kk) in zip(f.loops, ((i, k), (i, k2), (i + 1, k2), (i + 1, k))):
                    loop[uvl].uv = (ii / seg * uv, L[kk] / L[-1] if kk < len(L) else 1.0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(material)
    for p in me.polygons: p.use_smooth = True
    return ob


def sweep(name, path, section, material, closed_path=False, uv_rect=None, uv_len=None):
    """Sweep a 2D section [(x, y)] (x = binormal/side, y = normal) along a 3D path. Returns object.
    uv: u along the path (scaled by uv_len metres per full rect width), v around the section."""
    P = [Vector(p) for p in path]
    n = len(P)
    T = []
    for i in range(n):
        if closed_path: t = (P[(i + 1) % n] - P[i - 1])
        else: t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)])
        T.append(t.normalized())
    # parallel-transport frames
    ref = Vector((1, 0, 0)) if abs(T[0].x) < 0.9 else Vector((0, 0, 1))
    N = [(ref - T[0] * ref.dot(T[0])).normalized()]
    for i in range(1, n):
        v = N[-1] - T[i] * N[-1].dot(T[i]); N.append(v.normalized())
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); rings = []
    dist = [0.0]
    for i in range(1, n): dist.append(dist[-1] + (P[i] - P[i - 1]).length)
    for i in range(n):
        B = T[i].cross(N[i])
        rings.append([bm.verts.new(P[i] + B * sx + N[i] * sy) for sx, sy in section])
    m = len(section)
    for i in range(n - 1 + (1 if closed_path else 0)):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(m):
            k2 = (k + 1) % m
            f = bm.faces.new((a[k], a[k2], b[k2], b[k]))
            if uv_rect:
                u0, v0, u1, v1 = uv_rect
                d0 = dist[i] / uv_len; d1 = (dist[i] + (P[(i + 1) % n] - P[i]).length) / uv_len
                for loop, (dd, kk) in zip(f.loops, ((d0, k), (d0, k + 1), (d1, k + 1), (d1, k))):
                    loop[uvl].uv = (u0 + (u1 - u0) * (dd % 1.0 if False else min(dd, 1.0)), v0 + (v1 - v0) * kk / m)
    if not closed_path:
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(material)
    for p in me.polygons: p.use_smooth = True
    return ob


def circle_section(r, n=10, sx=1.0, sy=1.0):
    return [(math.cos(2 * math.pi * i / n) * r * sx, math.sin(2 * math.pi * i / n) * r * sy) for i in range(n)]


def rect_section(w, h, r=0.0, n_corner=2):
    """Rounded rectangle section, w along x, h along y."""
    pts = []
    hw, hh = w / 2 - r, h / 2 - r
    for cx, cy, a0 in ((hw, hh, 0), (-hw, hh, 90), (-hw, -hh, 180), (hw, -hh, 270)):
        for k in range(n_corner + 1):
            a = math.radians(a0 + 90 * k / max(1, n_corner) + (45 if n_corner == 0 else 0))
            if n_corner == 0: pts.append((cx + math.copysign(r, math.cos(a)) * 0, cy)); break
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def extrude_poly(name, pts2d, depth, material, axis='X', center=(0, 0, 0)):
    """Flat polygon (in the plane perpendicular to axis) extruded by depth. pts2d in (a, b) plane coords."""
    bm = bmesh.new()
    def P(a, b, c):
        if axis == 'X': return (c, a, b)
        if axis == 'Y': return (a, c, b)
        return (a, b, c)
    top = [bm.verts.new(P(a, b, depth / 2)) for a, b in pts2d]
    bot = [bm.verts.new(P(a, b, -depth / 2)) for a, b in pts2d]
    n = len(pts2d)
    bm.faces.new(top); bm.faces.new(list(reversed(bot)))
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(material); ob.location = center
    return ob


def tex_mr_material(name, base_path, mr_path, coat=0.0):
    """Base colour + packed (R = rider-colour mask, G = roughness, B = metallic) texture."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    tb = nt.nodes.new('ShaderNodeTexImage'); tb.image = bpy.data.images.load(base_path)
    nt.links.new(tb.outputs['Color'], b.inputs['Base Color'])
    tm = nt.nodes.new('ShaderNodeTexImage'); tm.image = bpy.data.images.load(mr_path); tm.image.colorspace_settings.name = 'Non-Color'
    sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(tm.outputs['Color'], sp.inputs['Color'])
    nt.links.new(sp.outputs['Green'], b.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], b.inputs['Metallic'])
    if coat and 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = coat
    return m
