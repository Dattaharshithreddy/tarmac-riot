"""Roadside nature for Tarmac Riot, all in one GLB that shares a single leaf atlas and a bark atlas:
palm, coconut (tall palm), neem, acacia, bush, bushdry, grass, grassdry, poplar, rock0-2, snowrock0-1.
Foliage is alpha-cutout cards with normals bent away from the crown so it shades like a volume, not paper.
Blender coords: X right, Y forward, Z up, origin on the ground. usage: python runb.py nature.py OUT.glb"""
import sys, math, os, random
sys.path.insert(0, '/home/claude/blender')
import bpy, bmesh
import numpy as np
from mathutils import Vector as V, Matrix, Euler, noise
from PIL import Image, ImageDraw, ImageFilter

TEX = '/home/claude/blender/tex'; os.makedirs(TEX, exist_ok=True)
rng = random.Random(7)

# ------------------------------------------------------------------ textures
def paint_leaf_atlas(path):
    S = 1024
    im = Image.new('RGBA', (S, S), (60, 90, 40, 0))
    d = ImageDraw.Draw(im)
    R = random.Random(11)

    def jitter(c, a=18):
        return tuple(max(0, min(255, v + R.randint(-a, a))) for v in c)

    # A: palm frond, 0..512 x 0..256 (u = along the frond, v = across)
    x0, y0, w, h = 0, 0, 512, 256
    cy = y0 + h / 2
    for i in range(150):
        t = i / 150
        px = x0 + 12 + t * (w - 24)
        L = h * 0.47 * (math.sin(min(1, t * 1.15) * math.pi) * 0.85 + 0.15)
        for side in (-1, 1):
            ang = math.radians(50 + 18 * t) * side
            tip = (px + math.cos(ang) * L * 0.55 + 10, cy + math.sin(ang) * L)
            base_c = (82, 150, 52) if t < 0.85 else (140, 160, 70)
            c = jitter(base_c, 22)
            wid = 4.4 * (1 - 0.45 * t)
            nx, ny = -(tip[1] - cy), tip[0] - px; nl = math.hypot(nx, ny) or 1; nx, ny = nx / nl * wid, ny / nl * wid
            d.polygon([(px - nx, cy - ny), (px + nx, cy + ny), tip], fill=c + (255,))
            d.line([(px, cy), tip], fill=tuple(int(v * 0.8) for v in c) + (255,), width=1)
    d.line([(x0 + 8, cy), (x0 + w - 6, cy)], fill=(120, 110, 60, 255), width=5)

    def cluster(x0, y0, w, h, base, n, leaf_len, leaf_w, round_=False, seed=0):
        """Leaf clump with a ragged, lobed outline (no tell-tale disc edge), darker inside, lighter rim."""
        Rc = random.Random(seed)
        cx, cy = x0 + w / 2, y0 + h / 2
        lobes = [Rc.uniform(0, math.tau) for _ in range(3)]
        rmax = lambda a: w * 0.47 * (0.62 + 0.2 * math.sin(a * 3 + lobes[0]) + 0.12 * math.sin(a * 5 + lobes[1]) + 0.06 * math.sin(a * 9 + lobes[2]))
        # twigs first, so leaves cover them
        for i in range(9):
            a = Rc.random() * math.tau; r = rmax(a) * 0.8
            d.line([(cx, cy), (cx + math.cos(a) * r, cy + math.sin(a) * r)], fill=(72, 56, 36, 255), width=2)
        for i in range(n):
            a = Rc.random() * math.tau; f = Rc.random() ** 0.55
            r = rmax(a) * f
            px, py = cx + math.cos(a) * r, cy + math.sin(a) * r * (h / w)
            shade = 0.72 + 0.4 * f + Rc.uniform(-0.12, 0.12)
            if Rc.random() < 0.08: shade *= 1.25                       # sunlit highlights
            c = tuple(max(0, min(255, int(v * shade))) for v in base)
            la = a + Rc.uniform(-0.9, 0.9) if f > 0.7 else Rc.random() * math.tau   # rim leaves point outward
            L = leaf_len * Rc.uniform(0.7, 1.25); W = leaf_w * Rc.uniform(0.7, 1.2)
            if round_:
                d.ellipse([px - W, py - W * 0.8, px + W, py + W * 0.8], fill=c + (255,))
            else:
                dx, dy = math.cos(la) * L / 2, math.sin(la) * L / 2; nx, ny = -math.sin(la) * W / 2, math.cos(la) * W / 2
                d.polygon([(px - dx, py - dy), (px + nx, py + ny), (px + dx, py + dy), (px - nx, py - ny)], fill=c + (255,))
                d.line([(px - dx, py - dy), (px + dx, py + dy)], fill=tuple(int(v * 0.8) for v in c) + (255,), width=1)

    cluster(0, 256, 256, 256, (74, 138, 50), 1100, 20, 8, seed=1)          # C: neem
    cluster(256, 256, 256, 256, (118, 140, 62), 1700, 9, 5, seed=2)        # D: acacia (tiny leaflets)
    cluster(768, 256, 256, 256, (60, 118, 46), 900, 0, 8, round_=True, seed=3)   # F: bush
    cluster(0, 512, 256, 256, (150, 170, 66), 1000, 15, 9, seed=4)        # G: poplar
    cluster(256, 512, 256, 256, (165, 138, 78), 800, 0, 7, round_=True, seed=5)  # H: dry scrub

    def grass(x0, y0, w, h, cols, seed):
        Rg = random.Random(seed)
        for i in range(110):
            bx = x0 + w * (0.12 + 0.76 * Rg.random()); top = y0 + h * Rg.uniform(0.02, 0.45)
            lean = Rg.uniform(-0.35, 0.35) * w * 0.25; c = Rg.choice(cols)
            c = tuple(max(0, min(255, v + Rg.randint(-14, 14))) for v in c)
            bw = Rg.uniform(2.5, 5)
            d.polygon([(bx - bw, y0 + h), (bx + bw, y0 + h), (bx + lean, top)], fill=c + (255,))

    grass(512, 0, 512, 256, [(70, 120, 44), (90, 140, 52), (58, 104, 38)], 6)       # B: green grass
    grass(512, 256, 256, 256, [(170, 150, 90), (150, 128, 74), (190, 170, 110)], 7)  # E: dry grass
    # dilate colour into transparent pixels so mip-maps don't pull in black fringes
    a = np.asarray(im).copy(); rgb = Image.fromarray(a[:, :, :3]).filter(ImageFilter.MaxFilter(5))
    fill = np.asarray(rgb); mask = a[:, :, 3] == 0; a[:, :, :3][mask] = fill[mask]
    Image.fromarray(a).save(path)


