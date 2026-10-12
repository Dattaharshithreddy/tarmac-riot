/* ---------- 3D models built from primitives ---------- */
function mergeGeos(list) {
  const T3 = THREE, parts = [];
  let total = 0, hasCol = false;
  for (const it of list) {
    let g = it.g.index ? it.g.toNonIndexed() : it.g.clone();
    if (it.m) g.applyMatrix4(it.m);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (g.attributes.color) hasCol = true;
    parts.push({ g: g, col: it.col }); total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = hasCol || list.some((x) => x.col) ? new Float32Array(total * 3) : null;
  let o = 0;
  for (const p of parts) {
    const g = p.g, n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (col) {
      if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
      else { const c = new T3.Color(p.col || '#ffffff'); for (let k = 0; k < n; k++) { col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b; } }
    }
    o += n; g.dispose();
  }
  const out = new T3.BufferGeometry();
  out.setAttribute('position', new T3.BufferAttribute(pos, 3)); out.setAttribute('normal', new T3.BufferAttribute(nor, 3)); out.setAttribute('uv', new T3.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new T3.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const _m4 = () => new THREE.Matrix4();
function xf(x, y, z, rx, ry, rz, sx, sy, sz) {
  const T3 = THREE;
  return new T3.Matrix4().compose(new T3.Vector3(x || 0, y || 0, z || 0), new T3.Quaternion().setFromEuler(new T3.Euler(rx || 0, ry || 0, rz || 0)), new T3.Vector3(sx || 1, sy || 1, sz || 1));
}
/* a prototype is a set of (geometry, material) pairs, merged per material */
function Proto() {
  const by = new Map();
  return {
    add(g, mat, m, col) { if (!by.has(mat)) by.set(mat, []); by.get(mat).push({ g: g, m: m, col: col }); return this; },
    done() { const parts = []; for (const [mat, list] of by) parts.push({ geo: mergeGeos(list), mat: mat }); return parts; },
  };
}
function Mats() {
  const cache = new Map();
  return function (color, o) {
    o = o || {};
    const key = color + JSON.stringify(o);
    if (cache.has(key)) return cache.get(key);
    const T3 = THREE;
    const m = new T3.MeshStandardMaterial({ color: color, roughness: o.r !== undefined ? o.r : 0.8, metalness: o.m || 0, flatShading: !!o.flat, side: o.ds ? T3.DoubleSide : T3.FrontSide, vertexColors: !!o.vc });
    if (o.e) { m.emissive = new T3.Color(o.e); m.emissiveIntensity = o.ei || 1; }
    if (o.map) m.map = o.map;
    if (o.t) { m.transparent = true; m.opacity = o.t; }
    cache.set(key, m); return m;
  };
}

/* ----- scenery prototypes (road is on the -X side) ----- */
function frondGeo() {
  const g = new THREE.PlaneGeometry(0.9, 4.6, 1, 7), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), t = (y + 2.3) / 4.6;
    p.setXYZ(i, x * (1 - t * 0.75), -(t * t) * 2.1 + t * 0.4, t * 4.4);
  }
  g.computeVertexNormals(); return g;
}
function protoPalm(mat, leaf) {
  const T3 = THREE, P = Proto(), trunk = mat('#7a5530', { flat: true }), lf = mat(leaf, { ds: true, r: 0.7 }), nut = mat('#4a3216');
  let top = 0, xo = 0;
  for (let k = 0; k < 6; k++) { const h = 1.32; P.add(new T3.CylinderGeometry(0.16, 0.21, h, 7), trunk, xf(xo, top + h / 2, 0, 0, 0, 0.05 * k)); top += h * 0.97; xo -= 0.07 * k; }
  for (let k = 0; k < 9; k++) P.add(frondGeo(), lf, xf(xo, top, 0, -0.25 + (k % 2) * 0.18, k * 0.7, 0));
  for (let k = 0; k < 3; k++) P.add(new T3.SphereGeometry(0.17, 6, 5), nut, xf(xo + Math.cos(k * 2.1) * 0.22, top - 0.25, Math.sin(k * 2.1) * 0.22));
  return P.done();
}
function protoLamp(mat) {
  const T3 = THREE, P = Proto(), metal = mat('#7d8590', { r: 0.5, m: 0.4 }), head = mat('#fff2c4', { e: '#ffd77a', ei: 1.3 });
  P.add(new T3.CylinderGeometry(0.09, 0.13, 8.6, 8), metal, xf(0, 4.3, 0));
  P.add(new T3.BoxGeometry(2.8, 0.1, 0.1), metal, xf(-1.35, 8.45, 0));
  P.add(new T3.BoxGeometry(0.8, 0.14, 0.32), head, xf(-2.6, 8.36, 0));
  P.add(new T3.BoxGeometry(0.4, 0.5, 0.4), metal, xf(0, 0.25, 0));
  return P.done();
}
function protoBillboard(mat, tex) {
  const T3 = THREE, P = Proto(), post = mat('#59493a', { flat: true }), frame = mat('#2a2a30'), face = mat('#ffffff', { map: tex, r: 0.6 });
  P.add(new T3.CylinderGeometry(0.16, 0.2, 5.2, 6), post, xf(-2.4, 2.6, 0)); P.add(new T3.CylinderGeometry(0.16, 0.2, 5.2, 6), post, xf(2.4, 2.6, 0));
  P.add(new T3.BoxGeometry(7.4, 3.9, 0.25), frame, xf(0, 6.9, -0.14));
  P.add(new T3.PlaneGeometry(7.0, 3.5), face, xf(0, 6.9, 0.0));
  return P.done();
}
function protoBuilding(mat, make, envTex, v, rnd) {
  const T3 = THREE, P = Proto();
  const w = 12 + v * 3, d = 12, h = 16 + ((v * 7) % 4) * 8, cols = ['#c9a98b', '#b9bdc7', '#d6c7a1', '#9fb4a8', '#c98f85'];
  const fl = Math.round(h / 3.2), cn = Math.round(w / 3.4);
  const tex = envTex(mk(make, 256, 512, (c, W, H) => {
    c.fillStyle = cols[v % cols.length]; c.fillRect(0, 0, W, H);
    const cw = W / cn, rh = H / fl;
    for (let y = 0; y < fl; y++) for (let x = 0; x < cn; x++) { c.fillStyle = rnd() < 0.3 ? '#ffd98a' : '#2f3a47'; c.fillRect(x * cw + cw * 0.2, y * rh + rh * 0.22, cw * 0.6, rh * 0.5); c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(x * cw + cw * 0.15, y * rh + rh * 0.72, cw * 0.7, rh * 0.08); }
  }));
  P.add(new T3.BoxGeometry(w, h, d), mat('#ffffff', { map: tex, r: 0.85 }), xf(0, h / 2, 0));
  P.add(new T3.BoxGeometry(w + 0.6, 0.6, d + 0.6), mat(shadeHex(cols[v % cols.length], -0.35)), xf(0, h + 0.3, 0));
  P.add(new T3.BoxGeometry(1.4, 1.0, 1.4), mat('#8a8f99'), xf(w * 0.2, h + 1.1, 0));
  return P.done();
}
function shadeHex(hex, amt) { const c = hexToRgb(hex).map((v) => clamp(Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt), 0, 255)); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); }
function protoRock(mat, snow, seed) {
  const T3 = THREE, g = new T3.IcosahedronGeometry(1.7, 0), p = g.attributes.position, r = makeRng(seed);
  const jit = new Map();
  for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(2) + p.getY(i).toFixed(2) + p.getZ(i).toFixed(2); if (!jit.has(k)) jit.set(k, 0.75 + r() * 0.5); const s = jit.get(k); p.setXYZ(i, p.getX(i) * s * 1.3, Math.max(-0.3, p.getY(i) * s * 0.8), p.getZ(i) * s); }
  g.computeVertexNormals();
  const ng = g.toNonIndexed(), np = ng.attributes.position, col = new Float32Array(np.count * 3);
  for (let i = 0; i < np.count; i += 3) { const yy = (np.getY(i) + np.getY(i + 1) + np.getY(i + 2)) / 3, c = new T3.Color(snow && yy > 0.55 ? '#f3f7ff' : ['#8d9098', '#7e8189', '#9a9da4'][i % 3]); for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; } }
  ng.setAttribute('color', new T3.BufferAttribute(col, 3));
  return Proto().add(ng, mat('#ffffff', { flat: true, vc: true }), xf(0, 0.6, 0)).done();
}
function protoFlags(mat) {
  const T3 = THREE, P = Proto(), pole = mat('#d9d2c6');
  P.add(new T3.CylinderGeometry(0.06, 0.08, 6, 6), pole, xf(0, 3, 0)); P.add(new T3.CylinderGeometry(0.05, 0.06, 2.5, 6), pole, xf(0, 1.25, 7));
  const cols = ['#2f7bff', '#ffffff', '#e63946', '#2fbf71', '#ffd23f'];
  for (let i = 0; i < 10; i++) { const t = (i + 0.5) / 10, y = lerp(5.9, 2.4, t) - Math.sin(t * Math.PI) * 0.9; P.add(new T3.PlaneGeometry(0.45, 0.6), mat(cols[i % 5], { ds: true }), xf(0, y - 0.3, t * 7)); }
  return P.done();
}
function protoChorten(mat) {
  const T3 = THREE, P = Proto(), w = mat('#f4f1ea'), gold = mat('#d9a830', { r: 0.4, m: 0.5 }), red = mat('#8b2e2e');
  P.add(new T3.BoxGeometry(3.4, 1.0, 3.4), w, xf(0, 0.5, 0)); P.add(new T3.BoxGeometry(2.6, 0.8, 2.6), w, xf(0, 1.4, 0));
  P.add(new T3.SphereGeometry(1.25, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), w, xf(0, 1.8, 0)); P.add(new T3.BoxGeometry(0.7, 0.9, 0.7), w, xf(0, 3.4, 0));
  P.add(new T3.ConeGeometry(0.45, 1.9, 10), gold, xf(0, 4.8, 0)); P.add(new T3.BoxGeometry(0.5, 0.8, 0.1), red, xf(0, 2.3, -1.26));
  return P.done();
}
function protoPole(mat) {
  const T3 = THREE, P = Proto(), wood = mat('#6e5a45', { flat: true }), cer = mat('#e6e6ea');
  P.add(new T3.CylinderGeometry(0.11, 0.15, 9, 7), wood, xf(0, 4.5, 0)); P.add(new T3.BoxGeometry(2.2, 0.14, 0.14), wood, xf(0, 8.4, 0));
  for (const x of [-0.9, 0, 0.9]) P.add(new T3.CylinderGeometry(0.06, 0.06, 0.25, 6), cer, xf(x, 8.6, 0));
  return P.done();
}
function protoCactus(mat) {
  const T3 = THREE, P = Proto(), g = mat('#3f8f4a', { flat: true });
  P.add(new T3.CylinderGeometry(0.32, 0.36, 4.2, 8), g, xf(0, 2.1, 0)); P.add(new T3.SphereGeometry(0.32, 8, 5), g, xf(0, 4.2, 0));
  P.add(new T3.CylinderGeometry(0.2, 0.22, 1.1, 7), g, xf(-0.6, 2.0, 0, 0, 0, Math.PI / 2)); P.add(new T3.CylinderGeometry(0.2, 0.2, 1.4, 7), g, xf(-1.1, 2.7, 0));
  P.add(new T3.CylinderGeometry(0.18, 0.2, 0.9, 7), g, xf(0.5, 2.6, 0, 0, 0, Math.PI / 2)); P.add(new T3.CylinderGeometry(0.18, 0.18, 1.1, 7), g, xf(0.9, 3.1, 0));
  return P.done();
}
function protoFort(mat) {
  const T3 = THREE, P = Proto(), s = mat('#d2a56c', { flat: true }), dk = mat('#4b2f1a');
  P.add(new T3.BoxGeometry(26, 7, 5), s, xf(0, 3.5, 0));
  for (let i = 0; i < 12; i++) P.add(new T3.BoxGeometry(1.2, 1.4, 5.2), s, xf(-12 + i * 2.2, 7.7, 0));
  for (const x of [-13, 13]) { P.add(new T3.CylinderGeometry(2.6, 3.0, 10, 10), s, xf(x, 5, 0)); P.add(new T3.ConeGeometry(2.9, 2.4, 10), mat('#c08e57', { flat: true }), xf(x, 11.2, 0)); }
  P.add(new T3.BoxGeometry(3.2, 4.2, 0.4), dk, xf(0, 2.1, 2.6));
  return P.done();
}
function protoBush(mat, dry) {
  const T3 = THREE, P = Proto(), a = mat(dry ? '#a8884a' : '#2e8b57', { flat: true }), b = mat(dry ? '#8f7339' : '#237a49', { flat: true });
  P.add(new T3.IcosahedronGeometry(1.1, 0), a, xf(0, 0.8, 0)); P.add(new T3.IcosahedronGeometry(0.85, 0), b, xf(0.9, 0.6, 0.3)); P.add(new T3.IcosahedronGeometry(0.8, 0), b, xf(-0.8, 0.55, -0.2));
  return P.done();
}
function protoHouse(mat, v) {
  const T3 = THREE, P = Proto(), walls = ['#f3ead7', '#f8d7da', '#d6ecf2', '#fff2c2'][v % 4];
  P.add(new T3.BoxGeometry(8, 3.8, 6.5), mat(walls), xf(0, 1.9, 0));
  const roof = new T3.CylinderGeometry(4.6, 4.6, 8.8, 3, 1); P.add(roof, mat('#b5482f', { flat: true }), xf(0, 4.9, 0, 0, 0, Math.PI / 2, 1, 1, 0.5));
  P.add(new T3.BoxGeometry(1.4, 2.4, 0.2), mat('#5a3b22'), xf(-0.5, 1.2, -3.3)); P.add(new T3.BoxGeometry(1.4, 1.2, 0.2), mat('#6aa6c9', { r: 0.3 }), xf(2.4, 2.1, -3.3)); P.add(new T3.BoxGeometry(1.4, 1.2, 0.2), mat('#6aa6c9', { r: 0.3 }), xf(-3.0, 2.1, -3.3));
  return P.done();
}
function protoMarker(mat) {
  const T3 = THREE, P = Proto();
  P.add(new T3.BoxGeometry(0.5, 0.75, 0.18), mat('#f4f4f4'), xf(0, 0.375, 0)); P.add(new T3.CylinderGeometry(0.25, 0.25, 0.18, 10, 1, false, 0, Math.PI), mat('#f2b705'), xf(0, 0.75, 0, Math.PI / 2, 0, 0));
  return P.done();
}
function protoPylon(mat) {
  const T3 = THREE, P = Proto(), c = mat('#cfd2d6', { r: 0.7 }), cable = mat('#e8eaee', { r: 0.4, m: 0.4 });
  P.add(new T3.BoxGeometry(2.2, 64, 2.6), c, xf(-HALF - 2, 32, 0, 0, 0, -0.12)); P.add(new T3.BoxGeometry(2.2, 64, 2.6), c, xf(HALF + 2, 32, 0, 0, 0, 0.12));
  P.add(new T3.BoxGeometry(2 * HALF + 4, 2.4, 2.6), c, xf(0, 12, 0)); P.add(new T3.BoxGeometry(6, 3, 3), c, xf(0, 62, 0));
  for (const side of [-1, 1]) for (let k = 1; k <= 7; k++) { const L = k * 12, len = Math.hypot(L, 58), ang = Math.atan2(L, 58); for (const dir of [-1, 1]) P.add(new T3.CylinderGeometry(0.06, 0.06, len, 4), cable, xf(side * (HALF + 0.5), 1 + 29, dir * L / 2, dir * ang, 0, 0)); }
  return P.done();
}

