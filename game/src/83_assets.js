/* ---------- Blender models (GLB, embedded as base64 by build.js) ---------- */
const ASSETS = { ready: false, gltf: {}, cache: {} };

function b64ToArrayBuffer(s) {
  if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') { const b = Buffer.from(s, 'base64'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
  const bin = atob(s), n = bin.length, u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

// Decode every embedded model. done(true) when all parsed; done(false) if anything is missing or fails.
function loadAssets(env, done) {
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
      for (const p of env.gltfPlugins || []) loader.register(p);
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
        if (!mm) { mm = m.clone(); mm.color = new THREE.Color(c); ASSETS.cache[key] = mm; }
        return mm;
      };
      o.material = Array.isArray(o.material) ? o.material.map(sw) : sw(o.material);
    });
  }
  return s;
}
function findMat(obj, name) { let f = null; obj.traverse((o) => { if (!f && o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m.name === name) f = m; } }); return f; }
function findMeshByMat(obj, name) { let f = null; obj.traverse((o) => { if (!f && o.isMesh && !Array.isArray(o.material) && o.material.name === name) f = o; }); return f; }

const CAR_KINDS = ['sedan', 'hatch', 'suv', 'sedan', 'hatch', 'taxi'];
function makeTrafficGLB(t, i) {
  let g;
  if (t.type === 'car') {
    const kind = CAR_KINDS[(i * 7 + (t.v | 0)) % CAR_KINDS.length];
    g = cloneModel(kind, kind === 'taxi' ? null : { CarPaint: t.color });
  } else if (t.type === 'rick') g = cloneModel('auto');
  else if (t.type === 'truck') g = cloneModel('truck' + ((t.v | 0) % 3));
  else g = cloneModel('bus');
  const root3 = new THREE.Group(); root3.add(g);
  root3.userData = { wheels: [], wr: 1 };
  return root3;
}

/* A rider on a bike, both from Blender. The rider is skinned and animated. */
function makeRacerGLB(style, opts, glowTex) {
  const T3 = THREE, lo = !!opts.lo, cop = !!style.cop;
  const root3 = new T3.Group();
  const bikeG = new T3.Group(); root3.add(bikeG);
  const bike = cloneModel(cop ? 'policebike_lo' : lo ? 'bike_lo' : 'bike', cop ? null : { BodyPaint: style.bike });
  bikeG.add(bike);
  // rider pivots at the hips so the crash tumble looks right
  const HIP = 1.0, riderG = new T3.Group(); riderG.position.y = HIP; root3.add(riderG);
  const rider = cloneModel(lo ? 'rider_lo' : 'rider', { Jacket: style.jacket, Helmet: style.helmet }, true);
  rider.position.y = -HIP; riderG.add(rider);
  const wheels = []; for (const n of ['WheelF', 'WheelR']) { const w = bike.getObjectByName(n); if (w) wheels.push(w); }
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
    if (hb) { hb.add(bat); hb.add(chain); }
    hands[s] = { bat: bat, chain: chain };
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
  root3.userData = { glb: true, wheels: wheels, wr: 0.31, bikeG: bikeG, riderG: riderG, rider: rider, mixer: mixer, acts: acts, hands: hands, siren: siren, os: null, osHold: false, prevAtk: 9, prevHit: 0, tauntCd: 2 + Math.random() * 4 };
  return root3;
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
