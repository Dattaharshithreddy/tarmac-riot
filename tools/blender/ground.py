"""Bake seamless ground textures (albedo + normal map) for Tarmac Riot in Blender.
Noise is sampled on a 4D torus (x, y each wrap), so the image tiles in both directions.
usage: python runb.py ground.py OUTDIR [grass,sand,scree] [SIZE]
writes OUTDIR/ground_<kind>.jpg and OUTDIR/ground_<kind>_n.jpg"""
import sys, math, os
import bpy
import numpy as np
from PIL import Image

args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]; KINDS = (args[1] if len(args) > 1 else 'grass,sand,scree').split(','); SIZE = int(args[2]) if len(args) > 2 else 512
TILE = 12.0     # metres covered by one tile; noise scales below are per metre


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 8
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'
    bpy.ops.mesh.primitive_plane_add(size=1); pl = bpy.context.object
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.0; cam.location = (0, 0, 5)
    return sc, pl


class G:
    """tiny node-graph helper"""
    def __init__(self, mat):
        self.nt = mat.node_tree; self.N = self.nt.nodes; self.L = self.nt.links
        for n in list(self.N): self.N.remove(n)
        self.out = self.N.new('ShaderNodeOutputMaterial'); self.em = self.N.new('ShaderNodeEmission')
        self.L.new(self.em.outputs[0], self.out.inputs[0])
        tc = self.N.new('ShaderNodeTexCoord'); sep = self.N.new('ShaderNodeSeparateXYZ'); self.L.new(tc.outputs['Object'], sep.inputs[0])
        # object coords run -0.5..0.5 across the plane; map to angles for the torus
        self.ax = self.m('MULTIPLY', self.m('ADD', sep.outputs['X'], 0.5), 2 * math.pi)
        self.ay = self.m('MULTIPLY', self.m('ADD', sep.outputs['Y'], 0.5), 2 * math.pi)
        self.xm = self.m('MULTIPLY', self.m('ADD', sep.outputs['X'], 0.5), TILE)
        self.ym = self.m('MULTIPLY', self.m('ADD', sep.outputs['Y'], 0.5), TILE)

    def m(self, op, a, b=None):
        n = self.N.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: self.L.new(v, n.inputs[i])
        return n.outputs[0]

    def torus(self, scale):
        """4D point on a torus whose circumference equals TILE*scale noise units in x and y"""
        R = TILE * scale / (2 * math.pi)
        c = self.N.new('ShaderNodeCombineXYZ')
        self.L.new(self.m('MULTIPLY', self.m('COSINE', self.ax), R), c.inputs[0])
        self.L.new(self.m('MULTIPLY', self.m('SINE', self.ax), R), c.inputs[1])
        self.L.new(self.m('MULTIPLY', self.m('COSINE', self.ay), R), c.inputs[2])
        w = self.m('MULTIPLY', self.m('SINE', self.ay), R)
        return c.outputs[0], w

    def noise(self, scale, detail=4.0, rough=0.5, out='Fac', distortion=0.0):
        n = self.N.new('ShaderNodeTexNoise'); n.noise_dimensions = '4D'
        v, w = self.torus(scale); self.L.new(v, n.inputs['Vector']); self.L.new(w, n.inputs['W'])
        n.inputs['Scale'].default_value = 1.0; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        if 'Distortion' in n.inputs: n.inputs['Distortion'].default_value = distortion
        return n.outputs[out]

    def voronoi(self, scale, out='Distance', feature='F1', rand=1.0):
        n = self.N.new('ShaderNodeTexVoronoi'); n.voronoi_dimensions = '4D'; n.feature = feature
        v, w = self.torus(scale); self.L.new(v, n.inputs['Vector']); self.L.new(w, n.inputs['W'])
        n.inputs['Scale'].default_value = 1.0; n.inputs['Randomness'].default_value = rand
        return n.outputs[out]

    def ramp(self, fac, stops):
        r = self.N.new('ShaderNodeValToRGB'); self.L.new(fac, r.inputs['Fac'])
        el = r.color_ramp.elements
        while len(el) < len(stops): el.new(0.5)
        for e, (pos, col) in zip(el, stops): e.position = pos; e.color = tuple(col) + (1.0,)
        return r.outputs['Color']

    def mix(self, a, b, fac, blend='MIX'):
        n = self.N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
        if isinstance(fac, float): n.inputs['Factor'].default_value = fac
        else: self.L.new(fac, n.inputs['Factor'])
        self.L.new(a, n.inputs[6]); self.L.new(b, n.inputs[7]); return n.outputs[2]

    def bw(self, c):
        n = self.N.new('ShaderNodeRGBToBW'); self.L.new(c, n.inputs[0]); return n.outputs[0]

    def gray(self, v):
        c = self.N.new('ShaderNodeCombineColor')
        for i in range(3): self.L.new(v, c.inputs[i])
        return c.outputs[0]


def lin(h):
    h = h.lstrip('#'); v = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in v)


