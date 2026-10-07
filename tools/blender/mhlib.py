"""MakeHuman (CC0) body loader: base mesh hm08 + macro targets + default skeleton and weights.
Coordinates are converted to the Tarmac Riot Blender convention: X = character's right, Y = forward, Z = up, metres."""
import json, os
import numpy as np

MH = '/home/claude/mh/data'

def load_obj():
    vs, vts, faces, group = [], [], [], None
    for line in open(os.path.join(MH, '3dobjs/base.obj')):
        if line.startswith('v '):
            vs.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            vts.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '):
            group = line.split()[1]
        elif line.startswith('f '):
            idx = [int(t.split('/')[0]) - 1 for t in line.split()[1:]]
            uv = [int(t.split('/')[1]) - 1 if '/' in t and t.split('/')[1] else -1 for t in line.split()[1:]]
            faces.append((group, idx, uv))
    return np.array(vs, dtype=np.float64), np.array(vts) if vts else None, faces

def load_target(rel):
    d = {}
    for line in open(os.path.join(MH, 'targets', rel)):
        if not line.strip() or line.startswith('#'): continue
        p = line.split(); d[int(p[0])] = (float(p[1]), float(p[2]), float(p[3]))
    return d

def apply_targets(verts, targets):
    v = verts.copy()
    for rel, w in targets:
        if w == 0: continue
        for i, d in load_target(rel).items():
            v[i] += np.array(d) * w
    return v

def to_blender(v):
    """MakeHuman decimetres, Y up, face +Z, +X = character's left  ->  metres, Z up, face +Y, +X = character's right."""
    out = np.empty_like(v)
    out[:, 0] = -v[:, 0] * 0.1
    out[:, 1] = v[:, 2] * 0.1
    out[:, 2] = v[:, 1] * 0.1
    return out

def male_body(muscle=0.62, weight=0.5, height=0.25, asian=0.5, caucasian=0.5, ideal=0.6):
    verts, uvs, faces = load_obj()
    mm = max(0.0, (muscle - 0.5) * 2)
    lw = max(0.0, (0.5 - weight) * 2)
    T = [('macrodetails/universal-male-young-averagemuscle-averageweight.target', (1 - mm) * (1 - lw)),
         ('macrodetails/universal-male-young-maxmuscle-averageweight.target', mm * (1 - lw)),
         ('macrodetails/universal-male-young-averagemuscle-minweight.target', (1 - mm) * lw),
         ('macrodetails/universal-male-young-maxmuscle-minweight.target', mm * lw),
         ('macrodetails/asian-male-young.target', asian),
         ('macrodetails/caucasian-male-young.target', caucasian),
         ('macrodetails/height/male-young-averagemuscle-averageweight-maxheight.target', height * (1 - mm)),
         ('macrodetails/height/male-young-maxmuscle-averageweight-maxheight.target', height * mm),
         ('macrodetails/proportions/male-young-averagemuscle-averageweight-idealproportions.target', ideal * (1 - mm)),
         ('macrodetails/proportions/male-young-maxmuscle-averageweight-idealproportions.target', ideal * mm)]
    v = to_blender(apply_targets(verts, T))
    v[:, 2] -= v[:, 2].min()  # feet on the ground (includes helper geometry, refined later)
    return v, uvs, faces

def skeleton(v):
    """Joint positions (Blender coords) and bone table from default.mhskel."""
    s = json.load(open(os.path.join(MH, 'rigs/default.mhskel')))
    J = {k: v[idx].mean(axis=0) for k, idx in s['joints'].items()}
    bones = {}
    for name, b in s['bones'].items():
        bones[name] = dict(head=J[b['head']], tail=J[b['tail']], parent=b['parent'])
    return bones

def weights():
    return json.load(open(os.path.join(MH, 'rigs/default_weights.mhw')))['weights']
