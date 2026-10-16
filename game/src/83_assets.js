/* ---------- Blender models (GLB, embedded as base64 by build.js) ---------- */
const ASSETS = { ready: false, gltf: {}, cache: {}, img: {} };
// Decode the Blender-baked textures (browser only). done() runs once all have loaded or failed.
function loadImages(env, done) {
  const src = env.texData || (typeof window !== 'undefined' ? window.__TR_TEX__ : null);
  if (!src || typeof Image === 'undefined') { done(); return; }
  const names = Object.keys(src); let left = names.length;
  if (!left) { done(); return; }
  const fin = () => { if (--left === 0) done(); };
  for (const n of names) { const im = new Image(); im.onload = () => { ASSETS.img[n] = im; fin(); }; im.onerror = fin; im.src = src[n]; }
}

function b64ToArrayBuffer(s) {
  if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') { const b = Buffer.from(s, 'base64'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
  const bin = atob(s), n = bin.length, u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

// Decode every embedded model. done(true) when all parsed; done(false) if anything is missing or fails.
function loadAssets(env, done0) {
  const done = (ok) => loadImages(env, () => done0(ok));
  const src = env.glb || (typeof window !== 'undefined' ? window.__TR_GLB__ : root.__TR_GLB__);
  if (ASSETS.ready) { done(true); return; }
  if (!src || typeof THREE === 'undefined' || !THREE.GLTFLoader || !THREE.SkeletonUtils) { done(false); return; }
  const names = Object.keys(src);
  let left = names.length, failed = false, finished = false;
  const finish = (ok) => { if (finished) return; finished = true; ASSETS.ready = ok; done(ok); };
  const timer = setTimeout(() => finish(false), env.assetTimeout || 15000);
  for (const n of names) {
    try {
      const loader = new THREE.GLTFLoader();
      if (THREE.MeshoptDecoder) loader.setMeshoptDecoder(THREE.MeshoptDecoder);
      for (const p of env.gltfPlugins || []) loader.pluginCallbacks.unshift(p);   // test harness hooks run first
      loader.parse(b64ToArrayBuffer(src[n]), '', (g) => {
        ASSETS.gltf[n] = g;
        g.scene.updateMatrixWorld(true);
        g.scene.traverse((o) => { if (o.isMesh) {
          // skinned meshes: give them a bounding sphere around the whole rider so they can be culled (also from shadow passes)
          if (o.isSkinnedMesh) { const inv = o.matrixWorld.clone().invert(); o.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0).applyMatrix4(inv), 1.7 / o.matrixWorld.getMaxScaleOnAxis()); }
          o.frustumCulled = true; o.geometry.userData.keep = true; for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.userData.keep = true; } });
        if (--left === 0) { clearTimeout(timer); finish(!failed); }
      }, () => { failed = true; if (--left === 0) { clearTimeout(timer); finish(false); } });
    } catch (e) { failed = true; if (--left === 0) { clearTimeout(timer); finish(false); } }
  }
}

// Clone a model's scene, swapping named materials for recoloured copies (cached per colour).
function cloneModel(name, recolor, skinned) {
  const g = ASSETS.gltf[name]; if (!g) return null;
  const s = skinned ? THREE.SkeletonUtils.clone(g.scene) : g.scene.clone(true);
  if (recolor) {
    s.traverse((o) => {
      if (!o.isMesh) return;
      const sw = (m) => {
        const c = recolor[m.name]; if (!c) return m;
        const key = name + '|' + m.name + '|' + c;
        let mm = ASSETS.cache[key];
        if (!mm) { mm = m.clone(); if (m.map && m.roughnessMap) tintMaterial(mm, c); else mm.color = new THREE.Color(c); ASSETS.cache[key] = mm; }
        return mm;
      };
      o.material = Array.isArray(o.material) ? o.material.map(sw) : sw(o.material);
    });
  }
  return s;
}
// Painted textures carry a 'rider colour' mask in the red channel of the roughness/metal texture:
// masked pixels are multiplied by the tint, the rest (black panels, white trim, logos) keep their colour.
function tintMaterial(m, hex) {
  const tint = new THREE.Color(hex);
  m.userData.tint = tint;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tintColor = { value: tint };
    sh.fragmentShader = 'uniform vec3 tintColor;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n vec4 sampledDiffuseColor = texture2D( map, vUv );\n float tintMask = 0.0;\n#ifdef USE_ROUGHNESSMAP\n tintMask = texture2D( roughnessMap, vUv ).r;\n#endif\n diffuseColor.rgb *= sampledDiffuseColor.rgb * mix( vec3( 1.0 ), tintColor, tintMask );\n#endif');
  };
  m.customProgramCacheKey = () => 'tr-tint';
  m.needsUpdate = true;
  return m;
}
function findMat(obj, name) { let f = null; obj.traverse((o) => { if (!f && o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m.name === name) f = m; } }); return f; }
function findMeshByMat(obj, name) { let f = null; obj.traverse((o) => { if (!f && o.isMesh && !Array.isArray(o.material) && o.material.name === name) f = o; }); return f; }

