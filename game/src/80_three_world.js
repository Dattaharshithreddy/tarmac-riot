/* ---------- 3D world: path, road, terrain, sky (three.js) ---------- */
const M3 = 0.0045;            // metres per world unit
const KC = 0.0018;            // heading change (radians) per segment per unit of curve
const HALF = ROAD_W * M3;     // road half width: 9 m
const CHUNK = 120;            // segments per road/scenery chunk

function buildPath3(track) {
  const segs = track.segs, N = segs.length, L = SEG * M3;
  const X = new Float64Array(N + 1), Z = new Float64Array(N + 1), Y = new Float64Array(N + 1), H = new Float64Array(N + 1);
  let x = 0, z = 0, h = 0;
  for (let i = 0; i <= N; i++) {
    X[i] = x; Z[i] = z; H[i] = h; Y[i] = (i < N ? segs[i].p1.world.y : segs[N - 1].p2.world.y) * M3;
    if (i < N) { h += segs[i].curve * KC; x += Math.sin(h) * L; z -= Math.cos(h) * L; }
  }
  function at(zw, lat, out) {
    out = out || {};
    const f = zw / SEG; let i = Math.floor(f); if (i < 0) i = 0; if (i >= N) i = N - 1;
    const t = clamp(f - i, 0, 1), hh = lerp(H[i], H[i + 1], t), lw = lat * HALF;
    out.x = lerp(X[i], X[i + 1], t) + Math.cos(hh) * lw;
    out.z = lerp(Z[i], Z[i + 1], t) + Math.sin(hh) * lw;
    out.y = lerp(Y[i], Y[i + 1], t); out.h = hh;
    return out;
  }
  return { X: X, Z: Z, Y: Y, H: H, N: N, at: at };
}