/* ----- vehicles (front faces -Z) ----- */
function extrudeSide(shape, width, bevel) {
  const T3 = THREE, g = new T3.ExtrudeGeometry(shape, { depth: width, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 4 });
  g.rotateY(Math.PI / 2); g.translate(-width / 2, 0, 0); return g;
}
function shapeFrom(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; }
function wheel(mat, r, w) {
  const T3 = THREE, g = new T3.Group();
  const tire = new T3.Mesh(new T3.CylinderGeometry(r, r, w, 16), mat('#141414', { r: 0.9 })); tire.rotation.z = Math.PI / 2;
  const hub = new T3.Mesh(new T3.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 10), mat('#b8bcc4', { r: 0.35, m: 0.7 })); hub.rotation.z = Math.PI / 2;
  g.add(tire); g.add(hub); return g;
}
function addMesh(parent, geo, material, x, y, z, rx, ry, rz) { const m = new THREE.Mesh(geo, material); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); parent.add(m); return m; }
function makeCar(mat, color) {
  const T3 = THREE, g = new T3.Group(), wheels = [];
  const body = extrudeSide(shapeFrom([[-2.15, 0.3], [2.15, 0.3], [2.18, 0.72], [2.0, 0.86], [0.95, 0.98], [0.32, 1.44], [-0.95, 1.44], [-1.6, 1.0], [-2.18, 0.94]]), 1.74, 0.05);
  addMesh(g, body, mat(color, { r: 0.35, m: 0.35 }));
  addMesh(g, extrudeSide(shapeFrom([[0.9, 1.0], [0.34, 1.4], [-0.92, 1.4], [-1.54, 1.02]]), 1.88), mat('#111a24', { r: 0.15, m: 0.6 }));
  for (const [x, z] of [[-0.86, -1.38], [0.86, -1.38], [-0.86, 1.36], [0.86, 1.36]]) { const w = wheel(mat, 0.34, 0.26); w.position.set(x, 0.34, z); g.add(w); wheels.push(w); }
  const tl = mat('#ff2a2a', { e: '#ff1a1a', ei: 1.6 }), hl = mat('#ffffff', { e: '#fff6d0', ei: 1.4 });
  addMesh(g, new T3.BoxGeometry(0.42, 0.16, 0.06), tl, -0.6, 0.8, 2.2); addMesh(g, new T3.BoxGeometry(0.42, 0.16, 0.06), tl, 0.6, 0.8, 2.2);
  addMesh(g, new T3.BoxGeometry(0.42, 0.14, 0.06), hl, -0.6, 0.72, -2.2); addMesh(g, new T3.BoxGeometry(0.42, 0.14, 0.06), hl, 0.6, 0.72, -2.2);
  addMesh(g, new T3.BoxGeometry(0.52, 0.13, 0.03), mat('#f2f2f2'), 0, 0.55, 2.21); addMesh(g, new T3.BoxGeometry(1.9, 0.18, 0.18), mat('#1b1b1f'), 0, 0.42, 2.17);
  g.userData.wheels = wheels; g.userData.wr = 0.34; return g;
}
function makeRick(mat) {
  const T3 = THREE, g = new T3.Group(), wheels = [];
  addMesh(g, new T3.BoxGeometry(1.3, 0.75, 1.9), mat('#f6c700', { r: 0.5 }), 0, 0.68, 0.25);
  addMesh(g, new T3.BoxGeometry(0.8, 0.9, 0.7), mat('#1f7a3d', { r: 0.5 }), 0, 0.8, -0.95);
  const can = new T3.Mesh(new T3.CylinderGeometry(0.72, 0.72, 2.1, 12, 1, true, -Math.PI / 2, Math.PI), mat('#1c1c20', { ds: true, r: 0.9 })); can.rotation.x = Math.PI / 2; can.position.set(0, 1.12, 0.05); can.scale.set(0.92, 1, 0.75); g.add(can);
  addMesh(g, new T3.BoxGeometry(1.32, 0.05, 2.1), mat('#1c1c20'), 0, 1.66, 0.05);
  addMesh(g, new T3.BoxGeometry(1.0, 0.5, 0.05), mat('#18222c', { r: 0.2, m: 0.5 }), 0, 1.25, 1.12);
  for (const [x, z] of [[0, -1.15], [-0.62, 0.8], [0.62, 0.8]]) { const w = wheel(mat, 0.26, 0.16); w.position.set(x, 0.26, z); g.add(w); wheels.push(w); }
  const tl = mat('#ff2a2a', { e: '#ff1a1a', ei: 1.5 });
  addMesh(g, new T3.BoxGeometry(0.16, 0.12, 0.04), tl, -0.5, 0.75, 1.21); addMesh(g, new T3.BoxGeometry(0.16, 0.12, 0.04), tl, 0.5, 0.75, 1.21);
  g.userData.wheels = wheels; g.userData.wr = 0.26; return g;
}
function makeTruck(mat, color, rearTex, sideTex) {
  const T3 = THREE, g = new T3.Group(), wheels = [];
  addMesh(g, new T3.BoxGeometry(2.3, 2.1, 1.9), mat(color, { r: 0.45, m: 0.2 }), 0, 1.75, -2.95);
  addMesh(g, new T3.BoxGeometry(2.0, 0.85, 0.05), mat('#111a24', { r: 0.15, m: 0.6 }), 0, 2.2, -3.92);
  addMesh(g, new T3.BoxGeometry(2.2, 0.35, 0.06), mat('#d9a400'), 0, 1.05, -3.93);
  const side = mat('#ffffff', { map: sideTex, r: 0.7 }), rear = mat('#ffffff', { map: rearTex, r: 0.7 }), top = mat(shadeHex(color, -0.3));
  const cargo = new T3.Mesh(new T3.BoxGeometry(2.45, 2.7, 5.2), [side, side, top, top, rear, top]); cargo.position.set(0, 2.25, 0.75); g.add(cargo);
  addMesh(g, new T3.BoxGeometry(2.2, 0.35, 7.4), mat('#1d1f24'), 0, 0.75, -0.3);
  for (const z of [-2.95, 1.4, 2.55]) for (const x of [-1.02, 1.02]) { const w = wheel(mat, 0.5, 0.36); w.position.set(x, 0.5, z); g.add(w); wheels.push(w); }
  const tl = mat('#ff2a2a', { e: '#ff1a1a', ei: 1.6 });
  addMesh(g, new T3.BoxGeometry(0.3, 0.2, 0.05), tl, -0.95, 0.95, 3.4); addMesh(g, new T3.BoxGeometry(0.3, 0.2, 0.05), tl, 0.95, 0.95, 3.4);
  addMesh(g, new T3.BoxGeometry(0.5, 0.6, 0.03), mat('#151515'), -1.0, 0.45, 3.2); addMesh(g, new T3.BoxGeometry(0.5, 0.6, 0.03), mat('#151515'), 1.0, 0.45, 3.2);
  g.userData.wheels = wheels; g.userData.wr = 0.5; return g;
}
function makeBus(mat, sideTex, rearTex) {
  const T3 = THREE, g = new T3.Group(), wheels = [];
  const side = mat('#ffffff', { map: sideTex, r: 0.6 }), rear = mat('#ffffff', { map: rearTex, r: 0.6 }), roof = mat('#e8e8e8'), front = mat('#16212b', { r: 0.2, m: 0.5 });
  const body = new T3.Mesh(new T3.BoxGeometry(2.55, 3.0, 11), [side, side, roof, roof, rear, front]); body.position.set(0, 1.9, 0); g.add(body);
  for (const z of [-3.6, 3.4]) for (const x of [-1.1, 1.1]) { const w = wheel(mat, 0.52, 0.34); w.position.set(x, 0.52, z); g.add(w); wheels.push(w); }
  const tl = mat('#ff2a2a', { e: '#ff1a1a', ei: 1.6 });
  addMesh(g, new T3.BoxGeometry(0.32, 0.4, 0.05), tl, -1.05, 1.1, 5.52); addMesh(g, new T3.BoxGeometry(0.32, 0.4, 0.05), tl, 1.05, 1.1, 5.52);
  g.userData.wheels = wheels; g.userData.wr = 0.52; return g;
}
function makeCone(mat) { const T3 = THREE, g = new T3.Group(); addMesh(g, new T3.ConeGeometry(0.28, 0.75, 12), mat('#ff6a00', { r: 0.6 }), 0, 0.42, 0); addMesh(g, new T3.CylinderGeometry(0.17, 0.2, 0.12, 12), mat('#ffffff'), 0, 0.45, 0); addMesh(g, new T3.BoxGeometry(0.6, 0.06, 0.6), mat('#222'), 0, 0.03, 0); return g; }
function makeBarrel(mat) { const T3 = THREE, g = new T3.Group(); addMesh(g, new T3.CylinderGeometry(0.35, 0.35, 0.95, 14), mat('#d9382b', { r: 0.5 }), 0, 0.48, 0); for (const y of [0.32, 0.64]) addMesh(g, new T3.CylinderGeometry(0.36, 0.36, 0.12, 14), mat('#f3f3f3'), 0, y, 0); return g; }
function makePickup(mat, type, glowTex) {
  const T3 = THREE, g = new T3.Group(), inner = new T3.Group(); g.add(inner);
  const col = { cash: '#2fbf71', nitro: '#3b9bff', chain: '#cfd5df', bat: '#c88a4a', rod: '#b9c0ca', lathi: '#b08a4a', repair: '#ff5a5a' }[type] || '#ffffff';
  if (type === 'cash') { for (let i = 0; i < 3; i++) addMesh(inner, new T3.BoxGeometry(0.6, 0.12, 0.32), mat('#2fbf71', { e: '#0f6b3a', ei: 0.6 }), 0, i * 0.13, 0); }
  else if (type === 'nitro') { addMesh(inner, new T3.CylinderGeometry(0.2, 0.2, 0.7, 12), mat('#3b9bff', { r: 0.3, m: 0.6, e: '#123d77', ei: 0.7 })); addMesh(inner, new T3.CylinderGeometry(0.08, 0.08, 0.16, 8), mat('#d0d6de', { m: 0.8, r: 0.3 }), 0, 0.42, 0); }
  else if (type === 'repair') { addMesh(inner, new T3.BoxGeometry(0.55, 0.55, 0.2), mat('#ffffff', { e: '#666666', ei: 0.5 })); addMesh(inner, new T3.BoxGeometry(0.42, 0.12, 0.22), mat('#ff2a2a', { e: '#aa0000', ei: 0.6 })); addMesh(inner, new T3.BoxGeometry(0.12, 0.42, 0.22), mat('#ff2a2a', { e: '#aa0000', ei: 0.6 })); }
  else if (type === 'chain') { for (let i = 0; i < 4; i++) addMesh(inner, new T3.TorusGeometry(0.12, 0.035, 6, 12), mat('#cfd5df', { m: 0.8, r: 0.3 }), -0.25 + i * 0.17, 0, 0, 0, i % 2 ? Math.PI / 2 : 0, 0); }
  else if (type === 'rod') { addMesh(inner, new T3.CylinderGeometry(0.03, 0.03, 1.05, 8), mat('#b9c0ca', { r: 0.3, m: 0.9 }), 0, 0, 0, 0, 0, 0.6); }
  else { addMesh(inner, new T3.CylinderGeometry(0.06, 0.03, 0.95, 8), mat('#c88a4a', { r: 0.6 }), 0, 0, 0, 0, 0, 0.6); }
  const glow = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, opacity: 0.85 })); glow.scale.set(1.8, 1.8, 1); g.add(glow);
  g.userData.inner = inner; return g;
}