def grass(g):
    blades = g.noise(9.0, 2.0, 0.6)                                  # fine grass texture
    clumps = g.noise(0.9, 4.0, 0.55)
    soil = g.noise(0.45, 5.0, 0.6)
    col = g.ramp(clumps, [(0.3, lin('#2c6a2a')), (0.55, lin('#3f8a33')), (0.75, lin('#5d9a3a'))])
    col = g.mix(col, g.ramp(blades, [(0.3, (0.5, 0.5, 0.5)), (0.7, (1.25, 1.25, 1.2))]), 1.0, 'MULTIPLY')
    dirt = g.ramp(soil, [(0.62, (0, 0, 0)), (0.7, (1, 1, 1))])
    col = g.mix(col, g.ramp(blades, [(0.0, lin('#5a4630')), (1.0, lin('#7a6040'))]), g.bw(dirt))
    flowers = g.ramp(g.voronoi(14.0), [(0.0, (1, 1, 1)), (0.04, (1, 1, 1)), (0.06, (0, 0, 0))])
    col = g.mix(col, g.gray(g.m('ADD', 0.0, 1.0)), g.m('MULTIPLY', g.bw(flowers), 0.35))
    height = g.m('ADD', g.m('MULTIPLY', blades, 0.6), g.m('MULTIPLY', clumps, 0.4))
    return col, height


def sand(g):
    # wind ripples: stretched noise driving a sine across the dune face
    warp = g.noise(0.6, 3.0, 0.5)
    phase = g.m('ADD', g.m('MULTIPLY', g.ym, 9.0), g.m('MULTIPLY', warp, 9.0))
    ripple = g.m('MULTIPLY', g.m('ADD', g.m('SINE', g.m('ADD', phase, g.m('MULTIPLY', g.noise(1.5, 2.0), 3.0))), 1.0), 0.5)
    grain = g.noise(40.0, 2.0, 0.7)
    tone = g.noise(0.35, 4.0, 0.5)
    col = g.ramp(tone, [(0.35, lin('#c9995a')), (0.65, lin('#ddb276'))])
    col = g.mix(col, g.ramp(ripple, [(0.0, (0.82, 0.82, 0.82)), (1.0, (1.08, 1.06, 1.02))]), 1.0, 'MULTIPLY')
    col = g.mix(col, g.ramp(grain, [(0.3, (0.85, 0.85, 0.85)), (0.7, (1.12, 1.1, 1.08))]), 1.0, 'MULTIPLY')
    peb = g.ramp(g.voronoi(6.0), [(0.0, (1, 1, 1)), (0.05, (1, 1, 1)), (0.07, (0, 0, 0))])
    col = g.mix(col, g.gray(g.m('ADD', 0.0, 0.18)), g.m('MULTIPLY', g.bw(peb), 0.6))
    height = g.m('ADD', g.m('MULTIPLY', ripple, 0.75), g.m('MULTIPLY', grain, 0.15))
    return col, height


def scree(g):
    stones = g.voronoi(1.7, 'Distance')
    cells = g.voronoi(1.7, 'Color')
    big = g.voronoi(0.5, 'Distance')
    tone = g.noise(0.4, 4.0, 0.55)
    base = g.ramp(tone, [(0.3, lin('#6a5d4b')), (0.7, lin('#80725c'))])
    stone_tone = g.ramp(g.bw(cells), [(0.0, lin('#4f4a43')), (0.5, lin('#6f695f')), (1.0, lin('#8a8274'))])
    edge = g.ramp(stones, [(0.0, (1, 1, 1)), (0.45, (1, 1, 1)), (0.6, (0, 0, 0))])
    col = g.mix(base, stone_tone, g.bw(edge))
    col = g.mix(col, g.ramp(g.noise(30.0, 2.0), [(0.3, (0.8, 0.8, 0.8)), (0.7, (1.15, 1.15, 1.15))]), 1.0, 'MULTIPLY')
    snow = g.ramp(g.noise(0.5, 5.0, 0.6), [(0.76, (0, 0, 0)), (0.8, (1, 1, 1))])
    col = g.mix(col, g.gray(g.m('ADD', 0.0, 0.85)), g.bw(snow))
    height = g.m('ADD', g.m('MULTIPLY', g.m('SUBTRACT', 1.0, stones), 0.7), g.m('MULTIPLY', g.m('SUBTRACT', 1.0, big), 0.3))
    return col, height


def render_pass(sc, pl, fn, which, path):
    m = bpy.data.materials.new('g'); pl.data.materials.clear(); pl.data.materials.append(m)
    g = G(m)
    col, height = fn(g)
    g.L.new(col if which == 'albedo' else g.gray(height), g.em.inputs['Color'])
    sc.render.filepath = path
    sc.view_settings.view_transform = 'Standard'
    bpy.ops.render.render(write_still=True)


def normal_from_height(hpath, npath, strength):
    im = Image.open(hpath); h = np.asarray(im, dtype=np.float32)
    if h.ndim == 3: h = h[:, :, 0]
    h = (h - h.min()) / max(1e-6, h.max() - h.min())
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack((-dx, dy, np.ones_like(h))); n /= np.linalg.norm(n, axis=2, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(npath, quality=90)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sc, pl = setup()
    for k in KINDS:
        fn = {'grass': grass, 'sand': sand, 'scree': scree}[k]
        a = OUT + '/ground_%s.png' % k; hp = OUT + '/ground_%s_h.png' % k
        render_pass(sc, pl, fn, 'albedo', a)
        render_pass(sc, pl, fn, 'height', hp)
        Image.open(a).convert('RGB').save(OUT + '/ground_%s.jpg' % k, quality=86)
        normal_from_height(hp, OUT + '/ground_%s_n.jpg' % k, {'grass': 9.0, 'sand': 14.0, 'scree': 16.0}[k])
        os.remove(a); os.remove(hp)
        print('ground', k)
