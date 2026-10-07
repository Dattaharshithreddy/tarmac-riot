"""Smooth vehicle body shells from stations (Catmull-Rom along the length, shaped cross-sections).
Every point on the shell is addressable as (y, u, side) so windows, lamps and trim can be laid onto it exactly."""
import math
import bmesh, bpy
from mathutils import Vector
V = Vector


def cr(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


class Shell:
    KEYS = ('zb', 'w', 'belt', 'top', 'wtop')

    def __init__(self, stations, side_bulge=0.02):
        """stations: list of dicts with y, zb, w, belt, top, wtop (front first, y decreasing)."""
        self.st = sorted(stations, key=lambda s: -s['y'])
        self.bulge = side_bulge
        self.y0, self.y1 = self.st[0]['y'], self.st[-1]['y']

    def params(self, y):
        st = self.st
        y = min(self.y0, max(self.y1, y))
        for i in range(len(st) - 1):
            if st[i]['y'] >= y >= st[i + 1]['y']:
                a, b = st[max(0, i - 1)], st[i]
                c, d = st[i + 1], st[min(len(st) - 1, i + 2)]
                t = (st[i]['y'] - y) / max(1e-9, st[i]['y'] - st[i + 1]['y'])
                out = {}
                for k in self.KEYS:
                    # clamp overshoot so the shape stays monotone between stations
                    v = cr(a[k], b[k], c[k], d[k], t)
                    lo, hi = min(b[k], c[k]), max(b[k], c[k])
                    pad = (hi - lo) * 0.25
                    out[k] = min(hi + pad, max(lo - pad, v))
                return out
        return {k: st[-1][k] for k in self.KEYS}

    def ctrl(self, p):
        zb, w, belt, top, wtop = p['zb'], p['w'], p['belt'], p['top'], p['wtop']
        ch = max(0.02, top - belt)
        b = self.bulge
        return [V((0, zb)), V((w * 0.88, zb)), V((w - 0.01, zb + 0.09)), V((w + b * 0.5, zb + (belt - zb) * 0.45)), V((w, belt - 0.015)),
                V((w - 0.012, belt)),                               # shoulder crease
                V((w + (wtop - w) * 0.16, belt + ch * 0.10)),       # window base
                V((w + (wtop - w) * 0.88, belt + ch * 0.88)),       # roof rail
                V((wtop * 0.62, belt + ch * 0.995)), V((0, top))]

    # u: 0..1 around the right half (bottom centre -> top centre). Segments: 9 between 10 control points.
    NSEG = 9
    CREASE = (5,)

    def section_point(self, p, u):
        c = self.ctrl(p)
        f = min(self.NSEG - 1e-6, max(0.0, u * self.NSEG)); i = int(f); t = f - i
        # Catmull-Rom within the segment, but treat creases as hard corners
        p1, p2 = c[i], c[i + 1]
        p0 = c[i - 1] if i - 1 >= 0 and i not in self.CREASE else p1 * 2 - p2
        p3 = c[i + 2] if i + 2 < len(c) and (i + 1) not in self.CREASE else p2 * 2 - p1
        return cr(p0, p1, p2, p3, t)

    def point(self, y, u, side=1):
        q = self.section_point(self.params(y), u)
        return V((q.x * side, y, q.y))

    def normal(self, y, u, side=1, e=1e-3):
        a = self.point(y + e, u, side) - self.point(y - e, u, side)
        b = self.point(y, min(1, u + e), side) - self.point(y, max(0, u - e), side)
        n = a.cross(b).normalized() if side > 0 else b.cross(a).normalized()
        return n

    def mesh(self, name, material, ny=60, nu=18, cap=True):
        """Closed body mesh (both halves)."""
        bm = bmesh.new(); rows = []
        ys = [self.y0 + (self.y1 - self.y0) * i / (ny - 1) for i in range(ny)]
        us = [i / nu for i in range(nu + 1)]
        for y in ys:
            right = [self.point(y, u, 1) for u in us]
            left = [self.point(y, u, -1) for u in reversed(us[1:-1])]
            rows.append([bm.verts.new(p) for p in right + left])
        n = len(rows[0])
        for a, b in zip(rows[:-1], rows[1:]):
            for i in range(n):
                j = (i + 1) % n; bm.faces.new((a[i], a[j], b[j], b[i]))
        if cap:
            bm.faces.new(list(reversed(rows[0]))); bm.faces.new(rows[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        me.materials.append(material)
        for p in me.polygons: p.use_smooth = True
        return ob

    def patch(self, name, material, y0, y1, u0, u1, lift=0.004, ny=12, nu=6, side=1, uv=None, thick=0.0, ufn=None):
        """Surface patch lying on the shell (windows, lamps, trim). ufn(y)->(u0, u1) for shaped outlines."""
        bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); grid = []
        for j in range(ny + 1):
            y = y0 + (y1 - y0) * j / ny
            a0, a1 = ufn(y) if ufn else (u0, u1)
            row = []
            for i in range(nu + 1):
                u = a0 + (a1 - a0) * i / nu
                row.append(bm.verts.new(self.point(y, u, side) + self.normal(y, u, side) * lift))
            grid.append(row)
        for j in range(ny):
            for i in range(nu):
                f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]) if side > 0 else (grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]))
                if uv:
                    ru0, rv0, ru1, rv1 = uv
                    for loop in f.loops:
                        # find grid coords of this vertex
                        pass
        # UVs: s across (i / nu), t along (j / ny)
        if uv:
            ru0, rv0, ru1, rv1 = uv
            idx = {}
            for j in range(ny + 1):
                for i in range(nu + 1): idx[grid[j][i]] = (i / nu, j / ny)
            for f in bm.faces:
                for loop in f.loops:
                    s, t = idx[loop.vert]
                    if side < 0: s = 1 - s
                    loop[uvl].uv = (ru0 + (ru1 - ru0) * s, rv0 + (rv1 - rv0) * t)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        me.materials.append(material)
        for p in me.polygons: p.use_smooth = True
        # make the normals face outward (away from the body's centre line)
        c = sum((v.co for v in me.vertices), V((0, 0, 0))) / len(me.vertices)
        nn = self.normal((y0 + y1) / 2, (u0 + u1) / 2 if not ufn else sum(ufn((y0 + y1) / 2)) / 2, side)
        if sum(p.normal.dot(nn) for p in me.polygons) < 0:
            bm2 = bmesh.new(); bm2.from_mesh(me); bmesh.ops.reverse_faces(bm2, faces=bm2.faces); bm2.to_mesh(me); bm2.free()
        if thick:
            m = ob.modifiers.new('sol', 'SOLIDIFY'); m.thickness = thick; m.offset = -1
        return ob