/* a strip that follows the road. prof(i) returns [[lateral metres, height offset], ...] for row i */
function ribbonGeo(path, i0, i1, prof, uScale, vLen) {
  const T3 = THREE, rows = i1 - i0 + 1, first = prof(i0), cols = first.length;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), idx = [];
  for (let r = 0; r < rows; r++) {
    const i = i0 + r, p = prof(i), c = Math.cos(path.H[i]), s = Math.sin(path.H[i]), d = i * SEG * M3;
    for (let k = 0; k < cols; k++) {
      const o = (r * cols + k);
      pos[o * 3] = path.X[i] + c * p[k][0]; pos[o * 3 + 1] = path.Y[i] + p[k][1]; pos[o * 3 + 2] = path.Z[i] + s * p[k][0];
      uv[o * 2] = uScale ? p[k][0] / uScale : k / (cols - 1); uv[o * 2 + 1] = d / vLen;
    }
  }
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < cols - 1; k++) {
    const a = r * cols + k, b = a + 1, c2 = a + cols, d2 = c2 + 1;
    idx.push(a, b, c2, b, d2, c2);
  }
  const g = new T3.BufferGeometry();
  g.setAttribute('position', new T3.BufferAttribute(pos, 3)); g.setAttribute('uv', new T3.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

/* ----- textures drawn on canvases ----- */
function texAsphalt(make, wet) {
  return mk(make, 256, 512, (c, w, h) => {
    c.fillStyle = wet ? '#2f3237' : '#3d3f44'; c.fillRect(0, 0, w, h);
    const r = makeRng(3);
    for (let i = 0; i < 9000; i++) { const v = Math.floor(r() * 50) - 25; c.fillStyle = 'rgba(' + (128 + v) + ',' + (128 + v) + ',' + (130 + v) + ',' + (0.05 + r() * 0.07) + ')'; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    for (let i = 0; i < 14; i++) { c.fillStyle = 'rgba(0,0,0,' + (0.05 + r() * 0.08) + ')'; c.beginPath(); c.ellipse(r() * w, r() * h, 6 + r() * 22, 20 + r() * 60, 0, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(w * 0.12, 0, w * 0.1, h); c.fillRect(w * 0.37, 0, w * 0.1, h); c.fillRect(w * 0.62, 0, w * 0.1, h); c.fillRect(w * 0.86, 0, w * 0.1, h);
    c.fillStyle = '#e9e9e9'; c.fillRect(4, 0, 5, h); c.fillRect(w - 9, 0, 5, h);
    for (const u of [0.25, 0.75]) c.fillRect(w * u - 2.5, 0, 5, h * 0.42);
    c.fillStyle = '#f2c100'; c.fillRect(w * 0.5 - 7, 0, 4, h); c.fillRect(w * 0.5 + 3, 0, 4, h);
  });
}
function texKerb(make) { return mk(make, 64, 64, (c) => { c.fillStyle = '#d8312b'; c.fillRect(0, 0, 64, 32); c.fillStyle = '#f2f2f2'; c.fillRect(0, 32, 64, 32); c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, 0, 64, 3); }); }
function texGround(make, a, b, kind) {
  return mk(make, 256, 256, (c, w, h) => {
    c.fillStyle = a; c.fillRect(0, 0, w, h); const r = makeRng(9);
    for (let i = 0; i < 2600; i++) { c.fillStyle = r() < 0.5 ? b : shade(a, (r() - 0.5) * 0.3); c.globalAlpha = 0.25 + r() * 0.4; const s = 1 + r() * (kind === 'sand' ? 2 : 4); c.fillRect(r() * w, r() * h, s, kind === 'grass' ? s * 2.5 : s); }
    c.globalAlpha = 1;
  });
}
function texWater(make) {
  return mk(make, 256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2d5f86'); g.addColorStop(1, '#244f73'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = makeRng(4); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1.5;
    for (let i = 0; i < 140; i++) { const x = r() * w, y = r() * h, l = 6 + r() * 20; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y - 2, x + l, y); c.stroke(); }
  });
}
function texGlow(make, color) {
  return mk(make, 128, 128, (c) => { const g = c.createRadialGradient(64, 64, 2, 64, 64, 64); g.addColorStop(0, color); g.addColorStop(0.25, rgba('#ffffff', 0.35)); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
}
function texCloud(make) {
  return mk(make, 256, 128, (c) => { const r = makeRng(12); for (let i = 0; i < 18; i++) { const x = 40 + r() * 176, y = 50 + r() * 36, rad = 18 + r() * 30; const g = c.createRadialGradient(x, y, 1, x, y, rad); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 128); } });
}

/* per-theme look */
const THEME3 = {
  sealink: { sunEl: 0.16, sunAz: -0.5, sun: '#ffb27a', sunI: 1.15, hemiSky: '#ffc8a0', hemiGround: '#3a2c48', hemiI: 0.75, fogNear: 130, fogFar: 680, ground: 'water', terrain: 0, wet: false },
  ladakh:  { sunEl: 0.75, sunAz: 0.9,  sun: '#fff8ee', sunI: 1.0, hemiSky: '#b9d4f0', hemiGround: '#4f4a40', hemiI: 0.55,  fogNear: 170, fogFar: 820, ground: 'rock', terrain: 1, wet: false },
  thar:    { sunEl: 0.95, sunAz: -0.3, sun: '#fff1d2', sunI: 1.3,  hemiSky: '#ffe2b0', hemiGround: '#a8763c', hemiI: 0.85, fogNear: 140, fogFar: 720, ground: 'sand', terrain: 2, wet: false },
  kerala:  { sunEl: 0.7,  sunAz: 0.2,  sun: '#dfe8ee', sunI: 0.6,  hemiSky: '#a9bcc8', hemiGround: '#2e4a34', hemiI: 0.9,  fogNear: 70, fogFar: 430, ground: 'grass', terrain: 3, wet: true },
};
function terrainLift(kind, i, lat) {
  const d = Math.max(0, Math.abs(lat) - HALF - 1);
  const n = Math.sin(i * 0.031 + lat * 0.05) * 0.5 + Math.sin(i * 0.013 - lat * 0.021) * 0.8;
  if (kind === 1) return d * 0.32 * (1 + 0.4 * Math.sin(i * 0.007 + (lat > 0 ? 1 : 4))) + n * 2.5 * Math.min(1, d / 20);
  if (kind === 2) return Math.min(1, d / 12) * (2.5 + n * 2.6 + Math.sin(i * 0.02 + lat * 0.03) * 3);
  if (kind === 3) return d * 0.14 + n * 1.6 * Math.min(1, d / 15);
  return -0.15;
}