def paint_bark_atlas(path):
    S = 512
    im = Image.new('RGB', (S, S), (100, 80, 60)); d = ImageDraw.Draw(im); R = random.Random(3)
    # left: palm trunk with rings (v repeats every 256 px)
    for y in range(0, S, 1):
        k = (math.sin(y / 256 * math.tau * 9) * 0.5 + 0.5) ** 3
        c = (int(122 - 40 * k), int(104 - 36 * k), int(80 - 28 * k))
        d.line([(0, y), (255, y)], fill=c)
    for i in range(2500):
        x, y = R.randint(0, 255), R.randint(0, S - 1); v = R.randint(-25, 25)
        d.point((x, y), fill=(122 + v, 104 + v, 80 + v))
    # right: rough tree bark, vertical fissures
    for x in range(256, S):
        for y in range(0, S, 2):
            n = noise.noise(V((x * 0.06, y * 0.012, 0.3))) * 0.5 + noise.noise(V((x * 0.25, y * 0.05, 1.7))) * 0.3
            c = int(78 + 50 * n)
            d.line([(x, y), (x, y + 1)], fill=(c, int(c * 0.85), int(c * 0.68)))
    im.save(path)


# ------------------------------------------------------------------ materials
def leaf_material():
    m = bpy.data.materials.new('Leaves'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(TEX + '/leaves.png')
    nt.links.new(t.outputs['Color'], b.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 0.75
    try: m.surface_render_method = 'DITHERED'
    except Exception: pass
    m.blend_method = 'CLIP' if hasattr(m, 'blend_method') else None
    m.use_backface_culling = False
    return m


def bark_material():
    m = bpy.data.materials.new('Bark'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(TEX + '/bark.png')
    nt.links.new(t.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.9
    m.use_backface_culling = True
    return m


def rock_material(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
    nt.links.new(a.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.88
    m.use_backface_culling = True
    return m


# atlas regions in UV space (u0, v0, u1, v1), Blender UV origin bottom-left
def reg(px0, py0, px1, py1, S=1024):
    return (px0 / S, 1 - py1 / S, px1 / S, 1 - py0 / S)

R_FROND = reg(0, 0, 512, 256); R_GRASS = reg(512, 0, 1024, 256); R_NEEM = reg(0, 256, 256, 512); R_ACACIA = reg(256, 256, 512, 512)
R_DRYGRASS = reg(512, 256, 768, 512); R_BUSH = reg(768, 256, 1024, 512); R_POPLAR = reg(0, 512, 256, 768); R_SCRUB = reg(256, 512, 512, 768)


# ------------------------------------------------------------------ geometry builders
class Builder:
    """Accumulates verts / faces / uvs / custom normals for one object, then makes the mesh."""
    def __init__(self):
        self.v, self.f, self.uv, self.n = [], [], [], []

    def quad_grid(self, pts, uvs, nrm):
        """pts: rows x cols of Vectors; uvs same shape of (u, v); nrm same shape of normal Vectors"""
        rows, cols = len(pts), len(pts[0]); base = len(self.v)
        for r in range(rows):
            for c in range(cols):
                self.v.append(pts[r][c]); self.uv.append(uvs[r][c]); self.n.append(nrm[r][c].normalized())
        for r in range(rows - 1):
            for c in range(cols - 1):
                a = base + r * cols + c
                self.f.append((a, a + 1, a + cols + 1, a + cols))

    def card(self, center, size, rot, region, ncenter, nbias=V((0, 0, 0.4)), up_frac=0.0):
        w, h = size
        m = Euler(rot).to_matrix()
        corners = [V((-w / 2, 0, -h / 2)), V((w / 2, 0, -h / 2)), V((w / 2, 0, h / 2)), V((-w / 2, 0, h / 2))]
        P = [center + m @ c for c in corners]
        u0, v0, u1, v1 = region
        U = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        N = [((p - ncenter).normalized() + nbias).normalized() for p in P]
        if up_frac: N = [n.lerp(V((0, 0, 1)), up_frac).normalized() for n in N]
        self.quad_grid([[P[0], P[1]], [P[3], P[2]]], [[U[0], U[1]], [U[3], U[2]]], [[N[0], N[1]], [N[3], N[2]]])

    def build(self, name, material, smooth=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p) for p in self.v], [], self.f)
        uvl = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            poly.use_smooth = smooth
            for li in poly.loop_indices:
                uvl.data[li].uv = self.uv[me.loops[li].vertex_index]
        me.normals_split_custom_set_from_vertices([tuple(n) for n in self.n])
        me.materials.append(material)
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        return ob


def tube(B, path_pts, radii, sides, v_scale, u_region=(0.0, 0.0, 0.5, 1.0)):
    """Bark tube along a polyline. UV: u around (within u_region), v along length * v_scale."""
    rows = []; uvs = []; nrms = []; dist = 0.0
    for i, p in enumerate(path_pts):
        t = (path_pts[min(i + 1, len(path_pts) - 1)] - path_pts[max(i - 1, 0)]).normalized()
        a = t.cross(V((0, 0, 1)) if abs(t.z) < 0.95 else V((1, 0, 0))).normalized(); b = t.cross(a).normalized()
        if i: dist += (p - path_pts[i - 1]).length
        row, ur, nr = [], [], []
        for k in range(sides + 1):
            ang = k / sides * math.tau; n = a * math.cos(ang) + b * math.sin(ang)
            row.append(p + n * radii[i]); nr.append(n)
            ur.append((u_region[0] + (u_region[2] - u_region[0]) * k / sides, dist * v_scale))
        rows.append(row); uvs.append(ur); nrms.append(nr)
    B.quad_grid(rows, uvs, nrms)


def frond(B, base, yaw, pitch, length, width, droop, region, crown):
    """Curved, slightly V-folded palm frond strip."""
    segs, cols = 7, 3
    rows, uvs, nrms = [], [], []
    d = V((math.cos(yaw), math.sin(yaw), 0)); side = V((-d.y, d.x, 0))
    for i in range(segs + 1):
        t = i / segs
        s = t * length
        along = d * (s * math.cos(pitch)) + V((0, 0, s * math.sin(pitch) - droop * t * t * length))
        wdt = width * (math.sin(min(1.0, t * 1.15) * math.pi) * 0.85 + 0.15) * 0.5
        row, ur, nr = [], [], []
        for c in range(cols):
            k = c / (cols - 1) * 2 - 1
            p = base + along + side * (k * wdt) + V((0, 0, -abs(k) * wdt * 0.25))
            row.append(p)
            u0, v0, u1, v1 = region
            ur.append((u0 + (u1 - u0) * t, v0 + (v1 - v0) * (c / (cols - 1))))
            nr.append(((p - crown).normalized() + V((0, 0, 0.8))).normalized())
        rows.append(row); uvs.append(ur); nrms.append(nr)
    B.quad_grid(rows, uvs, nrms)


def palm(name, height, lean, n_fronds, seed, LEAF, BARK):
    R = random.Random(seed)
    Bt = Builder(); Bl = Builder()
    pts, rad = [], []
    for i in range(13):
        t = i / 12
        pts.append(V((lean * t * t * height, 0, t * height))); rad.append(0.2 * (1 - 0.32 * t) + (0.06 if i == 0 else 0))
    tube(Bt, pts, rad, 8, 1 / 2.0, (0.0, 0.0, 0.5, 1.0))
    top = pts[-1]
    for k in range(n_fronds):
        yaw = k / n_fronds * math.tau + R.uniform(-0.2, 0.2)
        pitch = R.uniform(0.15, 0.55) if k % 3 else R.uniform(-0.25, 0.05)
        frond(Bl, top + V((0, 0, 0.1)), yaw, pitch, R.uniform(3.6, 4.6), R.uniform(1.5, 1.9), R.uniform(0.35, 0.6), R_FROND, top - V((0, 0, 0.8)))
    # coconut bunch
    ob_t = Bt.build(name + '_trunk', BARK); ob_l = Bl.build(name + '_leaves', LEAF)
    nuts = []
    for k in range(5):
        a = k / 5 * math.tau
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, segments=8, ring_count=6, location=tuple(top + V((math.cos(a) * 0.25, math.sin(a) * 0.25, -0.35))))
        nut = bpy.context.object; nut.data.materials.append(BARK)
        bm = bmesh.new(); bm.from_mesh(nut.data); uvl = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for l in f.loops: l[uvl].uv = (0.25, 0.3)
        bm.to_mesh(nut.data); bm.free(); nuts.append(nut)
    return join([ob_t] + nuts, name + '_trunk'), ob_l


def canopy(B, center, radii, n, card, region, seed, flat=False):
    R = random.Random(seed)
    for i in range(n):
        while True:
            p = V((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-1, 1)))
            if p.length <= 1: break
        p = V((p.x * radii[0], p.y * radii[1], p.z * radii[2] * (0.55 if flat else 1)))
        pos = center + p
        s = card * R.uniform(0.75, 1.25)
        rot = (R.uniform(-0.6, 0.6) + (math.pi / 2 if flat and R.random() < 0.6 else 0), R.uniform(-0.4, 0.4), R.uniform(0, math.tau))
        B.card(pos, (s, s), rot, region, center, V((0, 0, 0.35)))


def broadleaf(name, kind, seed, LEAF, BARK):
    R = random.Random(seed)
    Bt = Builder(); Bl = Builder()
    if kind == 'acacia':
        h = 3.2 + R.random() * 0.8; crown = V((0, 0, h + 0.6)); radii = (3.4, 3.4, 1.1); region = R_ACACIA; n = 70; card = 1.7
    elif kind == 'poplar':
        h = 2.0; crown = V((0, 0, 6.5)); radii = (1.2, 1.2, 4.6); region = R_POPLAR; n = 64; card = 1.3
    else:
        h = 3.0 + R.random(); crown = V((0, 0, h + 1.9)); radii = (2.9, 2.9, 2.2); region = R_NEEM; n = 90; card = 1.55
    trunk = [V((0.06 * math.sin(i), 0.05 * math.cos(i * 1.3), h * i / 6)) for i in range(7)]
    tube(Bt, trunk, [0.3 * (1 - 0.35 * i / 6) for i in range(7)], 8, 1 / 2.5, (0.5, 0.0, 1.0, 1.0))
    nb = 0 if kind == 'poplar' else 4
    for b in range(nb):
        a = b / nb * math.tau + R.uniform(-0.4, 0.4)
        tip = crown + V((math.cos(a) * radii[0] * 0.7, math.sin(a) * radii[1] * 0.7, R.uniform(-0.4, 0.6) * radii[2] * 0.6))
        start = trunk[-1] - V((0, 0, 0.3))
        mid = start.lerp(tip, 0.5) + V((0, 0, 0.3))
        tube(Bt, [start, mid, tip], [0.16, 0.1, 0.04], 6, 1 / 2.5, (0.5, 0.0, 1.0, 1.0))
    if kind == 'poplar':
        tube(Bt, [trunk[-1], crown + V((0, 0, radii[2] * 0.8))], [0.18, 0.04], 6, 1 / 2.5, (0.5, 0.0, 1.0, 1.0))
    canopy(Bl, crown, radii, n, card, region, seed + 1, flat=(kind == 'acacia'))
    return Bt.build(name + '_trunk', BARK), Bl.build(name + '_leaves', LEAF)


def bush(name, region, seed, LEAF, r=1.0):
    B = Builder()
    canopy(B, V((0, 0, r * 0.7)), (r * 1.2, r * 1.2, r * 0.75), 24, r * 1.1, region, seed)
    return B.build(name + '_leaves', LEAF)


def grass(name, region, seed, LEAF):
    R = random.Random(seed); B = Builder()
    for k in range(3):
        a = k / 3 * math.pi + R.uniform(-0.2, 0.2); w, h = 1.1, 0.55
        B.card(V((0, 0, h / 2)), (w, h), (0, 0, a), region, V((0, 0, -3)), V((0, 0, 1.0)), up_frac=0.6)
    return B.build(name + '_leaves', LEAF)


def rock(name, seed, snow, MAT):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0)
    ob = bpy.context.object; ob.name = name; me = ob.data; me.name = name
    R = random.Random(seed); off = V((R.uniform(0, 100), R.uniform(0, 100), R.uniform(0, 100)))
    sx, sy, sz = R.uniform(1.0, 1.6), R.uniform(0.8, 1.3), R.uniform(0.55, 0.9)
    for v in me.vertices:
        p = v.co.copy()
        n1 = noise.noise(p * 1.3 + off); n2 = noise.noise(p * 3.1 + off * 2)
        k = 1 + 0.32 * n1 + 0.1 * n2
        # facets: snap to a few planes for a fractured look
        v.co = V((p.x * sx * k, p.y * sy * k, max(-0.15, p.z * sz * k)))
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    col = bm.loops.layers.color.new('Col')
    for f in bm.faces:
        f.smooth = False
        for l in f.loops:
            p = l.vert.co; n = f.normal
            g = 0.42 + 0.12 * noise.noise(p * 4 + off) + 0.06 * noise.noise(p * 15)
            g *= 0.75 + 0.25 * max(0, n.z)                        # crevices darker
            base = (g * 1.02, g * 0.97, g * 0.9)
            if snow and n.z > 0.45 and p.z > 0.0:
                s = min(1.0, (n.z - 0.45) * 3.0); base = tuple(b + (0.92 - b) * s for b in base)
            l[col] = (base[0], base[1], base[2], 1.0)
    bm.to_mesh(me); bm.free()
    for a in [a for a in me.color_attributes if a.name != 'Col']: me.color_attributes.remove(a)
    me.color_attributes.active_color = me.color_attributes['Col']
    me.materials.append(MAT)
    ob.location = (0, 0, sz * 0.75)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def group(name, objs):
    root = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(root)
    for o in objs: o.parent = root
    return root


def build(out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    paint_leaf_atlas(TEX + '/leaves.png'); paint_bark_atlas(TEX + '/bark.png')
    LEAF, BARK = leaf_material(), bark_material()
    ROCK = rock_material('Rock')
    roots = []
    x = 0.0

    def put(root):
        nonlocal x
        root.location.x = x; x += 12.0; roots.append(root)

    put(group('palm', list(palm('palm', 7.5, 0.12, 14, 1, LEAF, BARK))))
    put(group('coconut', list(palm('coconut', 10.0, 0.22, 13, 2, LEAF, BARK))))
    put(group('neem', list(broadleaf('neem', 'neem', 3, LEAF, BARK))))
    put(group('acacia', list(broadleaf('acacia', 'acacia', 4, LEAF, BARK))))
    put(group('poplar', list(broadleaf('poplar', 'poplar', 5, LEAF, BARK))))
    put(group('bush', [bush('bush', R_BUSH, 6, LEAF)]))
    put(group('bushdry', [bush('bushdry', R_SCRUB, 7, LEAF, 0.8)]))
    put(group('grass', [grass('grass', R_GRASS, 8, LEAF)]))
    put(group('grassdry', [grass('grassdry', R_DRYGRASS, 9, LEAF)]))
    for i in range(3): put(group('rock%d' % i, [rock('rock%d_m' % i, 20 + i, False, ROCK)]))
    for i in range(2): put(group('snowrock%d' % i, [rock('snowrock%d_m' % i, 30 + i, True, ROCK)]))
    t = 0
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            t += sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print('nature TRIS', t)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_normals=True,
                              export_materials='EXPORT', **({'export_vertex_color': 'NAME', 'export_vertex_color_name': 'Col', 'export_all_vertex_colors': False} if bpy.app.version >= (4, 2, 0) else {}),
                              export_cameras=False, export_lights=False, export_animations=False)
    print('nature', out)


if __name__ == '__main__':
    build(sys.argv[sys.argv.index('--') + 1])