const CAR_KINDS = ['sedan', 'hatch', 'suv', 'sedan', 'hatch', 'taxi'];
function makeTrafficGLB(t, i) {
  let kind;
  if (t.type === 'car') kind = CAR_KINDS[(i * 7 + (t.v | 0)) % CAR_KINDS.length];
  else if (t.type === 'rick') kind = 'auto';
  else if (t.type === 'truck') kind = 'truck' + ((t.v | 0) % 3);
  else kind = 'bus';
  const rc = t.type === 'car' && kind !== 'taxi' ? { CarPaint: t.color } : null;
  const near = cloneModel(kind, rc), far = ASSETS.gltf[kind + '_far'] ? cloneModel(kind + '_far', rc) : null;
  const root3 = new THREE.Group(); root3.add(near);
  if (far) { far.visible = false; root3.add(far); }
  root3.userData = { wheels: [], wr: 1, near: near, far: far };
  return root3;
}

/* A rider on a bike, both from Blender. The rider is skinned and animated. */
function makeRacerGLB(style, opts, glowTex) {
  const T3 = THREE, lo = !!opts.lo, cop = !!style.cop;
  const root3 = new T3.Group();
  const bikeG = new T3.Group(); root3.add(bikeG);
  const bike = cloneModel(cop ? 'policebike_lo' : lo ? 'bike_lo' : 'bike', cop ? null : { BodyPaint: style.bike });
  bikeG.add(bike);
  // far level of detail for rivals and police (swapped by distance in the renderer)
  let bikeFar = null;
  if (!lo && opts.shadowProxy && ASSETS.gltf.bike_far) {
    // the detailed player bike casts its shadow through the cheap far model (invisible in the colour pass)
    const proxy = cloneModel('bike_far'), pm = new T3.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    proxy.traverse((o) => { if (o.isMesh) { o.material = pm; o.userData.shadowProxy = true; } });
    bikeG.add(proxy); root3.userData_proxy = proxy;
  }
  if (lo && ASSETS.gltf[cop ? 'policebike_far' : 'bike_far']) { bikeFar = cloneModel(cop ? 'policebike_far' : 'bike_far', cop ? null : { BodyPaint: style.bike }); bikeFar.visible = false; bikeG.add(bikeFar); }
  // rider pivots at the hips so the crash tumble looks right
  const HIP = 1.0, riderG = new T3.Group(); riderG.position.y = HIP; root3.add(riderG);
  const rider = cloneModel(lo ? 'rider_lo' : 'rider', { Suit: style.jacket, Jacket: style.jacket, Helmet: style.helmet }, true);
  rider.position.y = -HIP; riderG.add(rider);
  const wheels = []; for (const b_ of [bike, bikeFar]) if (b_) for (const n of ['WheelF', 'WheelR']) { const w = b_.getObjectByName(n); if (w) wheels.push(w); }
  // weapons held in the hands (hidden until used)
  const wood = new T3.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.6 });
  const steel = new T3.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.3, metalness: 0.9 });
  const hands = {};
  for (const s of ['L', 'R']) {
    const hb = rider.getObjectByName('hand' + s);
    const bat = new T3.Mesh(new T3.CylinderGeometry(0.028, 0.05, 0.8, 8), wood); bat.position.y = 0.42; bat.visible = false;
    const chain = new T3.Group();
    for (let i = 0; i < 7; i++) { const l = new T3.Mesh(new T3.TorusGeometry(0.035, 0.011, 4, 8), steel); l.position.y = 0.08 + i * 0.065; l.rotation.y = i % 2 ? Math.PI / 2 : 0; chain.add(l); }
    chain.visible = false;
    const rod = new T3.Mesh(new T3.CylinderGeometry(0.018, 0.018, 1.0, 6), steel); rod.position.y = 0.5; rod.visible = false;
    const lathi = new T3.Mesh(new T3.CylinderGeometry(0.02, 0.024, 1.15, 6), new T3.MeshStandardMaterial({ color: '#b08a4a', roughness: 0.7 })); lathi.position.y = 0.55; lathi.visible = false;
    if (hb) { hb.add(bat); hb.add(chain); hb.add(rod); hb.add(lathi); }
    hands[s] = { bat: bat, chain: chain, rod: rod, lathi: lathi };
  }
  // animation
  const g = ASSETS.gltf[lo ? 'rider_lo' : 'rider'], mixer = new T3.AnimationMixer(rider), acts = {};
  for (const c of g.animations) acts[c.name] = mixer.clipAction(c);
  for (const k in acts) if (k !== 'Ride') { acts[k].setLoop(T3.LoopOnce, 1); acts[k].clampWhenFinished = true; }
  acts.Ride.play();
  let siren = null;
  if (cop) {
    const r = findMat(bike, 'Siren_R'), b = findMat(bike, 'Siren_B'), sm = findMeshByMat(bike, 'Siren_R');
    const glow = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, color: '#ff3030', transparent: true, depthWrite: false, blending: T3.AdditiveBlending }));
    glow.scale.set(1.6, 1.6, 1);
    if (sm) { bike.updateMatrixWorld(true); sm.geometry.computeBoundingBox(); const c = sm.geometry.boundingBox.getCenter(new T3.Vector3()); sm.localToWorld(c); glow.position.copy(c); } else glow.position.set(0, 1.3, 0.6);
    bikeG.add(glow);
    siren = { r: r, b: b, glow: glow };
  }
  // bones and their bind pose (the seated riding pose), used to pose riders off the bike for the podium
  const bones = {}, restQ = {};
  rider.traverse((o) => { if (o.isBone) { bones[o.name] = o; restQ[o.name] = o.quaternion.clone(); } });
  root3.userData = { glb: true, bikeNear: bike, bikeFar: bikeFar, wheels: wheels, wr: 0.31, bikeG: bikeG, riderG: riderG, rider: rider, mixer: mixer, acts: acts, hands: hands, siren: siren, os: null, osHold: false, prevAtk: 9, prevHit: 0, tauntCd: 2 + Math.random() * 4, bones: bones, restQ: restQ };
  return root3;
}