/* ----- bike and rider ----- */
function limb(parent, mat, from, to, r0, r1) {
  const T3 = THREE, d = new T3.Vector3().subVectors(to, from), len = d.length();
  const piv = new T3.Group(); piv.position.copy(from);
  const geo = new T3.CylinderGeometry(r1, r0, len, 8); geo.translate(0, len / 2, 0);
  const m = new T3.Mesh(geo, mat); piv.add(m);
  piv.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), d.clone().normalize());
  piv.userData.len = len; piv.userData.rest = piv.quaternion.clone();
  parent.add(piv); return piv;
}
function makeRider(mat, style, glowTex) {
  const T3 = THREE, V = (x, y, z) => new T3.Vector3(x, y, z);
  const root = new T3.Group(), bike = new T3.Group(), rider = new T3.Group(); root.add(bike); root.add(rider);
  const bodyCol = mat(style.bike, { r: 0.3, m: 0.45 }), dark = mat('#1a1b1f', { r: 0.6 }), chrome = mat('#c9ced6', { r: 0.25, m: 0.9 }), seat = mat('#121212', { r: 0.9 });
  const wheels = [];
  for (const z of [-0.74, 0.72]) {
    const w = new T3.Group(); w.position.set(0, 0.34, z);
    const tire = new T3.Mesh(new T3.TorusGeometry(0.27, 0.085, 8, 22), mat('#121212', { r: 0.9 })); tire.rotation.y = Math.PI / 2; w.add(tire);
    const rim = new T3.Mesh(new T3.CylinderGeometry(0.2, 0.2, 0.06, 14), chrome); rim.rotation.z = Math.PI / 2; w.add(rim);
    const spoke = new T3.Mesh(new T3.BoxGeometry(0.07, 0.36, 0.05), dark); w.add(spoke); const spoke2 = spoke.clone(); spoke2.rotation.x = Math.PI / 2; w.add(spoke2);
    bike.add(w); wheels.push(w);
  }
  addMesh(bike, new T3.BoxGeometry(0.34, 0.36, 0.55), mat('#3a3d44', { r: 0.5, m: 0.5 }), 0, 0.62, 0.02);
  const tank = addMesh(bike, new T3.SphereGeometry(0.3, 14, 10), bodyCol, 0, 0.98, -0.2); tank.scale.set(0.82, 0.62, 1.35);
  addMesh(bike, new T3.BoxGeometry(0.3, 0.12, 0.62), seat, 0, 1.0, 0.36);
  const tail = addMesh(bike, new T3.BoxGeometry(0.28, 0.16, 0.42), bodyCol, 0, 1.06, 0.82); tail.rotation.x = -0.25;
  addMesh(bike, new T3.BoxGeometry(0.2, 0.08, 0.05), mat('#ff2a2a', { e: '#ff1010', ei: 2 }), 0, 1.07, 1.04);
  const fair = addMesh(bike, new T3.SphereGeometry(0.24, 12, 8), bodyCol, 0, 1.05, -0.66); fair.scale.set(0.9, 0.9, 0.7);
  addMesh(bike, new T3.CylinderGeometry(0.1, 0.1, 0.04, 12), mat('#ffffff', { e: '#fff3c8', ei: 1.5 }), 0, 1.05, -0.84, Math.PI / 2, 0, 0);
  for (const x of [-0.11, 0.11]) { const f = addMesh(bike, new T3.CylinderGeometry(0.03, 0.03, 0.78, 6), chrome, x, 0.72, -0.7); f.rotation.x = 0.35; }
  addMesh(bike, new T3.CylinderGeometry(0.025, 0.025, 0.72, 6), dark, 0, 1.2, -0.52, 0, 0, Math.PI / 2);
  addMesh(bike, new T3.CylinderGeometry(0.06, 0.07, 0.72, 10), chrome, 0.2, 0.55, 0.48, Math.PI / 2 - 0.15, 0, 0);
  // rider
  const jacket = mat(style.jacket, { r: 0.7 }), pants = mat('#22252c', { r: 0.85 }), boot = mat('#0d0e11'), glove = mat('#16171b'), helm = mat(style.helmet, { r: 0.25, m: 0.3 });
  const torso = addMesh(rider, new T3.BoxGeometry(0.44, 0.62, 0.28), jacket, 0, 1.46, 0.16); torso.rotation.x = -0.62;
  addMesh(rider, new T3.BoxGeometry(0.06, 0.6, 0.02), mat('#f2f2f2'), 0, 1.47, 0.32, -0.62, 0, 0);
  const hips = addMesh(rider, new T3.BoxGeometry(0.4, 0.2, 0.3), pants, 0, 1.12, 0.36);
  hips.rotation.x = -0.1;
  for (const s of [-1, 1]) { limb(rider, pants, V(s * 0.15, 1.12, 0.3), V(s * 0.22, 0.98, -0.18), 0.09, 0.08); limb(rider, pants, V(s * 0.22, 0.98, -0.18), V(s * 0.24, 0.55, 0.12), 0.075, 0.065); addMesh(rider, new T3.BoxGeometry(0.12, 0.12, 0.26), boot, s * 0.24, 0.5, 0.06); }
  const head = new T3.Group(); head.position.set(0, 1.86, -0.08); rider.add(head);
  addMesh(head, new T3.SphereGeometry(0.17, 16, 12), helm);
  const visor = addMesh(head, new T3.SphereGeometry(0.172, 14, 8, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.32, Math.PI * 0.26), mat('#0d141c', { r: 0.1, m: 0.7 })); visor.rotation.y = Math.PI;
  addMesh(head, new T3.BoxGeometry(0.05, 0.03, 0.34), mat(style.jacket), 0, 0.165, 0);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = limb(rider, jacket, V(s * 0.24, 1.66, 0.0), V(s * 0.34, 1.2, -0.52), 0.07, 0.06);
    const hand = new T3.Mesh(new T3.SphereGeometry(0.07, 8, 6), glove); hand.position.set(0, arm.userData.len, 0); arm.add(hand);
    const bat = new T3.Mesh(new T3.CylinderGeometry(0.035, 0.06, 0.85, 8), mat('#a5682f', { r: 0.6 })); bat.position.set(0, arm.userData.len + 0.38, 0); bat.visible = false; arm.add(bat);
    const chain = new T3.Group(); for (let i = 0; i < 6; i++) { const l = new T3.Mesh(new T3.TorusGeometry(0.05, 0.015, 5, 8), chrome); l.position.set(0, arm.userData.len + 0.06 + i * 0.08, 0); l.rotation.y = i % 2 ? Math.PI / 2 : 0; chain.add(l); } chain.visible = false; arm.add(chain);
    arm.userData.bat = bat; arm.userData.chain = chain; arm.userData.side = s;
    arm.userData.punch = new T3.Quaternion().setFromUnitVectors(V(0, 1, 0), V(s * 1, 0.18, -0.35).normalize());
    arms.push(arm);
  }
  let siren = null;
  if (style.cop) {
    const bar = new T3.Group(); bar.position.set(0, 1.42, 1.0); bike.add(bar);
    addMesh(bar, new T3.BoxGeometry(0.06, 0.4, 0.06), dark, 0, 0, 0);
    const r = addMesh(bar, new T3.BoxGeometry(0.2, 0.1, 0.1), mat('#ff2020', { e: '#ff0000', ei: 2 }), -0.12, 0.22, 0);
    const b = addMesh(bar, new T3.BoxGeometry(0.2, 0.1, 0.1), mat('#2060ff', { e: '#0040ff', ei: 2 }), 0.12, 0.22, 0);
    const gl = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, color: '#ff3030', transparent: true, depthWrite: false })); gl.scale.set(1.6, 1.6, 1); gl.position.set(0, 0.25, 0); bar.add(gl);
    siren = { r: r, b: b, glow: gl };
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData = { wheels: wheels, arms: arms, rider: rider, bike: bike, siren: siren, wr: 0.36 };
  return root;
}

