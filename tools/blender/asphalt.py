"""Bake an asphalt albedo texture for the game's road (no lane paint: the game draws markings on top).
The image spans the full 18 m road width (u) and 12 m of road length (v) and tiles seamlessly along v
(procedural noise is sampled on a cylinder).
usage: python runb.py asphalt.py OUT.png [dry|wet] [W H]"""
import sys, math
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]; kind = args[1] if len(args) > 1 else 'dry'
W, H = (int(args[2]), int(args[3])) if len(args) > 3 else (512, 1024)
ROAD_W, ROAD_L = 18.0, 12.0

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
sc.render.image_settings.file_format = 'PNG'

bpy.ops.mesh.primitive_plane_add(size=1); pl = bpy.context.object; pl.scale = (ROAD_W, ROAD_L, 1)
m = bpy.data.materials.new('asphalt'); pl.data.materials.append(m)
nt = m.node_tree; N, L = nt.nodes, nt.links
for n in list(N): N.remove(n)
outn = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission'); L.new(em.outputs[0], outn.inputs[0])
tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs[0])


def math_node(op, a, b=None, val=None):
    n = N.new('ShaderNodeMath'); n.operation = op
    L.new(a, n.inputs[0]) if not isinstance(a, (int, float)) else n.inputs.__getitem__(0).__setattr__('default_value', a)
    if b is not None:
        if isinstance(b, (int, float)): n.inputs[1].default_value = b
        else: L.new(b, n.inputs[1])
    return n.outputs[0]


# x in metres across the road, angle around the cylinder along the road -> seamless in v
xm = math_node('MULTIPLY', sep.outputs['X'], ROAD_W)
ang = math_node('MULTIPLY', sep.outputs['Y'], 2 * math.pi)
R = ROAD_L / (2 * math.pi)
cy = math_node('MULTIPLY', math_node('COSINE', ang), R)
sy = math_node('MULTIPLY', math_node('SINE', ang), R)
comb = N.new('ShaderNodeCombineXYZ'); L.new(xm, comb.inputs[0]); L.new(cy, comb.inputs[1]); L.new(sy, comb.inputs[2])
P = comb.outputs[0]


def tex(nodetype, scale, **kw):
    t = N.new(nodetype); L.new(P, t.inputs['Vector']); t.inputs['Scale'].default_value = scale
    for k, v in kw.items():
        if k in t.inputs: t.inputs[k].default_value = v
        else: setattr(t, k, v)
    return t


def ramp(fac, stops):
    r = N.new('ShaderNodeValToRGB'); L.new(fac, r.inputs['Fac'])
    el = r.color_ramp.elements
    while len(el) < len(stops): el.new(0.5)
    for e, (pos, col) in zip(el, stops): e.position = pos; e.color = col + (1.0,) if len(col) == 3 else col
    return r.outputs['Color']


def mix(a, b, fac, blend='MIX'):
    n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
    L.new(fac, n.inputs['Factor']) if not isinstance(fac, float) else n.inputs.__getitem__('Factor').__setattr__('default_value', fac)
    L.new(a, n.inputs[6]); L.new(b, n.inputs[7]); return n.outputs[2]


wet = kind == 'wet'
base = (0.055, 0.057, 0.062) if not wet else (0.035, 0.037, 0.041)
hi = (0.16, 0.16, 0.165) if not wet else (0.10, 0.105, 0.11)
# aggregate stones
vor = tex('ShaderNodeTexVoronoi', 55.0, Randomness=1.0)
stones = ramp(vor.outputs['Color'], [(0.0, base), (0.55, base), (0.85, hi), (1.0, (0.22, 0.21, 0.2))])
fine = tex('ShaderNodeTexNoise', 140.0, Detail=10.0, Roughness=0.7)
grain = mix(stones, ramp(fine.outputs['Fac'], [(0.35, (0.03, 0.03, 0.033)), (0.65, (0.13, 0.13, 0.135))]), 0.45, 'OVERLAY')
# big blotches: oil, wear, patch repairs
blot = tex('ShaderNodeTexNoise', 0.35, Detail=4.0, Roughness=0.55)
c = mix(grain, ramp(blot.outputs['Fac'], [(0.3, (0.6, 0.6, 0.62)), (0.7, (1.15, 1.15, 1.15))]), 1.0, 'MULTIPLY')
patch = tex('ShaderNodeTexVoronoi', 0.16, Randomness=1.0); patch.distance = 'CHEBYCHEV'
patch_mask = ramp(patch.outputs['Distance'], [(0.0, (1, 1, 1)), (0.16, (1, 1, 1)), (0.17, (0, 0, 0)), (1.0, (0, 0, 0))])
pbw = N.new('ShaderNodeRGBToBW'); L.new(patch_mask, pbw.inputs[0])
fresh = ramp(fine.outputs['Fac'], [(0.0, (0.018, 0.018, 0.021)), (1.0, (0.036, 0.036, 0.04))])   # darker repaired patches
c = mix(c, mix(c, fresh, 0.75), pbw.outputs[0])
# polished wheel paths: two per lane, lanes centred at +-2.25 m and +-6.75 m
paths = None
for lane in (-6.75, -2.25, 2.25, 6.75):
    for w in (-0.8, 0.8):
        d = math_node('ABSOLUTE', math_node('SUBTRACT', xm, lane + w))
        g = math_node('SUBTRACT', 1.0, math_node('MINIMUM', math_node('DIVIDE', d, 0.42), 1.0))
        paths = g if paths is None else math_node('MAXIMUM', paths, g)
paths = math_node('MULTIPLY', paths, 0.32)
c = mix(c, ramp(fine.outputs['Fac'], [(0.0, (0.035, 0.035, 0.04) if not wet else (0.02, 0.02, 0.024)), (1.0, (0.07, 0.07, 0.075))]), paths)
# hairline cracks
crk = tex('ShaderNodeTexVoronoi', 1.6, Randomness=1.0); crk.feature = 'DISTANCE_TO_EDGE'
crack = ramp(crk.outputs['Distance'], [(0.0, (0.25, 0.25, 0.25)), (0.008, (0.25, 0.25, 0.25)), (0.016, (1, 1, 1)), (1.0, (1, 1, 1))])
cmask = tex('ShaderNodeTexNoise', 0.6, Detail=2.0)
cm = ramp(cmask.outputs['Fac'], [(0.66, (0, 0, 0)), (0.72, (0.8, 0.8, 0.8))])
cbw = N.new('ShaderNodeRGBToBW'); L.new(cm, cbw.inputs[0])
c = mix(c, mix(c, crack, 1.0, 'MULTIPLY'), cbw.outputs[0])
L.new(c, em.inputs['Color'])

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(ROAD_W, ROAD_L); cam.location = (0, 0, 10)
sc.render.pixel_aspect_x = 1; sc.render.pixel_aspect_y = 1
# camera sees ROAD_W x ROAD_L exactly: ortho scale applies to the longer image side
cam.data.sensor_fit = 'VERTICAL'; cam.data.ortho_scale = ROAD_L
pl.scale = (ROAD_W, ROAD_L, 1)
sc.render.resolution_x, sc.render.resolution_y = W, H
# the image is W x H pixels but must hold 18 x 12 m: render at a matching aspect, then resize
sc.render.resolution_x = int(H * ROAD_W / ROAD_L)
sc.render.filepath = out + '.tmp.png'
bpy.ops.render.render(write_still=True)
from PIL import Image
Image.open(out + '.tmp.png').convert('RGB').resize((W, H), Image.LANCZOS).save(out)
import os; os.remove(out + '.tmp.png')
print('asphalt', kind, out)
