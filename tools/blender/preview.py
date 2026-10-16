"""Studio preview of game models in Cycles.
usage: python runb.py preview.py OUT.png [W H SAMPLES] a.glb[@x,y,yawdeg] b.glb ...
Models sit on an asphalt ground under a warm sun; the camera frames all of them in 3/4 view."""
import sys, math, os
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
out = args.pop(0)
W, H, SAMPLES = 1600, 900, 64
if len(args) >= 3 and args[0].isdigit():
    W, H, SAMPLES = int(args[0]), int(args[1]), int(args[2]); args = args[3:]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES
try: sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in type(sc.view_settings).bl_rna.properties['view_transform'].enum_items] else 'Filmic'
sc.view_settings.look = 'None'

# world: soft sky
wd = bpy.data.worlds.new('w'); sc.world = wd; wd.use_nodes = True
bg = wd.node_tree.nodes['Background']
try:
    sky = wd.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(28); sky.sun_rotation = math.radians(140)
    wd.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.35
except Exception:
    bg.inputs['Color'].default_value = (0.55, 0.65, 0.8, 1); bg.inputs['Strength'].default_value = 0.8
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.angle = math.radians(2.5); sun.rotation_euler = (math.radians(55), 0, math.radians(140))

# asphalt ground with a lane line
gm = bpy.data.materials.new('ground'); gm.use_nodes = True; nt = gm.node_tree; b = nt.nodes['Principled BSDF']
noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 180; noise.inputs['Detail'].default_value = 8
ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (0.035, 0.036, 0.04, 1); ramp.color_ramp.elements[1].color = (0.09, 0.09, 0.095, 1)
nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.85
bpy.ops.mesh.primitive_plane_add(size=200); g = bpy.context.object; g.data.materials.append(gm)
lm = bpy.data.materials.new('line'); lm.use_nodes = True; lm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.8, 0.78, 1)
bpy.ops.mesh.primitive_plane_add(size=1); ln = bpy.context.object; ln.scale = (0.08, 60, 1); ln.location = (0, 0, 0.003); ln.data.materials.append(lm)

# models
objs = []
x = 0.0
for a in args:
    path, _, pose = a.partition('@')
    path, _, only = path.partition('#')          # file.glb#palm+neem keeps just those objects, side by side
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    if only:
        keep = only.split('+')
        top = lambda o: o if o.parent is None else top(o.parent)
        drop = [o for o in new if top(o).name.split('.')[0] not in keep]
        for o in drop: bpy.data.objects.remove(o, do_unlink=True)
        new = [o for o in new if o not in drop]
        roots = [r for k in keep for r in new if r.parent is None and r.name.split('.')[0] == k]
        for i, r in enumerate(roots): r.location = (i * float(os.environ.get('GAP', '7')), 0, 0)
    px, py, yaw = (0.0, 0.0, 30.0)
    if pose: v = [float(t) for t in pose.split(',')]; px, py, yaw = (v + [0, 0, 30])[:3]
    holder = bpy.data.objects.new('holder', None); sc.collection.objects.link(holder)
    for r in roots: r.parent = holder
    holder.location = (px, py, 0); holder.rotation_euler = (0, 0, math.radians(yaw))
    objs += [o for o in new if o.type == 'MESH']

bpy.context.view_layer.update()
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
for o in objs:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c); lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
ctr = (lo + hi) / 2; size = max((hi - lo).x, (hi - lo).y, (hi - lo).z * 1.6)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
d = size * 1.55 + 1.0
cam.location = ctr + Vector((d * 0.62, -d * 0.78, d * 0.36))
look = ctr - cam.location
cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('preview', out, len(objs), 'meshes')
