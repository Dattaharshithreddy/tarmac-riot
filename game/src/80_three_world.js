/* ---------- 3D world: path, road, terrain, sky (three.js) ---------- */
const M3 = 0.0045;            // metres per world unit
const KC = 0.0018;            // heading change (radians) per segment per unit of curve
const HALF = ROAD_W * M3;     // road half width: 9 m
const CHUNK = 240;            // segments per road/scenery chunk (bigger chunks = fewer draw calls)
// back/ahead in world units, up/look in metres, lat = how much the camera follows the rider sideways
const CAMERAS = [
  { name: 'Medium',       back: 1250, up: 2.75, ahead: 7000, look: 0.2,  fov: 58, lat: 0.85 },
  { name: 'Close',        back: 820,  up: 1.75, ahead: 3600, look: 0.95, fov: 62, lat: 0.95 },
  { name: 'Far',          back: 2300, up: 4.6,  ahead: 8600, look: 0,    fov: 56, lat: 0.75 },
  { name: 'Cinematic',    back: 3800, up: 11,   ahead: 4600, look: 0,    fov: 48, lat: 0.5 },
  { name: 'Rider cam', back: 125,  up: 1.42, ahead: 5200, look: 0.75, fov: 78, lat: 1.0, fp: true },
];

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
  // Blender-baked asphalt (tools/blender/asphalt.py) when available; lane paint is drawn on top here
  const baked = typeof ASSETS !== 'undefined' && ASSETS.img[wet ? 'asphalt_wet' : 'asphalt_dry'];
  const W0 = baked ? 512 : 256, H0 = baked ? 1024 : 512;
  return mk(make, W0, H0, (c, w, h) => {
    const k = w / 256;
    if (baked) c.drawImage(baked, 0, 0, w, h);
    else {
      c.fillStyle = wet ? '#2f3237' : '#3d3f44'; c.fillRect(0, 0, w, h);
      const r = makeRng(3);
      for (let i = 0; i < 9000; i++) { const v = Math.floor(r() * 50) - 25; c.fillStyle = 'rgba(' + (128 + v) + ',' + (128 + v) + ',' + (130 + v) + ',' + (0.05 + r() * 0.07) + ')'; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
      for (let i = 0; i < 14; i++) { c.fillStyle = 'rgba(0,0,0,' + (0.05 + r() * 0.08) + ')'; c.beginPath(); c.ellipse(r() * w, r() * h, 6 + r() * 22, 20 + r() * 60, 0, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(w * 0.12, 0, w * 0.1, h); c.fillRect(w * 0.37, 0, w * 0.1, h); c.fillRect(w * 0.62, 0, w * 0.1, h); c.fillRect(w * 0.86, 0, w * 0.1, h);
    }
    // thermoplastic paint: slightly worn so it reads as paint, not a sticker
    const paint = (col, x, y, ww, hh) => { c.fillStyle = col; c.fillRect(x, y, ww, hh); c.fillStyle = 'rgba(0,0,0,.10)'; for (let yy = y; yy < y + hh; yy += 9 * k) c.fillRect(x, yy, ww, 2 * k); };
    paint('#ececec', 4 * k, 0, 5 * k, h); paint('#ececec', w - 9 * k, 0, 5 * k, h);
    for (const u of [0.25, 0.75]) paint('#ececec', w * u - 2.5 * k, 0, 5 * k, h * 0.42);
    paint('#f2c100', w * 0.5 - 7 * k, 0, 4 * k, h); paint('#f2c100', w * 0.5 + 3 * k, 0, 4 * k, h);
  });
}
function texKerb(make, style) {
  // Sea Link: Mumbai black/yellow kerb. Highways: an unpaved gravel shoulder, tinted to the local ground
  if (style === 'city') return mk(make, 64, 64, (c) => { c.fillStyle = '#f2c230'; c.fillRect(0, 0, 64, 32); c.fillStyle = '#1b1b1b'; c.fillRect(0, 32, 64, 32); c.fillStyle = 'rgba(0,0,0,.1)'; c.fillRect(0, 0, 64, 3); });
  const base = { thar: '#a08a68', ladakh: '#7c776d', kerala: '#5d605b' }[style] || '#77736b';
  return mk(make, 64, 128, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h); const r = makeRng(17);
    for (let i = 0; i < 900; i++) { c.fillStyle = shade(base, (r() - 0.5) * 0.7); c.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5); }
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 0, 6, h);   // worn edge where the tarmac ends
  });
}
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