/* highway-patrol SUV built in Blender (tools/blender/vehicles2.py policejeep); falls back to a recoloured SUV */
function makePoliceJeepGLB(mat, glowTex, letterTex) {
  const T3 = THREE, root3 = new T3.Group();
  if (!ASSETS.gltf.policejeep) {
    const near = cloneModel('suv', { CarPaint: '#f2f2f2' }); root3.add(near);
    const box = new T3.Box3().setFromObject(near), size = box.getSize(new T3.Vector3());
    addPoliceKit(root3, mat, glowTex, box.max.y, size.x, size.z, null, letterTex);
    root3.userData = Object.assign(root3.userData, { wheels: [], wr: 1, near: near, far: null, jeep: true });
    return root3;
  }
  const near = cloneModel('policejeep'), far = ASSETS.gltf.policejeep_far ? cloneModel('policejeep_far') : null;
  root3.add(near); if (far) { far.visible = false; root3.add(far); }
  // each jeep flashes on its own: give it private copies of the light-bar materials
  const red = new T3.MeshStandardMaterial({ color: '#ff2a20', emissive: '#ff1010', emissiveIntensity: 3, roughness: 0.2 });
  const blue = new T3.MeshStandardMaterial({ color: '#2050ff', emissive: '#1040ff', emissiveIntensity: 0.2, roughness: 0.2 });
  let barTop = 1.9;
  for (const m3 of [near, far]) if (m3) m3.traverse((o) => {
    if (!o.isMesh) return;
    const sw = (m) => m.name === 'Siren_R' ? red : m.name === 'Siren_B' ? blue : m;
    if (/Siren/.test(Array.isArray(o.material) ? '' : o.material.name)) { o.geometry.computeBoundingBox(); barTop = Math.max(barTop, o.geometry.boundingBox.max.y); }
    o.material = Array.isArray(o.material) ? o.material.map(sw) : sw(o.material);
  });
  const glow = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, color: '#ff3030', transparent: true, depthWrite: false, blending: T3.AdditiveBlending }));
  glow.scale.set(3.4, 3.4, 1); glow.position.set(0, barTop + 0.1, 0.15); root3.add(glow);
  root3.userData = { wheels: [], wr: 1, near: near, far: far, jeep: true, siren: { r: red, b: blue, glow: glow } };
  return root3;
}
/* ---- Blender nature pack (tools/blender/nature.py): palms, trees, bushes, grass, rocks ---- */
const WIND = { value: 0 };   // seconds, advanced by the renderer
function floatAttr(a) {
  if (a.array instanceof Float32Array && !a.normalized) return a.clone();
  const n = a.count, k = a.itemSize, out = new Float32Array(n * k), g = ['getX', 'getY', 'getZ', 'getW'];
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) out[i * k + j] = a[g[j]](i);
  return new THREE.BufferAttribute(out, k);
}
const natureMats = new Map();
function natureMaterial(m) {
  if (natureMats.has(m)) return natureMats.get(m);
  let out = m;
  if (/Leaves/.test(m.name)) {
    // alpha-cutout foliage that sways a little in the wind (more at the tips, phase from the instance position)
    out = m.clone(); out.transparent = false; out.alphaTest = 0.42; out.side = THREE.DoubleSide; out.depthWrite = true;
    out.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = WIND;
      sh.vertexShader = 'uniform float uWind;\nattribute float aSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = floor(position * 0.25);
        float sway = max(aSway - 0.4, 0.0) * 0.035;
        transformed.x += sin(uWind * 1.6 + ip.x * 0.37 + ip.z * 0.21 + position.y * 0.6) * sway;
        transformed.z += cos(uWind * 1.3 + ip.z * 0.31 + position.x * 0.8) * sway * 0.7;`);
    };
    out.customProgramCacheKey = () => 'tr-leaves';
  } else if (/Rock/.test(m.name)) { out = m.clone(); out.vertexColors = true; out.side = THREE.FrontSide; }
  else { out = m.clone(); out.side = THREE.FrontSide; }
  out.userData.keep = true; natureMats.set(m, out);
  return out;
}
const natureCache = {};
function natureProto(name, pack) {
  const ck = (pack || 'nature') + '|' + name;
  if (natureCache[ck]) return natureCache[ck];
  const g = ASSETS.gltf[pack || 'nature']; if (!g) return null;
  const root = g.scene.getObjectByName(name); if (!root) return null;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = new THREE.BufferGeometry();
    for (const k in o.geometry.attributes) geo.setAttribute(k, floatAttr(o.geometry.attributes[k]));
    if (o.geometry.index) geo.setIndex(o.geometry.index.clone());
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    geo.computeBoundingSphere(); geo.userData.keep = true;
    parts.push({ geo: geo, mat: natureMaterial(o.material), leaves: /Leaves/.test(o.material.name) });
  });
  return (natureCache[ck] = parts);
}

/* road-work props from Blender; procedural fallback otherwise */
function makeHazardModel(mat, type) {
  const name = type === 'barrel' ? 'drum' : type;
  if (ASSETS.ready && ASSETS.gltf[name]) { const g = new THREE.Group(); g.add(cloneModel(name)); return g; }
  if (type === 'cone') return makeCone(mat);
  if (type === 'barricade') { const g = new THREE.Group(); addMesh(g, new THREE.BoxGeometry(1.6, 0.25, 0.05), mat('#d0201a'), 0, 0.95, 0); addMesh(g, new THREE.BoxGeometry(1.6, 0.25, 0.05), mat('#f2f2f2'), 0, 0.6, 0); for (const x of [-0.72, 0.72]) addMesh(g, new THREE.BoxGeometry(0.05, 1.05, 0.5), mat('#e8e8e8'), x, 0.52, 0); return g; }
  return makeBarrel(mat);
}

// Start a one-shot clip. hold=true keeps the last frame (used for the crash).
function playOneShot(d, name, hold) {
  const a = d.acts[name]; if (!a) return;
  if (d.os && d.os !== a) { d.os.stop(); }
  a.reset(); a.setEffectiveWeight(0); a.play();
  d.os = a; d.osHold = !!hold;
}
function updateRacerAnim(d, dt) {
  const ride = d.acts.Ride;
  if (d.os) {
    const a = d.os, dur = a.getClip().duration, t = a.time;
    let w = Math.min(1, t / 0.07 + 0.15);
    if (!d.osHold) w = Math.min(w, Math.max(0, (dur - t) / 0.12));
    if (!d.osHold && t >= dur - 0.001) { a.stop(); d.os = null; w = 0; }
    if (d.os) a.setEffectiveWeight(w);
    ride.setEffectiveWeight(1 - w);
  } else ride.setEffectiveWeight(1);
  d.mixer.update(dt);
}

// Colour pipeline shared by the app and the tests: linear lighting, sRGB output, filmic tone mapping.
function configureGL(gl) {
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
  gl.outputEncoding = THREE.sRGBEncoding;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.05;
}
