/* ---------- 3D renderer ---------- */
function createRenderer3D(env, R, W, H) {
  const T3 = THREE, make = env.makeCanvas, def = R.track.def, pal = def.pal, th = THEME3[def.id], q = env.quality;
  const gl = env.gl3, scene = new T3.Scene(), mat = Mats(), path = buildPath3(R.track), N = path.N;
  const isPOT = (n) => (n & (n - 1)) === 0;
  const potCanvas = (cv) => {
    if (isPOT(cv.width) && isPOT(cv.height)) return cv;
    const w = Math.min(2048, 1 << Math.round(Math.log2(cv.width))), h = Math.min(1024, 1 << Math.round(Math.log2(cv.height)));
    return mk(make, w, h, (c) => c.drawImage(cv, 0, 0, w, h));
  };
  const tex = (cv, rep) => { const t = env.tex(potCanvas(cv)); if (rep) { t.wrapS = t.wrapT = T3.RepeatWrapping; } t.anisotropy = env.aniso || 1; t.needsUpdate = true; return t; };
  const rnd = makeRng(41 + R.trackIndex);
  const fogFar = th.fogFar * (q ? 1 : 0.7), viewUnits = fogFar / M3;
  scene.fog = new T3.Fog(pal.fog, th.fogNear, fogFar);
  const camera = new T3.PerspectiveCamera(62, W / H, 0.1, 2600);
  const glowTex = tex(texGlow(make, 'rgba(255,255,255,1)'));

  /* lights */
  scene.add(new T3.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiI));
  scene.add(new T3.AmbientLight('#ffffff', 0.32));
  const sun = new T3.DirectionalLight(th.sun, th.sunI);
  const sunDir = new T3.Vector3(Math.cos(th.sunEl) * Math.sin(th.sunAz), Math.sin(th.sunEl), -Math.cos(th.sunEl) * Math.cos(th.sunAz)).normalize();
  if (q) {
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 260;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  }
  scene.add(sun); scene.add(sun.target);

  /* sky, sun, clouds, distant scenery: all follow the camera */
  const skyGroup = new T3.Group(); scene.add(skyGroup);
  const skyGeo = new T3.SphereGeometry(2200, 24, 18), sp = skyGeo.attributes.position, sc3 = new Float32Array(sp.count * 3);
  const cTop = new T3.Color(pal.skyTop), cMid = new T3.Color(pal.skyMid), cBot = new T3.Color(pal.skyBot), cFog = new T3.Color(pal.fog), tmpC = new T3.Color();
  for (let i = 0; i < sp.count; i++) {
    const s = sp.getY(i) / 2200;
    if (s > 0.3) tmpC.copy(cMid).lerp(cTop, Math.min(1, (s - 0.3) / 0.6)); else if (s > 0) tmpC.copy(cFog).lerp(cBot, s / 0.08 > 1 ? 1 : s / 0.08).lerp(cMid, Math.max(0, (s - 0.08) / 0.22)); else tmpC.copy(cFog);
    sc3[i * 3] = tmpC.r; sc3[i * 3 + 1] = tmpC.g; sc3[i * 3 + 2] = tmpC.b;
  }
  skyGeo.setAttribute('color', new T3.BufferAttribute(sc3, 3));
  skyGroup.add(new T3.Mesh(skyGeo, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.BackSide, fog: false, depthWrite: false, toneMapped: false })));
  const sunSprite = new T3.Sprite(new T3.SpriteMaterial({ map: tex(texGlow(make, pal.sun)), color: pal.sun, fog: false, depthWrite: false, transparent: true, toneMapped: false }));
  sunSprite.scale.set(def.id === 'kerala' ? 300 : 420, def.id === 'kerala' ? 300 : 420, 1); sunSprite.position.copy(sunDir.clone().multiplyScalar(1900)); skyGroup.add(sunSprite);
  const cloudTex = tex(texCloud(make));
  for (let i = 0; i < (def.id === 'kerala' ? 40 : 18); i++) {
    const a = rnd() * Math.PI * 2, r = 1300 + rnd() * 600;
    const s = new T3.Sprite(new T3.SpriteMaterial({ map: cloudTex, color: def.id === 'kerala' ? '#9aa6b0' : '#ffffff', fog: false, depthWrite: false, transparent: true, opacity: def.id === 'kerala' ? 0.9 : 0.6, toneMapped: false }));
    s.position.set(Math.cos(a) * r, 180 + rnd() * 360, Math.sin(a) * r); s.scale.set(500 + rnd() * 400, 200 + rnd() * 120, 1); skyGroup.add(s);
  }
  const bd = buildBackdrop(make, def, 900, 540, makeRng(5));
  const ring = (cv, radius, height, yoff, rep) => {
    const t = tex(cv, true); t.repeat.set(rep, 1);
    const m = new T3.Mesh(new T3.CylinderGeometry(radius, radius, height, 72, 1, true), new T3.MeshBasicMaterial({ map: t, transparent: true, side: T3.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    m.position.y = yoff; skyGroup.add(m); return m;
  };
  ring(bd.far, 2000, 520, 160, 3); ring(bd.mid, 1800, 330, 70, 4);
  // image-based lighting from the track's sky so paint, chrome and glass reflect it
  let envTex = null;
  try {
    const pm = new T3.PMREMGenerator(gl), es = new T3.Scene(), eg = new T3.SphereGeometry(10, 32, 16), ep = eg.attributes.position, ec = new Float32Array(ep.count * 3);
    const cGround = new T3.Color(th.ground === 'water' ? '#2c5a6e' : th.ground === 'sand' ? '#9c7a4a' : th.ground === 'rock' ? '#5d5548' : '#3f6a3a');
    for (let i = 0; i < ep.count; i++) {
      const s = ep.getY(i) / 10;
      if (s > 0.05) tmpC.copy(cMid).lerp(cTop, Math.min(1, (s - 0.05) / 0.7)); else if (s > -0.05) tmpC.copy(cFog); else tmpC.copy(cGround).multiplyScalar(0.7);
      ec[i * 3] = tmpC.r; ec[i * 3 + 1] = tmpC.g; ec[i * 3 + 2] = tmpC.b;
    }
    eg.setAttribute('color', new T3.BufferAttribute(ec, 3));
    es.add(new T3.Mesh(eg, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.BackSide })));
    const sunBlob = new T3.Mesh(new T3.SphereGeometry(0.9, 12, 8), new T3.MeshBasicMaterial({ color: new T3.Color(th.sun).multiplyScalar(6) }));
    sunBlob.position.copy(sunDir).multiplyScalar(8); es.add(sunBlob);
    envTex = pm.fromScene(es, 0.02).texture; scene.environment = envTex; pm.dispose(); eg.dispose();
  } catch (e) { envTex = null; }

  /* road, kerbs, ground */
  const roadMat = mat('#ffffff', { map: tex(texAsphalt(make, th.wet), true), r: th.wet ? 0.45 : 0.92, m: th.wet ? 0.15 : 0 });
  const kerbMat = mat('#ffffff', { map: tex(texKerb(make), true), r: 0.8 });
  const groundTex = th.ground === 'sand' ? texGround(make, '#d9a45b', '#e8c07e', 'sand') : th.ground === 'rock' ? texGround(make, '#6e6455', '#857a68', 'rock') : th.ground === 'grass' ? texGround(make, '#2f7d3f', '#3f9a4f', 'grass') : texWater(make);
  const groundMat = mat('#ffffff', { map: tex(groundTex, true), r: th.ground === 'water' ? 0.3 : 0.95, m: th.ground === 'water' ? 0.1 : 0 });
  const wallMat = mat('#c9c6bf', { ds: true, r: 0.9 });
  const lats = [-320, -150, -70, -32, -16, -HALF - 0.9];
  const chunks = [];
  for (let i0 = 0; i0 < N; i0 += CHUNK) {
    const i1 = Math.min(N, i0 + CHUNK), grp = new T3.Group();
    const add = (geo, m, shadowRecv) => { const me = new T3.Mesh(geo, m); me.receiveShadow = !!shadowRecv && q > 0; grp.add(me); return me; };
    add(ribbonGeo(path, i0, i1, () => [[-HALF, 0], [HALF, 0]], 0, 12), roadMat, true);
    add(ribbonGeo(path, i0, i1, () => [[-HALF - 0.9, 0.02], [-HALF, 0.02]], 0, 4), kerbMat, true);
    add(ribbonGeo(path, i0, i1, () => [[HALF, 0.02], [HALF + 0.9, 0.02]], 0, 4), kerbMat, true);
    if (th.ground === 'water') {
      add(ribbonGeo(path, i0, i1, () => lats.map((l) => [l, -7]), 12, 12), groundMat);
      add(ribbonGeo(path, i0, i1, () => lats.map((l) => [-l, -7]).reverse(), 12, 12), groundMat);
      add(ribbonGeo(path, i0, i1, () => [[-HALF - 1.3, -1.6], [-HALF - 1.3, 1.0], [-HALF - 0.9, 1.0], [-HALF - 0.9, 0.02]], 0, 6), wallMat, true);
      add(ribbonGeo(path, i0, i1, () => [[HALF + 0.9, 0.02], [HALF + 0.9, 1.0], [HALF + 1.3, 1.0], [HALF + 1.3, -1.6]], 0, 6), wallMat, true);
    } else {
      add(ribbonGeo(path, i0, i1, (i) => lats.map((l) => [l, terrainLift(th.terrain, i, l) - 0.04]), 10, 10), groundMat, true);
      add(ribbonGeo(path, i0, i1, (i) => lats.map((l) => [-l, terrainLift(th.terrain, i, -l) - 0.04]).reverse(), 10, 10), groundMat, true);
    }
    scene.add(grp); chunks.push({ i0: i0, i1: i1, grp: grp });
  }
  // finish line checker
  const checker = mk(make, 256, 64, (c) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; c.fillRect(x * 16, y * 16, 16, 16); } });
  scene.add(new T3.Mesh(ribbonGeo(path, R.track.F, R.track.F + 3, () => [[-HALF, 0.03], [HALF, 0.03]], 0, 2.1), mat('#ffffff', { map: tex(checker) })));
  // start and finish gates
  for (const s of R.track.segs) if (s.gate) {
    const gp = path.at(s.index * SEG, 0), g = new T3.Group();
    const banner = mk(make, 512, 64, (c) => {
      if (s.gate === 'finish') { for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; c.fillRect(x * 16, y * 16, 16, 16); } c.fillStyle = '#ff6a00'; c.fillRect(176, 8, 160, 48); c.fillStyle = '#fff'; c.font = 'italic 900 40px ' + FONT; c.textAlign = 'center'; c.fillText('FINISH', 256, 48); }
      else { c.fillStyle = '#ff6a00'; c.fillRect(0, 0, 512, 64); c.fillStyle = '#fff'; c.font = 'italic 900 46px ' + FONT; c.textAlign = 'center'; c.fillText('TARMAC  RIOT', 256, 50); }
    });
    const bm = mat('#ffffff', { map: tex(banner), r: 0.7 }), post = mat('#2b2d33', { r: 0.5, m: 0.5 });
    addMesh(g, new T3.BoxGeometry(0.6, 7.4, 0.6), post, -HALF - 1.6, 3.7, 0); addMesh(g, new T3.BoxGeometry(0.6, 7.4, 0.6), post, HALF + 1.6, 3.7, 0);
    addMesh(g, new T3.BoxGeometry(2 * HALF + 3.8, 1.7, 0.35), [post, post, post, post, bm, bm].length ? bm : bm, 0, 7.0, 0);
    g.position.set(gp.x, gp.y, gp.z); g.rotation.y = -gp.h; g.traverse((o) => { if (o.isMesh) o.castShadow = q > 0; }); scene.add(g);
  }

  /* roadside scenery, instanced per chunk */
  const adTex = [['CHAI', '\u20B95 ONLY', '#e63946'], ['FRESH', 'JUICE', '#2a9d8f'], ['TARMAC', 'RIOT', '#f4a261'], ['RIDE', 'SAFE', '#3a86ff'], ['BIG', 'SALE 50%', '#8338ec'], ['HORN', 'PLEASE', '#ffbe0b']].map((a) => tex(mk(make, 256, 128, (c) => {
    c.fillStyle = a[2]; c.fillRect(0, 0, 256, 128); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 100, 256, 28);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = 'italic 900 52px ' + FONT; c.fillText(a[0], 128, 62); c.font = 'italic 900 30px ' + FONT; c.fillText(a[1], 128, 104);
  })));
  const protos = {};
  const getProto = (t, v) => {
    const key = t + '|' + v; if (protos[key]) return protos[key];
    let p;
    if (t === 'palm') p = protoPalm(mat, '#3e9b4f'); else if (t === 'coconut') p = protoPalm(mat, '#4aa84a');
    else if (t === 'lamp') p = protoLamp(mat); else if (t === 'billboard') p = protoBillboard(mat, adTex[v % 6]);
    else if (t === 'building') p = protoBuilding(mat, make, (cv) => tex(cv), v, rnd); else if (t === 'rock') p = protoRock(mat, def.id === 'ladakh', 10 + v);
    else if (t === 'flags') p = protoFlags(mat); else if (t === 'chorten') p = protoChorten(mat); else if (t === 'pole') p = protoPole(mat);
    else if (t === 'cactus') p = protoCactus(mat); else if (t === 'fort') p = protoFort(mat); else if (t === 'bush') p = protoBush(mat, pal.dry);
    else if (t === 'house') p = protoHouse(mat, v); else if (t === 'marker') p = protoMarker(mat); else if (t === 'pylon') p = protoPylon(mat);
    protos[key] = p; return p;
  };
  const variants = { building: 4, billboard: 6, rock: 3, house: 4 };
  const dummy = new T3.Object3D(), tmp = {};
  for (const ch of chunks) {
    const lists = new Map();
    const place = (t, v, zw, latM, yaw, s) => {
      const k = t + '|' + v; if (!lists.has(k)) lists.set(k, []);
      const lat = latM / HALF, pp = path.at(zw, lat, tmp);
      const ground = th.ground === 'water' ? 0 : terrainLift(th.terrain, Math.floor(zw / SEG), latM);
      dummy.position.set(pp.x, pp.y + ground, pp.z); dummy.rotation.set(0, -pp.h + yaw, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
      lists.get(k).push(dummy.matrix.clone());
    };
    for (let i = ch.i0; i < ch.i1; i++) {
      const seg = R.track.segs[i];
      for (const o of seg.sprites) {
        const side = o.off < 0 ? Math.PI : 0;
        if (def.id === 'sealink') {
          if (!FAR_TYPES[o.t]) place('lamp', 0, i * SEG, sign(o.off) * (HALF + 1.1), side, 1);
          continue;
        }
        const jitter = o.t === 'palm' || o.t === 'coconut' || o.t === 'rock' || o.t === 'bush' || o.t === 'cactus';
        const v = variants[o.t] ? o.v % variants[o.t] : 0;
        place(o.t, v, i * SEG, o.off * HALF, side + (jitter ? (o.v * 1.7) % 6.28 : 0), jitter ? 0.8 + ((o.v * 37) % 10) / 20 : 1);
      }
      if (def.id === 'sealink' && (i === Math.floor(N * 0.3) || i === Math.floor(N * 0.62))) place('pylon', 0, i * SEG, 0, 0, 1);
    }
    for (const [k, ms] of lists) {
      const [t, v] = k.split('|');
      for (const part of getProto(t, +v)) {
        const im = new T3.InstancedMesh(part.geo, part.mat, ms.length);
        ms.forEach((m, j) => im.setMatrixAt(j, m)); im.instanceMatrix.needsUpdate = true;
        im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false; // chunks are culled by distance instead
        ch.grp.add(im);
      }
    }
  }

  /* moving things */
  const carCols = {}, truckTex = {};
  const rearTruck = (v) => truckTex['r' + v] || (truckTex['r' + v] = tex(mk(make, 256, 256, (c) => {
    const cols = ['#e63946', '#f4a261', '#2a9d8f', '#8338ec']; c.fillStyle = cols[v % 4]; c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#f2b705'; c.fillRect(0, 196, 256, 22); c.fillStyle = '#1fa97a'; c.fillRect(0, 218, 256, 14); c.fillStyle = '#d9382b'; c.fillRect(0, 232, 256, 24);
    c.fillStyle = 'rgba(255,255,255,.92)'; c.fillRect(24, 70, 208, 70); c.fillStyle = '#c0261b'; c.textAlign = 'center';
    const txt = ['HORN OK PLEASE', 'BUDDY WAIT', 'SAFE JOURNEY', 'MAA KA AASHIRVAD'][v % 4]; let fs = 34; c.font = 'italic 900 ' + fs + 'px ' + FONT; while (c.measureText(txt).width > 196) { fs--; c.font = 'italic 900 ' + fs + 'px ' + FONT; } c.fillText(txt, 128, 118);
    c.fillStyle = '#ffffff'; c.font = 'bold 18px ' + FONT; c.fillText('RJ 14 GA 4421', 128, 182);
  })));
  const sideTruck = (v) => truckTex['s' + v] || (truckTex['s' + v] = tex(mk(make, 256, 128, (c) => {
    const cols = ['#e63946', '#f4a261', '#2a9d8f', '#8338ec']; c.fillStyle = cols[v % 4]; c.fillRect(0, 0, 256, 128);
    c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 3; for (let x = 0; x < 256; x += 22) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 98); c.stroke(); }
    c.fillStyle = '#f2b705'; c.fillRect(0, 98, 256, 10); c.fillStyle = '#1fa97a'; c.fillRect(0, 108, 256, 8); c.fillStyle = '#d9382b'; c.fillRect(0, 116, 256, 12);
  })));
  const busSide = tex(mk(make, 512, 128, (c) => { c.fillStyle = '#c62d22'; c.fillRect(0, 0, 512, 128); c.fillStyle = '#f2f2f2'; c.fillRect(0, 70, 512, 18); for (let x = 10; x < 500; x += 46) { c.fillStyle = '#17222d'; c.fillRect(x, 14, 38, 48); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x, 14, 12, 48); } c.fillStyle = '#fff'; c.font = 'italic 900 20px ' + FONT; c.fillText('STATE TRANSPORT', 150, 112); }));
  const busRear = tex(mk(make, 256, 256, (c) => { c.fillStyle = '#c62d22'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#17222d'; c.fillRect(24, 30, 208, 90); c.fillStyle = '#ffb300'; c.fillRect(70, 8, 116, 18); c.fillStyle = '#222'; c.font = 'bold 14px ' + FONT; c.textAlign = 'center'; c.fillText('PUNE - GOA', 128, 22); c.fillStyle = '#f2f2f2'; c.fillRect(0, 150, 256, 30); c.fillStyle = '#f2f2f2'; c.fillRect(88, 196, 80, 24); }));
  const truckCols = ['#2f6fb5', '#c0392b', '#e67e22', '#16a085'];
  const useGLB = ASSETS.ready;
  const traffic3 = R.traffic.map((t, i) => {
    let g;
    if (useGLB) g = makeTrafficGLB(t, i);
    else if (t.type === 'car') g = makeCar(mat, t.color);
    else if (t.type === 'rick') g = makeRick(mat);
    else if (t.type === 'truck') g = makeTruck(mat, truckCols[t.v % 4], rearTruck(t.v), sideTruck(t.v));
    else g = makeBus(mat, busSide, busRear);
    g.traverse((o) => { if (o.isMesh) o.castShadow = q > 0; }); g.visible = false; scene.add(g); return g;
  });
  const shadowed = (m) => { m.traverse((o) => { if (o.isMesh) o.castShadow = q > 0; }); return m; };
  const racerModel = (style, lo) => shadowed(useGLB ? makeRacerGLB(style, { lo: lo }, glowTex) : makeRider(mat, style, glowTex));
  const racers3 = R.rivals.map((r) => { const m = racerModel(r.style, true); m.visible = false; scene.add(m); return m; });
  const player3 = racerModel(Object.assign({}, PLAYER_STYLE, { bike: R.stats.color }), !q); scene.add(player3);
  const cops3 = [0, 1, 2].map(() => { const m = racerModel(COP_STYLE, true); m.visible = false; scene.add(m); return m; });
  const pick3 = R.pickups.map((k) => { const m = makePickup(mat, k.type, glowTex); m.visible = false; scene.add(m); return m; });
  const haz3 = R.hazards.map((h) => { const m = h.type === 'cone' ? makeCone(mat) : makeBarrel(mat); m.traverse((o) => { if (o.isMesh) o.castShadow = q > 0; }); m.visible = false; scene.add(m); return m; });

  const overlay = createOverlay(R, W, H);
  const camPos = new T3.Vector3(), camLook = new T3.Vector3(), up = new T3.Vector3(0, 1, 0), proj = new T3.Vector3();
  let lastT = R.time, first = true, zoom = 0;
  const P = {};

  const HIP = 1.0;
  function poseRacerGLB(m, r, dt, time) {
    path.at(r.z, r.x, P);
    const d = m.userData, B = d.bikeG, G = d.riderG, p = R.player;
    m.position.set(P.x, P.y, P.z); m.rotation.set(0, -P.h, 0);
    if (r.state === 'wipe') {
      if (!d.wiping) { d.wiping = true; d.wdir = r.x > 0 ? 1 : -1; playOneShot(d, 'Fall', true); for (const s in d.hands) { d.hands[s].bat.visible = d.hands[s].chain.visible = false; } }
      const t = r.wipeT, k = Math.min(1, t / 0.35), dir = d.wdir;
      // bike drops on its side and slides, slowly spinning
      B.rotation.set(0, dir * 1.1 * (1 - Math.exp(-t * 1.4)), dir * k * 1.42, 'YXZ'); B.position.set(dir * 0.3 * k, 0.33 * k, 0);
      // rider is thrown forward over the bars, tumbles, lands on his back and slides
      const fl = Math.min(t, 0.75);
      const y = t < 0.75 ? HIP + 2.2 * fl - 4.3 * fl * fl : 0.24;
      const z = t < 0.75 ? -5.5 * t : -(4.125 + 2.6 * (1 - Math.exp(-(t - 0.75) * 2.5)));
      G.position.set(dir * 0.9 * Math.min(1, t / 0.75), y, z);
      G.rotation.set(t < 0.75 ? -t * 6.283 : -4.712, dir * 0.5 * Math.min(1, t), t < 0.75 ? dir * t * 0.8 : dir * 0.6, 'YXZ');
    } else {
      if (d.wiping) { d.wiping = false; if (d.os) { d.os.stop(); d.os = null; } }
      const roll = -r.lean * 0.42;
      B.rotation.set(0, 0, roll); B.position.set(0, 0, 0);
      G.rotation.set(0, 0, roll); G.position.set(-HIP * Math.sin(roll), HIP * Math.cos(roll), 0);
      const atk = r.isPlayer ? r.punchT : r.atkT, side = r.isPlayer ? r.punchSide : r.atkSide, hitN = r.hitN || 0;
      if (atk < d.prevAtk && atk < 0.25) {
        const S = side > 0 ? 'R' : 'L', w = r.weapon ? r.weapon.type : null;
        playOneShot(d, w ? 'Swing' + S : !r.isPlayer && Math.random() < 0.33 ? 'Kick' + S : 'Punch' + S);
        d.wpn = w; d.wpnSide = S;
      } else if (hitN !== d.prevHit) playOneShot(d, (r.hitSide || 1) > 0 ? 'HitR' : 'HitL');
      else if (!r.isPlayer && !d.os) {
        d.tauntCd -= dt;
        if (d.tauntCd < 0) { d.tauntCd = 5 + Math.random() * 9; if (Math.abs(r.z - p.z) < 2600 && p.state === 'ride') playOneShot(d, 'Taunt'); }
      }
      d.prevAtk = atk; d.prevHit = hitN;
      const swinging = d.os && /^Swing/.test(d.os.getClip().name);
      for (const s in d.hands) { const h = d.hands[s], on = swinging && d.wpnSide === s; h.bat.visible = on && d.wpn === 'bat'; h.chain.visible = on && d.wpn === 'chain'; }
    }
    updateRacerAnim(d, dt);
    const spin = (r.speed * M3 * dt) / d.wr; for (const w of d.wheels) w.rotation.x -= spin;
    if (d.siren) { const on = Math.floor(time * 6) % 2; if (d.siren.r) d.siren.r.emissiveIntensity = on ? 4 : 0.2; if (d.siren.b) d.siren.b.emissiveIntensity = on ? 0.2 : 4; d.siren.glow.material.color.set(on ? '#ff3030' : '#3060ff'); }
  }
  function poseRacer(m, r, dt, time) {
    if (m.userData.glb) { poseRacerGLB(m, r, dt, time); return; }
    path.at(r.z, r.x, P);
    const d = m.userData;
    m.position.set(P.x, P.y, P.z);
    let yaw = -P.h, roll = -r.lean * 0.42, pitch = 0, lift = 0;
    if (r.state === 'wipe') {
      if (r.wipeT < 0.6) { const k = r.wipeT / 0.6; roll = (r.x > 0 ? 1 : -1) * k * 5.5; pitch = -k * 2.2; lift = Math.sin(k * Math.PI) * 1.3; }
      else { roll = (r.x > 0 ? 1 : -1) * 1.45; lift = 0.05; }
    }
    m.rotation.set(pitch, yaw, roll, 'YXZ'); m.position.y += lift + (r.state === 'wipe' && r.wipeT >= 0.6 ? 0 : 0);
    if (r.state === 'wipe' && r.wipeT >= 0.6) { d.rider.position.set((r.x > 0 ? 1 : -1) * 0.9, -0.55, 0.6); d.rider.rotation.set(0, 0, 0.3); } else { d.rider.position.set(0, 0, 0); d.rider.rotation.set(0, 0, 0); }
    const spin = (r.speed * M3 * dt) / d.wr; for (const w of d.wheels) w.rotation.x -= spin;
    const atkT = r.isPlayer ? r.punchT : r.atkT, side = r.isPlayer ? r.punchSide : r.atkSide, weapon = r.weapon ? r.weapon.type : null;
    for (const a of d.arms) {
      const s = a.userData.side, active = r.state === 'ride' && atkT < 0.3 && side === s;
      const k = active ? Math.sin(Math.min(1, atkT / 0.3) * Math.PI) : 0;
      a.quaternion.copy(a.userData.rest).slerp(a.userData.punch, k);
      a.userData.bat.visible = active && weapon === 'bat'; a.userData.chain.visible = active && weapon === 'chain';
    }
    if (d.siren) { const on = Math.floor(time * 6) % 2; d.siren.r.material.emissiveIntensity = on ? 3 : 0.2; d.siren.b.material.emissiveIntensity = on ? 0.2 : 3; d.siren.glow.material.color.set(on ? '#ff3030' : '#3060ff'); }
  }

  return {
    W: W, H: H,
    resize(w, h) { W = w; H = h; camera.aspect = w / h; camera.updateProjectionMatrix(); },
    draw(ctx, R, o) {
      o = o || {};
      const dt = Math.min(0.1, Math.max(0, R.time - lastT)); lastT = R.time;
      const p = R.player, pIdx = Math.floor(p.z / SEG), far = pIdx + viewUnits / SEG + CHUNK;
      for (const ch of chunks) ch.grp.visible = ch.i1 >= pIdx - 30 && ch.i0 <= far;
      const dynRange = Math.min(viewUnits, 330 / M3), inView = (z) => z > p.z - 2500 && z < p.z + dynRange;
      R.traffic.forEach((t, i) => {
        const m = traffic3[i]; m.visible = inView(t.z); if (!m.visible) return;
        path.at(t.z, t.x, P); m.position.set(P.x, P.y, P.z); m.rotation.set(0, -P.h, 0);
        const spin = (t.speed * M3 * dt) / m.userData.wr; for (const w of m.userData.wheels) w.rotation.x -= spin;
      });
      const labels = [];
      R.rivals.forEach((r, i) => {
        const m = racers3[i]; m.visible = inView(r.z); if (!m.visible) return; poseRacer(m, r, dt, R.time);
        if (o.hud !== false && r.state === 'ride' && !r.finished && r.z > p.z - 300 && r.z < p.z + 9000) {
          proj.set(m.position.x, m.position.y + 2.4, m.position.z).project(camera);
          if (proj.z < 1) labels.push({ x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * H, text: r.name });
        }
      });
      cops3.forEach((m, i) => { const c = R.cops[i]; m.visible = !!c && inView(c.z); if (m.visible) poseRacer(m, c, dt, R.time); });
      R.pickups.forEach((k, i) => {
        const m = pick3[i]; m.visible = !k.got && inView(k.z); if (!m.visible) return;
        path.at(k.z, k.x, P); m.position.set(P.x, P.y + 1.1 + Math.sin(R.time * 3 + i) * 0.15, P.z); m.userData.inner.rotation.y = R.time * 2.4;
      });
      R.hazards.forEach((h, i) => { const m = haz3[i]; m.visible = h.z > 0 && inView(h.z); if (m.visible) { path.at(h.z, h.x, P); m.position.set(P.x, P.y, P.z); m.rotation.y = -P.h; } });
      poseRacer(player3, p, dt, R.time);
      player3.visible = !(p.inv > 0 && p.state === 'ride' && Math.floor(R.time * 16) % 2);

      // chase camera that follows the road
      // close chase camera (about 4 m behind, 1.9 m up) so the bike and rider fill the frame
      const behind = path.at(p.z - 900, clamp(p.x, -1.9, 1.9), {}), ahead = path.at(p.z + 2800, clamp(p.x, -1.9, 1.9) * 0.9, {});
      const want = new T3.Vector3(behind.x, behind.y + 1.9, behind.z), look = new T3.Vector3(ahead.x, ahead.y + 0.95, ahead.z);
      const k = first ? 1 : 1 - Math.exp(-dt * 11);
      camPos.lerp(want, k); camLook.lerp(look, k); if (first) { camPos.copy(want); camLook.copy(look); first = false; }
      camera.position.copy(camPos);
      if (R.shake > 0.5) camera.position.add(new T3.Vector3((Math.random() - 0.5) * R.shake * 0.012, (Math.random() - 0.5) * R.shake * 0.012, 0));
      camera.up.copy(up); camera.lookAt(camLook); camera.rotateZ(-p.lean * 0.05);
      zoom += ((p.boost ? 1 : 0) - zoom) * Math.min(1, dt * 5);
      camera.fov = 60 + zoom * 12 + (p.speed / MAXSPEED) * 5; camera.updateProjectionMatrix();
      skyGroup.position.set(camPos.x, camPos.y, camPos.z);
      sun.target.position.set(player3.position.x, player3.position.y, player3.position.z);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 120);
      gl.setSize(W, H, false);
      gl.render(scene, camera);
      overlay.draw(ctx, R, dt, { hud: o.hud, labels: labels });
    },
    dispose() {
      if (envTex) envTex.dispose();
      for (const m of [player3].concat(racers3, cops3)) if (m.userData.mixer) m.userData.mixer.stopAllAction();
      scene.traverse((o) => {
        // models shared with ASSETS stay on the GPU between races
        if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) { if (m.userData.keep) continue; if (m.map) m.map.dispose(); m.dispose(); }
      });
    },
  };
}