/* ----- highway furniture and roadside life ----- */
// broadleaf roadside tree (neem / banyan style) with the trunk painted white and red like Indian highway trees
function protoTree(mat, dry, seed) {
  const T3 = THREE, P = Proto(), r = makeRng(seed), bark = mat('#5b4532', { flat: true }), paint = mat('#efefea'), red = mat('#b8322a');
  const h = 3.2 + r() * 1.4;
  P.add(new T3.CylinderGeometry(0.2, 0.3, h, 8), bark, xf(0, h / 2, 0));
  P.add(new T3.CylinderGeometry(0.31, 0.31, 0.7, 8), paint, xf(0, 0.55, 0)); P.add(new T3.CylinderGeometry(0.315, 0.315, 0.16, 8), red, xf(0, 0.98, 0));
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + r(); P.add(new T3.CylinderGeometry(0.07, 0.12, 1.8, 6), bark, xf(Math.cos(a) * 0.5, h + 0.4, Math.sin(a) * 0.5, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)); }
  const leaves = dry ? ['#6f7d3a', '#7f8a44', '#5f6d33'] : ['#2f6b2a', '#3a7d33', '#285e25'];
  for (let k = 0; k < 7; k++) {
    const a = r() * 6.28, d = k ? 0.9 + r() * 1.2 : 0, s = 1.3 + r() * 0.8;
    const g = new T3.IcosahedronGeometry(1, 1), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const f = 0.82 + r() * 0.36; pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.72, pos.getZ(i) * f); }
    g.computeVertexNormals();
    P.add(g, mat(leaves[k % 3], { flat: true, r: 0.9 }), xf(Math.cos(a) * d, h + 1.3 + r() * 1.1, Math.sin(a) * d, 0, 0, 0, s, s, s));
  }
  return P.done();
}
// tall Himalayan poplar
function protoPoplar(mat, seed) {
  const T3 = THREE, P = Proto(), r = makeRng(seed), h = 9 + r() * 4;
  P.add(new T3.CylinderGeometry(0.12, 0.2, h * 0.5, 7), mat('#8b8273', { flat: true }), xf(0, h * 0.25, 0));
  const g = new T3.ConeGeometry(1.25, h * 0.85, 9, 4), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const f = 0.85 + r() * 0.3; pos.setXYZ(i, pos.getX(i) * f, pos.getY(i), pos.getZ(i) * f); }
  g.computeVertexNormals();
  P.add(g, mat(seed % 2 ? '#c9a73a' : '#6f8f3a', { flat: true }), xf(0, h * 0.58, 0, 0, 0, 0, 1, 1, 1));
  return P.done();
}
// sign on one or two posts; the face looks down the road at approaching riders (+Z). shape: rect | tri | circle
function protoSign(mat, tex, w, h, y, shape) {
  const T3 = THREE, P = Proto(), post = mat('#9aa1a9', { r: 0.4, m: 0.6 }), back = mat('#7b8188', { r: 0.6, m: 0.3 }), face = mat('#ffffff', { map: tex, r: 0.55 });
  for (const x of w > 2 ? [-w * 0.35, w * 0.35] : [0]) P.add(new T3.CylinderGeometry(0.05, 0.05, y + h / 2, 8), post, xf(x, (y + h / 2) / 2, -0.06));
  if (shape === 'tri' || shape === 'circle') {
    const n = shape === 'tri' ? 3 : 28, r = w / 2;
    P.add(new T3.CircleGeometry(r, n, Math.PI / 2), face, xf(0, y, 0));
    P.add(new T3.CircleGeometry(r * 1.02, n, Math.PI / 2), back, xf(0, y, -0.03, 0, Math.PI, 0));
  } else {
    P.add(new T3.BoxGeometry(w + 0.08, h + 0.08, 0.05), back, xf(0, y, -0.04));
    P.add(new T3.PlaneGeometry(w, h), face, xf(0, y, 0));
  }
  return P.done();
}
// roadside dhaba / tea stall with a painted signboard, charpais and a tin roof
function protoDhaba(mat, tex, v) {
  const T3 = THREE, P = Proto(), walls = ['#e9d8b4', '#f1c27d', '#cfe3d0', '#f3d6c8'][v % 4];
  P.add(new T3.BoxGeometry(9, 3.2, 6), mat(walls), xf(0, 1.6, 0));
  P.add(new T3.BoxGeometry(10, 0.15, 9.5), mat('#8b939b', { r: 0.5, m: 0.5 }), xf(0, 3.35, 1.6, -0.08, 0, 0));
  for (const x of [-4.6, 0, 4.6]) P.add(new T3.CylinderGeometry(0.08, 0.08, 3.1, 6), mat('#6b4f35'), xf(x, 1.55, 6));
  P.add(new T3.PlaneGeometry(8, 1.4), mat('#ffffff', { map: tex, r: 0.6 }), xf(0, 4.2, 3.1));
  P.add(new T3.BoxGeometry(8.2, 1.6, 0.1), mat('#3a2a1c'), xf(0, 4.2, 3.0));
  P.add(new T3.BoxGeometry(2.0, 2.4, 0.1), mat('#3a2a1c'), xf(-2, 1.2, 3.02));
  for (let k = 0; k < 3; k++) { P.add(new T3.BoxGeometry(1.0, 0.1, 1.9), mat('#c9a46a'), xf(-3 + k * 2.6, 0.55, 5)); for (const sx of [-0.45, 0.45]) for (const sz of [-0.85, 0.85]) P.add(new T3.BoxGeometry(0.07, 0.5, 0.07), mat('#5b4532'), xf(-3 + k * 2.6 + sx, 0.25, 5 + sz)); }
  P.add(new T3.CylinderGeometry(0.35, 0.35, 0.9, 10), mat('#2d5fa8'), xf(3.6, 0.45, 4.6));
  return P.done();
}
// fuel station canopy with two pumps
function protoPump(mat, tex) {
  const T3 = THREE, P = Proto(), white = mat('#f2f2f2', { r: 0.5 }), band = mat('#ffffff', { map: tex, r: 0.5 }), pillar = mat('#d8dadd', { r: 0.4, m: 0.3 }), pump = mat('#e03a2f', { r: 0.5 });
  P.add(new T3.BoxGeometry(14, 0.6, 8), white, xf(0, 5.4, 0));
  P.add(new T3.BoxGeometry(14.05, 0.9, 8.05), band, xf(0, 5.0, 0));
  for (const x of [-4.5, 4.5]) { P.add(new T3.BoxGeometry(0.5, 4.6, 0.5), pillar, xf(x, 2.3, 0)); P.add(new T3.BoxGeometry(0.8, 1.6, 0.5), pump, xf(x, 0.8, 1.2)); P.add(new T3.BoxGeometry(1.4, 0.15, 2.6), mat('#9aa1a9'), xf(x, 0.08, 1.2)); }
  P.add(new T3.BoxGeometry(6, 3.2, 4), mat('#e8e2d4'), xf(0, 1.6, -8));
  P.add(new T3.CylinderGeometry(0.15, 0.15, 7, 8), pillar, xf(8.2, 3.5, 3)); P.add(new T3.BoxGeometry(1.8, 1.8, 0.2), band, xf(8.2, 7.4, 3));
  return P.done();
}
// stone parapet blocks painted yellow and black (mountain roads)
function protoParapet(mat) {
  const P = Proto(); P.add(new THREE.BoxGeometry(0.5, 0.6, 1.1), mat('#f2c230', { r: 0.8 }), xf(0, 0.3, 0)); P.add(new THREE.BoxGeometry(0.52, 0.2, 1.12), mat('#1c1c1c'), xf(0, 0.42, 0));
  return P.done();
}