/* ---------- distant mountain ranges (3D, sun-lit, follow the camera like the sky) ----------
   Ridged noise around a ring ~1.5 km out. Colours are pre-blended toward the horizon haze so the
   range sits in the air, with snow above a snow line where the track has it. */
const RANGES = {
  ladakh: { R: 1600, h: [380, 860], rough: 1.0, rock: '#6d6152', rock2: '#8a7a64', snow: '#f4f7fb', snowLine: 0.55, haze: 0.35, layers: 2 },
  kerala: { R: 1400, h: [170, 380], rough: 0.55, rock: '#2c5a34', rock2: '#3d7044', snow: null, snowLine: 2, haze: 0.55, layers: 2 },
  thar:   { R: 1450, h: [60, 170],  rough: 0.8, rock: '#9a6b44', rock2: '#b98a5a', snow: null, snowLine: 2, haze: 0.5, layers: 1 },
};
function ridged(x, seed) {
  let a = 0, amp = 1, f = 1, norm = 0;
  for (let o = 0; o < 5; o++) {
    const v = Math.sin(x * f * 3.1 + seed * 1.7 + o * 11.3) * 0.5 + Math.sin(x * f * 7.7 + seed * 3.1 + o * 5.1) * 0.35 + Math.sin(x * f * 13.3 + o * 2.9) * 0.15;
    a += (1 - Math.abs(v)) * amp; norm += amp; amp *= 0.5; f *= 2.03;
  }
  return a / norm;
}
function buildRange(def, pal) {
  const cfg = RANGES[def.id]; if (!cfg) return null;
  const T3 = THREE, g = new T3.Group();
  const haze = new T3.Color(pal.fog), cRock = new T3.Color(cfg.rock), cRock2 = new T3.Color(cfg.rock2), cSnow = cfg.snow ? new T3.Color(cfg.snow) : null, c = new T3.Color();
  for (let L = 0; L < cfg.layers; L++) {
    const seg = 320, rows = 6, R = cfg.R + L * 260, seed = L * 7 + def.id.length;
    const pos = [], col = [], idx = [];
    const hk = L ? 1.25 : 1, hz = cfg.haze + L * 0.18;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const n = ridged(i / seg * 6.0, seed);
      const peak = (cfg.h[0] + (cfg.h[1] - cfg.h[0]) * Math.pow(n, 1 + cfg.rough)) * hk;
      for (let r = 0; r <= rows; r++) {
        const t = r / rows;                       // 0 = foot, 1 = ridge line
        const prof = Math.pow(t, 0.8);
        const rr = R + (1 - t) * 260 + Math.sin(i * 0.7 + r) * 12;
        const y = -30 + prof * peak + (r === rows ? 0 : Math.sin(i * 1.3 + r * 2.1) * 6 * t);
        pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
        c.copy(cRock).lerp(cRock2, (Math.sin(i * 0.37 + r) * 0.5 + 0.5) * 0.6);
        if (cSnow && prof * peak > cfg.h[1] * cfg.snowLine * hk * (0.85 + 0.3 * Math.sin(i * 0.9))) c.copy(cSnow);
        c.lerp(haze, Math.min(0.92, hz + (1 - t) * 0.25));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < seg; i++) for (let r = 0; r < rows; r++) { const a = i * (rows + 1) + r, b = a + rows + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T3.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new T3.Mesh(geo, new T3.MeshLambertMaterial({ vertexColors: true, fog: false, side: T3.DoubleSide }));
    m.renderOrder = -2 + L; m.rotation.y = L * 0.7; g.add(m);
  }
  return g;
}

/* tileable water normal map: a few crossing wave trains */
function texWaterNormal(make) {
  const S = 256;
  return mk(make, S, S, (c) => {
    const img = c.createImageData(S, S), d = img.data, h = new Float32Array(S * S);
    const waves = [[3, 1, 1.0], [-2, 3, 0.7], [5, -2, 0.45], [7, 6, 0.3], [-9, 4, 0.22], [13, -7, 0.12]];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0; for (const [kx, ky, a] of waves) v += Math.sin((kx * x + ky * y) / S * Math.PI * 2 + kx) * a;
      h[y * S + x] = v;
    }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)], dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
      let nx = -dx * 0.6, ny = -dy * 0.6, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = (y * S + x) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

/* ---------- tyre dust / rain spray / snow powder behind bikes (one Points draw call) ---------- */
const DUST_LOOK = {
  thar:    { col: '#d9b58a', rate: 34, life: 1.5, grow: 3.8, alpha: 0.6, rise: 0.7 },
  ladakh:  { col: '#f1f3f6', rate: 16, life: 0.9, grow: 1.8, alpha: 0.5,  rise: 0.5 },
  kerala:  { col: '#e6eef2', rate: 26, life: 0.55, grow: 1.5, alpha: 0.24, rise: 0.8 },
  sealink: { col: '#b7a6a0', rate: 6,  life: 0.7, grow: 1.4, alpha: 0.18, rise: 0.4 },
};
function createDust(def, scene, glowTex) {
  const T3 = THREE, L = DUST_LOOK[def.id] || DUST_LOOK.sealink, N = 420;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), age = new Float32Array(N).fill(99), life = new Float32Array(N);
  const geo = new T3.BufferGeometry();
  geo.setAttribute('position', new T3.BufferAttribute(pos, 3)); geo.setAttribute('size', new T3.BufferAttribute(size, 1)); geo.setAttribute('alpha', new T3.BufferAttribute(alpha, 1));
  const mat = new T3.ShaderMaterial({
    uniforms: { map: { value: glowTex }, color: { value: new T3.Color(L.col) }, scale: { value: 300 } },
    vertexShader: 'attribute float size; attribute float alpha; varying float vA; uniform float scale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha * smoothstep(2.0, 7.0, -mv.z); gl_PointSize = size * scale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }',   // fades out close to the lens
    fragmentShader: 'uniform sampler2D map; uniform vec3 color; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA * smoothstep(0.0, 0.3, t.r); if (a < 0.01) discard; gl_FragColor = vec4(color, a); }',
    transparent: true, depthWrite: false,
  });
  const pts = new T3.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
  let next = 0, acc = 0;
  function emit(x, y, z, vx, vz, burst) {
    const i = next; next = (next + 1) % N;
    pos[i * 3] = x + (Math.random() - 0.5) * 0.3; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
    vel[i * 3] = vx + (Math.random() - 0.5) * (burst ? 3 : 0.8); vel[i * 3 + 1] = L.rise * (0.6 + Math.random() * 0.8) * (burst ? 2 : 1); vel[i * 3 + 2] = vz + (Math.random() - 0.5) * (burst ? 3 : 0.8);
    age[i] = 0; life[i] = L.life * (0.7 + Math.random() * 0.6) * (burst ? 1.4 : 1);
  }
  return {
    // emitters: [{x, y, z, h (heading), speed01, burst}]
    update(dt, emitters, H, fov) {
      mat.uniforms.scale.value = H / (2 * Math.tan(fov * Math.PI / 360));
      acc += dt;
      for (const e of emitters) {
        const n = e.burst ? 18 : Math.max(0, Math.round(L.rate * e.speed01 * dt + Math.random() * 0.6 - 0.3));
        const fx = Math.sin(e.h), fz = -Math.cos(e.h);
        for (let k = 0; k < n; k++) emit(e.x - fx * 0.8, e.y + 0.15, e.z - fz * 0.8, -fx * 1.5 * e.speed01, -fz * 1.5 * e.speed01, e.burst);
      }
      for (let i = 0; i < N; i++) {
        if (age[i] > life[i]) { alpha[i] = 0; size[i] = 0; continue; }
        age[i] += dt; const t = age[i] / life[i];
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3] *= 0.96; vel[i * 3 + 2] *= 0.96; vel[i * 3 + 1] *= 0.98;
        size[i] = 0.35 + L.grow * Math.sqrt(t); alpha[i] = L.alpha * (1 - t) * Math.min(1, t * 6);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.size.needsUpdate = true; geo.attributes.alpha.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