def crease_loft(name, stations, material, subsurf=2, crease=0.85, shape=None):
    """Closed body from stations (y, zb, zt, wb, wm, wt) with creased shoulders (like the bike panels).
    shape: optional fractions (bottom corner z, mid z, shoulder z, top-edge z) of height."""
    fr = shape or (0.10, 0.48, 0.80, 0.97)
    bm_ = bmesh.new(); rows = []
    for y, zb, zt, wb, wm, wt in stations:
        h = zt - zb
        half = [(wb * 0.55, zb), (wb, zb + fr[0] * h), (wm, zb + fr[1] * h), (wt * 1.06, zb + fr[2] * h), (wt * 0.6, zb + fr[3] * h)]
        pts = [(0, zb)] + half + [(0, zt)] + [(-x, z) for x, z in reversed(half)]
        rows.append([bm_.verts.new((x, y, z)) for x, z in pts])
    n = len(rows[0])
    cl = bm_.edges.layers.float.new('crease_edge')
    for r0, r1 in zip(rows[:-1], rows[1:]):
        for i in range(n):
            j = (i + 1) % n; bm_.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm_.faces.new(list(reversed(rows[0]))); bm_.faces.new(rows[-1])
    bm_.edges.ensure_lookup_table()
    for r0, r1 in zip(rows[:-1], rows[1:]):
        for i in (2, 4, n - 2, n - 4):
            e = bm_.edges.get((r0[i], r1[i]))
            if e: e[cl] = crease
    bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)
    me = bpy.data.meshes.new(name); bm_.to_mesh(me); bm_.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(material)
    for p in me.polygons: p.use_smooth = True
    if subsurf:
        sm = ob.modifiers.new('sub', 'SUBSURF'); sm.levels = subsurf; sm.render_levels = subsurf
    return ob