/* police jeep built from primitives (used when the Blender models are unavailable) */
function makePoliceJeep(mat, glowTex, letterTex) {
  const g = makeCar(mat, '#f4f4f4');
  addPoliceKit(g, mat, glowTex, 1.46, 1.76, 4.36, null, letterTex);
  return g;
}
/* light bar, stripe and POLICE lettering on any car; top = roof height, w = width, len = length (metres) */
function addPoliceKit(g, mat, glowTex, top, w, len, make, texFn) {
  const T3 = THREE, bar = new T3.Group(); bar.position.set(0, top, -len * 0.08); g.add(bar);
  addMesh(bar, new T3.BoxGeometry(w * 0.7, 0.12, 0.3), mat('#1b1d22', { r: 0.4 }), 0, 0.03, 0);
  const red = new T3.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff0000', emissiveIntensity: 3, roughness: 0.3 });
  const blue = new T3.MeshStandardMaterial({ color: '#2a5bff', emissive: '#0036ff', emissiveIntensity: 0.2, roughness: 0.3 });
  addMesh(bar, new T3.BoxGeometry(w * 0.32, 0.14, 0.26), red, -w * 0.17, 0.14, 0); addMesh(bar, new T3.BoxGeometry(w * 0.32, 0.14, 0.26), blue, w * 0.17, 0.14, 0);
  const glow = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, color: '#ff3030', transparent: true, depthWrite: false, blending: T3.AdditiveBlending }));
  glow.scale.set(3.2, 3.2, 1); glow.position.set(0, 0.3, 0); bar.add(glow);
  for (const s of [-1, 1]) addMesh(g, new T3.BoxGeometry(0.02, 0.16, len * 0.86), mat('#1f4fb3', { r: 0.4 }), s * (w / 2 + 0.01), top * 0.52, 0);
  if (texFn) {
    const lettering = texFn();
    const m = new T3.MeshStandardMaterial({ map: lettering, transparent: true, roughness: 0.5 });
    for (const s of [-1, 1]) { const pl = new T3.Mesh(new T3.PlaneGeometry(len * 0.42, len * 0.105), m); pl.position.set(s * (w / 2 + 0.02), top * 0.66, 0.2); pl.rotation.y = s * Math.PI / 2; g.add(pl); }
    const back = new T3.Mesh(new T3.PlaneGeometry(w * 0.6, w * 0.15), m); back.position.set(0, top * 0.62, len / 2 + 0.03); g.add(back);
  }
  g.userData.siren = { r: red, b: blue, glow: glow };
  return g;
}
