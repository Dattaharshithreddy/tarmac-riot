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
  const madeTex = [];   // every texture this renderer creates, so dispose() frees them all (unused variants included)
  const tex = (cv, rep) => { const t = env.tex(potCanvas(cv)); if (rep) { t.wrapS = t.wrapT = T3.RepeatWrapping; } t.anisotropy = env.aniso || 1; t.needsUpdate = true; madeTex.push(t); return t; };
  const rnd = makeRng(41 + R.trackIndex);
  const useGLB = ASSETS.ready;
  const fogFar = th.fogFar * (q ? 1 : 0.75), viewUnits = fogFar / M3;
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
  for (let i = 0; i < (def.id === 'kerala' ? 16 : 10); i++) {
    const a = rnd() * Math.PI * 2, r = 1300 + rnd() * 600;
    const s = new T3.Sprite(new T3.SpriteMaterial({ map: cloudTex, color: def.id === 'kerala' ? '#9aa6b0' : '#ffffff', fog: false, depthWrite: false, transparent: true, opacity: def.id === 'kerala' ? 0.9 : 0.6, toneMapped: false }));
    s.position.set(Math.cos(a) * r, 180 + rnd() * 360, Math.sin(a) * r); s.scale.set(800 + rnd() * 600, 300 + rnd() * 160, 1); skyGroup.add(s);
  }
  const bd = buildBackdrop(make, def, 900, 540, makeRng(5));
  const ring = (cv, radius, height, yoff, rep) => {
    const t = tex(cv, true); t.repeat.set(rep, 1);
    const m = new T3.Mesh(new T3.CylinderGeometry(radius, radius, height, 72, 1, true), new T3.MeshBasicMaterial({ map: t, transparent: true, side: T3.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    m.position.y = yoff; skyGroup.add(m); return m;
  };
  // city skyline stays painted; elsewhere real 3D ranges sit on the horizon
  const range = buildRange(def, pal);
  if (range) { skyGroup.add(range); ring(bd.far, 2000, 520, 160, 3).material.opacity = 0.35; }
  else { ring(bd.far, 2000, 520, 160, 3); ring(bd.mid, 1800, 330, 70, 4); }
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
  const kerbMat = mat('#ffffff', { map: tex(texKerb(make, def.id === 'sealink' ? 'city' : def.id), true), r: 0.92 });
  const groundTex = th.ground === 'sand' ? texGround(make, '#d9a45b', '#e8c07e', 'sand') : th.ground === 'rock' ? texGround(make, '#6e6455', '#857a68', 'rock') : th.ground === 'grass' ? texGround(make, '#2f7d3f', '#3f9a4f', 'grass') : texWater(make);
  // Blender-baked ground (tools/blender/ground.py): albedo + normal map, 12 m tiles
  const gKind = { grass: 'grass', sand: 'sand', rock: 'scree' }[th.ground];
  const imgTex = (name, linear) => {
    const im = ASSETS.img[name]; if (!im) return null;
    const t = new T3.CanvasTexture(mk(make, im.width, im.height, (c) => c.drawImage(im, 0, 0)));
    t.encoding = linear ? T3.LinearEncoding : T3.sRGBEncoding; t.wrapS = t.wrapT = T3.RepeatWrapping; t.anisotropy = env.aniso || 1; t.needsUpdate = true; madeTex.push(t); return t;
  };
  const gAlb = gKind && imgTex('ground_' + gKind), gNrm = gKind && q > 0 && imgTex('ground_' + gKind + '_n', true);
  const groundMat = new T3.MeshStandardMaterial({ map: gAlb || tex(groundTex, true), roughness: th.ground === 'water' ? 0.3 : 0.95, metalness: th.ground === 'water' ? 0.1 : 0 });
  let waterNrm = null;
  if (th.ground === 'water') {
    // glossy sea that mirrors the sunset sky; the scrolling normal map makes the sun glitter on the waves
    waterNrm = new T3.CanvasTexture(texWaterNormal(make)); madeTex.push(waterNrm); waterNrm.wrapS = waterNrm.wrapT = T3.RepeatWrapping; waterNrm.encoding = T3.LinearEncoding;
    groundMat.map = null; groundMat.color.set('#10293b'); groundMat.roughness = 0.2; groundMat.metalness = 0.0;
    groundMat.normalMap = waterNrm; groundMat.normalScale.set(0.3, 0.3); groundMat.envMapIntensity = 0.75;
  }
  if (gNrm) { groundMat.normalMap = gNrm; groundMat.normalScale.set(0.8, 0.8); }
  const wallMat = mat('#c9c6bf', { ds: true, r: 0.9 });
  const railMat = mat('#c3c8cf', { ds: true, r: 0.35, m: 0.75 });
  const lats = [-320, -150, -70, -32, -16, -HALF - 0.9];
  const chunks = [];
  for (let i0 = 0; i0 < N; i0 += CHUNK) {
    const i1 = Math.min(N, i0 + CHUNK), grp = new T3.Group();
    const add = (geo, m, shadowRecv) => { const me = new T3.Mesh(geo, m); me.receiveShadow = !!shadowRecv && q > 0; grp.add(me); return me; };
    add(ribbonGeo(path, i0, i1, () => [[-HALF, 0], [HALF, 0]], 0, 12), roadMat, true);
    add(ribbonGeo(path, i0, i1, () => [[-HALF - 0.9, 0.02], [-HALF, 0.02]], 0, 4), kerbMat, true);
    add(ribbonGeo(path, i0, i1, () => [[HALF, 0.02], [HALF + 0.9, 0.02]], 0, 4), kerbMat, true);
    if (th.ground === 'water') {
      add(ribbonGeo(path, i0, i1, () => lats.map((l) => [l, -7]), 70, 70), groundMat);
      add(ribbonGeo(path, i0, i1, () => lats.map((l) => [-l, -7]).reverse(), 70, 70), groundMat);
      add(ribbonGeo(path, i0, i1, () => [[-HALF - 1.3, -1.6], [-HALF - 1.3, 1.0], [-HALF - 0.9, 1.0], [-HALF - 0.9, 0.02]], 0, 6), wallMat, true);
      add(ribbonGeo(path, i0, i1, () => [[HALF + 0.9, 0.02], [HALF + 0.9, 1.0], [HALF + 1.3, 1.0], [HALF + 1.3, -1.6]], 0, 6), wallMat, true);
    } else {
      add(ribbonGeo(path, i0, i1, (i) => lats.map((l) => [l, terrainLift(th.terrain, i, l) - 0.04]), gAlb ? 12 : 10, gAlb ? 12 : 10), groundMat, true);
      add(ribbonGeo(path, i0, i1, (i) => lats.map((l) => [-l, terrainLift(th.terrain, i, -l) - 0.04]).reverse(), gAlb ? 12 : 10, gAlb ? 12 : 10), groundMat, true);
    }
    // galvanised W-beam crash barriers (the Ladakh road gets painted stone blocks instead, placed with the scenery)
    if (!def.walls && def.id !== 'ladakh') {
      let a = -1;
      for (let i = i0; i <= i1; i++) {
        const on = i < i1 && R.track.segs[i].rail;
        if (on && a < 0) a = i;
        if (!on && a >= 0) {
          if (i - a > 2) for (const sd of [-1, 1]) {
            const L = sd * (HALF + 1.15);
            add(ribbonGeo(path, a, i, () => [[L, 0.46], [L, 0.84]], 0, 4), railMat, false);
          }
          a = -1;
        }
      }
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
  const towns = def.towns || ['CITY', 'TOWN', 'VILLAGE', 'HIGHWAY'];
  const signTex = [0, 1, 2, 3].map((v) => tex(mk(make, 512, 256, (c) => {
    c.fillStyle = '#0d6b3a'; c.fillRect(0, 0, 512, 256); c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.strokeRect(10, 10, 492, 236);
    c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.font = '800 54px ' + FONT;
    const a = towns[v % towns.length], b = towns[(v + 1) % towns.length], d1 = 12 + ((v * 37) % 60), d2 = d1 + 40 + ((v * 53) % 90);
    c.fillText('\u2191 ' + a, 34, 104); c.fillText('\u2192 ' + b, 34, 196); c.textAlign = 'right'; c.fillText(d1 + ' km', 478, 104); c.fillText(d2 + ' km', 478, 196);
  })));
  const warnTex = [0, 1].map((v) => tex(mk(make, 256, 256, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 256);
    // triangle laid out to match the uvs of CircleGeometry(r, 3, PI / 2)
    const T = (a, k) => [128 + Math.cos(a) * 128 * k, 128 - Math.sin(a) * 128 * k];
    const tri = (k, col) => { c.fillStyle = col; c.beginPath(); for (let j = 0; j < 3; j++) { const q = T(Math.PI / 2 + j * 2.0944, k); c[j ? 'lineTo' : 'moveTo'](q[0], q[1]); } c.closePath(); c.fill(); };
    tri(1, '#d0201a'); tri(0.62, '#ffffff');
    const sx = v ? 1 : -1; c.strokeStyle = '#111'; c.lineWidth = 11; c.lineCap = 'round'; c.beginPath();
    c.moveTo(128 - sx * 10, 168); c.lineTo(128 - sx * 10, 140); c.quadraticCurveTo(128 - sx * 10, 116, 128 + sx * 14, 112); c.stroke();
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(128 + sx * 30, 111); c.lineTo(128 + sx * 10, 98); c.lineTo(128 + sx * 10, 126); c.closePath(); c.fill();
  })));
  const speedTex = tex(mk(make, 256, 256, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#d0201a'; c.beginPath(); c.arc(128, 128, 127, 0, 7); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(128, 128, 98, 0, 7); c.fill();
    c.fillStyle = '#111'; c.font = '900 96px ' + FONT; c.textAlign = 'center'; c.fillText(def.id === 'ladakh' ? '40' : '80', 128, 162);
  }));
  const dhabaTex = ['PUNJABI DHABA', 'CHAI \u2022 NASHTA', 'SHER-E-PUNJAB', 'HIGHWAY HOTEL'].map((t, v) => tex(mk(make, 512, 96, (c) => {
    c.fillStyle = ['#f2c230', '#d63a2f', '#1f7a3d', '#2d5fa8'][v]; c.fillRect(0, 0, 512, 96);
    c.fillStyle = v ? '#ffffff' : '#7a1d10'; c.font = 'italic 900 58px ' + FONT; c.textAlign = 'center'; c.fillText(t, 256, 70);
  })));
  const pumpTex = tex(mk(make, 512, 64, (c) => { c.fillStyle = '#1b4fa0'; c.fillRect(0, 0, 512, 64); c.fillStyle = '#f2c230'; c.fillRect(0, 50, 512, 14); c.fillStyle = '#fff'; c.font = '900 40px ' + FONT; c.textAlign = 'center'; c.fillText('FUEL  \u2022  AIR  \u2022  FOOD', 256, 42); }));
  const policeLetters = tex(mk(make, 256, 64, (c) => { c.clearRect(0, 0, 256, 64); c.fillStyle = '#1f4fb3'; c.font = '900 50px ' + FONT; c.textAlign = 'center'; c.fillText('POLICE', 128, 50); }));
  const protos = {};
  // which Blender nature model stands in for each scenery type on this track
  const natName = (t, v) => {
    if (t === 'palm') return 'palm'; if (t === 'coconut') return 'coconut'; if (t === 'poplar') return 'poplar';
    if (t === 'tree') return pal.dry ? 'acacia' : 'neem'; if (t === 'bush') return pal.dry ? 'bushdry' : 'bush';
    if (t === 'rock') return def.id === 'ladakh' ? 'snowrock' + (v % 2) : 'rock' + (v % 3);
    if (t === 'grass' || t === 'grassdry') return t;
    return null;
  };
  const getProto = (t, v) => {
    const key = t + '|' + v; if (protos[key]) return protos[key];
    let p;
    const nn = useGLB && natName(t, v), np = nn && natureProto(nn);
    if (np) return (protos[key] = np);
    const hp = useGLB && t === 'house' && natureProto('house' + (v % 4), 'houses');   // Blender houses (tools/blender/houses.py)
    if (hp) return (protos[key] = hp);
    if (t === 'palm') p = protoPalm(mat, '#3e9b4f'); else if (t === 'coconut') p = protoPalm(mat, '#4aa84a');
    else if (t === 'lamp') p = protoLamp(mat); else if (t === 'billboard') p = protoBillboard(mat, adTex[v % 6]);
    else if (t === 'building') p = protoBuilding(mat, make, (cv) => tex(cv), v, rnd); else if (t === 'rock') p = protoRock(mat, def.id === 'ladakh', 10 + v);
    else if (t === 'flags') p = protoFlags(mat); else if (t === 'chorten') p = protoChorten(mat); else if (t === 'pole') p = protoPole(mat);
    else if (t === 'cactus') p = protoCactus(mat); else if (t === 'fort') p = protoFort(mat); else if (t === 'bush') p = protoBush(mat, pal.dry);
    else if (t === 'house') p = protoHouse(mat, v); else if (t === 'marker') p = protoMarker(mat); else if (t === 'pylon') p = protoPylon(mat);
    else if (t === 'tree') p = protoTree(mat, pal.dry, 30 + v); else if (t === 'poplar') p = protoPoplar(mat, 50 + v);
    else if (t === 'sign') p = protoSign(mat, signTex[v % 4], 4.2, 2.1, 4.4, 'rect'); else if (t === 'warn') p = protoSign(mat, warnTex[v % 2], 1.25, 1.25, 2.2, 'tri');
    else if (t === 'speed') p = protoSign(mat, speedTex, 1.0, 1.0, 2.2, 'circle'); else if (t === 'dhaba') p = protoDhaba(mat, dhabaTex[v % 4], v);
    else if (t === 'pump') p = protoPump(mat, pumpTex); else if (t === 'parapet') p = protoParapet(mat);
    else if (t === 'railpost') p = Proto().add(new T3.BoxGeometry(0.12, 0.85, 0.14), mat('#8d939b', { r: 0.4, m: 0.7 }), xf(0, 0.42, 0)).done();
    protos[key] = p; return p;
  };
  const variants = { building: 4, billboard: 6, rock: 3, house: 4, tree: 4, poplar: 2, sign: 4, warn: 2, dhaba: 4 };
  const FACING = { sign: 1, warn: 1, speed: 1 };   // signs always face approaching riders
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
        const jitter = o.t === 'palm' || o.t === 'coconut' || o.t === 'rock' || o.t === 'bush' || o.t === 'cactus' || o.t === 'tree' || o.t === 'poplar';
        const v = variants[o.t] ? o.v % variants[o.t] : 0;
        const yaw = FACING[o.t] ? 0 : o.t === 'dhaba' || o.t === 'pump' || (o.t === 'house' && useGLB) ? side - Math.PI / 2 : side + (jitter ? (o.v * 1.7) % 6.28 : 0);
        place(o.t, v, i * SEG, o.off * HALF, yaw, jitter ? 0.8 + ((o.v * 37) % 10) / 20 : 1);
      }
      if (seg.rail && !def.walls) {
        if (def.id === 'ladakh') { if (i % 3 === 0) { place('parapet', 0, i * SEG, -(HALF + 1.2), 0, 1); place('parapet', 0, i * SEG, HALF + 1.2, 0, 1); } }
        else if (i % 4 === 0) { place('railpost', 0, i * SEG, -(HALF + 1.2), 0, 1); place('railpost', 0, i * SEG, HALF + 1.2, 0, 1); }
      }
      if (def.id === 'sealink' && (i === Math.floor(N * 0.3) || i === Math.floor(N * 0.62))) place('pylon', 0, i * SEG, 0, 0, 1);
      // ground cover: grass tufts and scrub scattered along both verges (the bridge has none)
      if (useGLB && def.id !== 'sealink') {
        const gr = makeRng(i * 7919 + 13), dens = ({ kerala: 5, thar: 2, ladakh: 1.4 }[def.id] || 2) * (q > 0 ? 1 : 0.4);   // LOW graphics: sparser ground cover
        let n = Math.floor(dens) + (gr() < dens % 1 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const sd = gr() < 0.5 ? -1 : 1, lat = sd * (HALF + 1.6 + Math.pow(gr(), 1.6) * 26);
          const kind = def.id === 'kerala' ? (gr() < 0.85 ? 'grass' : 'bush') : def.id === 'thar' ? (gr() < 0.75 ? 'grassdry' : 'bush') : 'grassdry';
          place(kind, 0, i * SEG + gr() * SEG, lat, gr() * 6.28, kind === 'bush' ? 0.55 + gr() * 0.5 : 0.8 + gr() * 0.9);
        }
      }
    }
    // bake every instance into one static mesh per material for this chunk: all trees share the leaf
    // and bark materials, so a whole chunk of scenery costs a handful of draw calls instead of ~140
    const groups = new Map();
    for (const [k, ms] of lists) {
      const [t, v] = k.split('|');
      const tree = t !== 'grass' && t !== 'grassdry';
      for (const part of getProto(t, +v)) {
        const sig = part.mat.uuid + '|' + Object.keys(part.geo.attributes).sort().join(',') + '|' + (part.leaves !== undefined && tree ? 'c' : '');
        if (!groups.has(sig)) groups.set(sig, { mat: part.mat, items: [], cast: q > 0 && part.leaves !== undefined && tree, leaves: !!part.leaves });
        groups.get(sig).items.push({ geo: part.geo, ms: ms });
      }
    }
    const nm = new T3.Matrix3(), v3 = new T3.Vector3();
    for (const gp of groups.values()) {
      let nv = 0, ni = 0;
      for (const it of gp.items) { nv += it.geo.attributes.position.count * it.ms.length; ni += (it.geo.index ? it.geo.index.count : it.geo.attributes.position.count) * it.ms.length; }
      const names = Object.keys(gp.items[0].geo.attributes), out = {};
      for (const n of names) out[n] = new Float32Array(nv * gp.items[0].geo.attributes[n].itemSize);
      const sway = gp.leaves ? new Float32Array(nv) : null, idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let vo = 0, io = 0;
      for (const it of gp.items) {
        const g0 = it.geo, cnt = g0.attributes.position.count;
        for (const m of it.ms) {
          nm.getNormalMatrix(m);
          for (const n of names) {
            const a = g0.attributes[n], sz = a.itemSize, dst = out[n];
            for (let i = 0; i < cnt; i++) {
              if (n === 'position') { v3.fromBufferAttribute(a, i); if (sway) sway[vo + i] = v3.y; v3.applyMatrix4(m); dst[(vo + i) * 3] = v3.x; dst[(vo + i) * 3 + 1] = v3.y; dst[(vo + i) * 3 + 2] = v3.z; }
              else if (n === 'normal') { v3.fromBufferAttribute(a, i).applyMatrix3(nm).normalize(); dst[(vo + i) * 3] = v3.x; dst[(vo + i) * 3 + 1] = v3.y; dst[(vo + i) * 3 + 2] = v3.z; }
              else for (let c = 0; c < sz; c++) dst[(vo + i) * sz + c] = a.array[i * sz + c] !== undefined && !a.normalized && !a.isInterleavedBufferAttribute ? a.array[i * sz + c] : a.getComponent ? a.getComponent(i, c) : a[['getX', 'getY', 'getZ', 'getW'][c]](i);
            }
          }
          if (g0.index) { const ix = g0.index.array; for (let i = 0; i < ix.length; i++) idx[io++] = ix[i] + vo; }
          else for (let i = 0; i < cnt; i++) idx[io++] = vo + i;
          vo += cnt;
        }
      }
      const geo = new T3.BufferGeometry();
      for (const n of names) geo.setAttribute(n, new T3.BufferAttribute(out[n], gp.items[0].geo.attributes[n].itemSize));
      if (sway) geo.setAttribute('aSway', new T3.BufferAttribute(sway, 1));
      geo.setIndex(new T3.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
      const me = new T3.Mesh(geo, gp.mat); me.frustumCulled = false; me.matrixAutoUpdate = false;   // chunks are culled by distance instead
      if (gp.cast) (ch.casters || (ch.casters = [])).push(me);    // trees: shadows only near the rider
      ch.grp.add(me);
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
  const traffic3 = R.traffic.map((t, i) => {
    let g;
    if (useGLB) g = makeTrafficGLB(t, i);
    else if (t.type === 'car') g = makeCar(mat, t.color);
    else if (t.type === 'rick') g = makeRick(mat);
    else if (t.type === 'truck') g = makeTruck(mat, truckCols[t.v % 4], rearTruck(t.v), sideTruck(t.v));
    else g = makeBus(mat, busSide, busRear);
    g.traverse((o) => { if (o.isMesh) o.castShadow = q > 0; });
    // headlights so oncoming traffic is easy to spot from far away
    if (t.dir < 0) {
      const bb = new T3.Box3().setFromObject(g), hw = (bb.max.x - bb.min.x) * 0.36, hy = Math.max(0.6, (bb.max.y - bb.min.y) * 0.32);
      for (const sx of [-1, 1]) {
        const hl = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, color: '#fff4cf', transparent: true, depthWrite: false, blending: T3.AdditiveBlending, opacity: def.id === 'kerala' ? 1 : 0.75 }));
        hl.scale.set(def.id === 'kerala' ? 2.4 : 1.5, def.id === 'kerala' ? 2.4 : 1.5, 1); hl.position.set(sx * hw, hy, bb.min.z - 0.1); g.add(hl);
      }
    }
    g.visible = false; scene.add(g); return g;
  });
  // real shadow maps only for the player's bike; everyone else gets a soft contact shadow (much cheaper on phones)
  const blobTex = tex(mk(make, 128, 128, (c) => { const g = c.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }));
  const blobMat = new T3.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const shadowed = (m, cast) => {
    const proxied = !!m.userData_proxy;
    m.traverse((o) => { if (o.isMesh) o.castShadow = q > 0 && cast && (!proxied || o.userData.shadowProxy || o.isSkinnedMesh); });
    if (useGLB && !(q > 0 && cast)) { const b = new T3.Mesh(new T3.PlaneGeometry(0.9, 2.3), blobMat); b.rotation.x = -Math.PI / 2; b.position.y = 0.02; b.renderOrder = -1; m.add(b); m.userData.blob = b; }
    return m;
  };
  const racerModel = (style, lo, cast) => shadowed(useGLB ? makeRacerGLB(style, { lo: lo, shadowProxy: !!cast }, glowTex) : makeRider(mat, style, glowTex), cast !== false && !useGLB ? true : !!cast);
  traffic3.forEach((g) => {
    const bb = new T3.Box3().setFromObject(g), sx = (bb.max.x - bb.min.x) * 1.15, sz = (bb.max.z - bb.min.z) * 1.08;
    if (!isFinite(sx) || !isFinite(sz)) return;
    const b = new T3.Mesh(new T3.PlaneGeometry(sx, sz), blobMat); b.rotation.x = -Math.PI / 2; b.position.set((bb.max.x + bb.min.x) / 2, 0.03, (bb.max.z + bb.min.z) / 2); b.renderOrder = -1; g.add(b);
  });
  const racers3 = R.rivals.map((r) => { const m = racerModel(r.style, true); m.visible = false; scene.add(m); return m; });
  const player3 = racerModel(Object.assign({}, PLAYER_STYLE, { bike: R.stats.color }), !q, true); scene.add(player3);
  const copBikes3 = [0, 1, 2, 3].map(() => { const m = racerModel(COP_STYLE, true); m.visible = false; scene.add(m); return m; });
  const policeLettersFn = () => policeLetters;
  const makeJeep = () => { const g = useGLB && ASSETS.gltf.suv ? makePoliceJeepGLB(mat, glowTex, policeLettersFn) : makePoliceJeep(mat, glowTex, policeLettersFn); g.traverse((o) => { if (o.isMesh) o.castShadow = q > 0; }); g.visible = false; scene.add(g); return g; };
  const copJeeps3 = [0, 1, 2].map(makeJeep);
  // checkpoint: parked jeep plus a pair of striped barricades
  const barrier = (g, x, z) => { addMesh(g, new T3.BoxGeometry(1.8, 0.28, 0.08), mat('#d0201a', { r: 0.6 }), x, 0.9, z); addMesh(g, new T3.BoxGeometry(1.8, 0.1, 0.085), mat('#ffffff'), x, 0.9, z); for (const sx of [-0.8, 0.8]) addMesh(g, new T3.BoxGeometry(0.06, 0.9, 0.5), mat('#2b2d33'), x + sx, 0.45, z); };
  const patrol3 = R.patrols.map(() => { const g = new T3.Group(), j = makeJeep(); j.visible = true; scene.remove(j); j.rotation.y = 0.35; g.add(j); barrier(g, 2.6, -4); barrier(g, 2.6, 4); g.visible = false; scene.add(g); return g; });
  const copModel = new Map();
  function modelForCop(c) {
    let m = copModel.get(c.id); if (m) return m;
    const pool = c.car ? copJeeps3 : copBikes3, used = new Set(copModel.values());
    m = pool.find((x) => !used.has(x)); if (m) copModel.set(c.id, m);
    return m || null;
  }
  // pickups: larger, with a GTA-style light beam so they can be spotted far down the road
  const beamMats = {};
  const pick3 = R.pickups.map((k) => {
    const m = makePickup(mat, k.type, glowTex); m.scale.setScalar(1.45);
    const col = { cash: '#2fe08a', nitro: '#3b9bff', repair: '#ff5a5a' }[k.type] || '#ffd400';
    const bm = beamMats[col] || (beamMats[col] = new T3.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false, blending: T3.AdditiveBlending, side: T3.DoubleSide, fog: true }));
    const beam = new T3.Mesh(new T3.CylinderGeometry(0.28, 0.42, 6, 14, 1, true), bm); beam.position.y = 2.6; m.add(beam); m.userData.beam = beam;
    const ring = new T3.Mesh(new T3.RingGeometry(0.45, 0.62, 24), bm); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.8; m.add(ring);
    m.visible = false; scene.add(m); return m;
  });
  const haz3 = R.hazards.map((h) => {
    const m = makeHazardModel(mat, h.type); m.traverse((o) => { if (o.isMesh) o.castShadow = q > 0; });
    m.scale.setScalar(h.type === 'cone' ? 1.4 : 1.25);   // a touch oversized so they read at speed
    // contact shadow, and a flashing amber blinker on drums and barricades
    const b = new T3.Mesh(new T3.PlaneGeometry(h.type === 'barricade' ? 2.0 : 1.0, h.type === 'barricade' ? 1.0 : 1.0), blobMat); b.rotation.x = -Math.PI / 2; b.position.y = 0.02; m.add(b);
    if (h.type !== 'cone') {
      const bl = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, color: '#ffb000', transparent: true, depthWrite: false, blending: T3.AdditiveBlending }));
      bl.scale.set(1.4, 1.4, 1); bl.position.set(h.type === 'barricade' ? 0.72 : 0, h.type === 'barricade' ? 1.12 : 1.22, 0); m.add(bl); m.userData.blink = bl;
    }
    m.visible = false; scene.add(m); return m;
  });

  const overlay = createOverlay(R, W, H);
  const dust = createDust(def, scene, glowTex), wipedBefore = new Set();
  // HDR post chain on high quality (bloom, grading, haze, speed blur); low quality renders straight to screen
  let post = null;
  if (q > 0 && !env.noPost) { try { post = createPostFX(gl, W, H, def.id); } catch (e) { post = null; } }
  const camPos = new T3.Vector3(), camLook = new T3.Vector3(), up = new T3.Vector3(0, 1, 0), proj = new T3.Vector3();
  let lastT = R.time, first = true, zoom = 0;
  const P = {};

  // ---- victory ceremony: everything from the race is hidden except the podium riders ----
  let cer = null, cerLast = 0;
  function drawCeremony(ctx, R, o) {
    const t = o.ceremony, dt = Math.min(0.1, Math.max(0, t - cerLast)); cerLast = t;
    if (!cer) cer = createCeremony({ scene: scene, path: path, R: R, camera: camera, glowTex: glowTex, player3: player3, racers3: racers3, events: R.events, H: H });
    for (const m of traffic3.concat(racers3, copBikes3, copJeeps3, pick3, haz3, patrol3)) m.visible = false;
    player3.visible = false;
    WIND.value = R.time + t;
    if (waterNrm) waterNrm.offset.set((R.time + t) * 0.012, (R.time + t) * 0.02);
    const fx = cer.update(t, dt) || {};
    const pod = cer.riders[0] ? cer.riders[0].m.position : camera.position;
    skyGroup.position.copy(camera.position);
    sun.target.position.copy(pod); sun.position.copy(pod).addScaledVector(sunDir, 120);
    dust.update(dt, [], H, camera.fov);
    gl.setSize(W, H, false);
    if (post) post.render(scene, camera, { time: R.time + t, speed: 0, flash: fx.flash || 0, bloomMul: 1.5 });
    else gl.render(scene, camera);
    cer.drawOverlay(ctx, t, W, H);
  }
  // shadows only for things near the rider (the shadow map covers ~26 m around him anyway)
  function nearShadow(m, near) {
    if (q <= 0) return;
    const u = m.userData; if (u.shNear === near) return; u.shNear = near;
    if (!u.shMeshes) { u.shMeshes = []; m.traverse((o) => { if (o.isMesh && o.castShadow !== undefined && !o.isSkinnedMesh && o.material && !o.material.transparent) u.shMeshes.push(o); }); }
    for (const o of u.shMeshes) o.castShadow = near;
  }
  function flashSiren(sr, time) {
    if (!sr) return; const on = Math.floor(time * 5) % 2;
    sr.r.emissiveIntensity = on ? 4 : 0.15; sr.b.emissiveIntensity = on ? 0.15 : 4; sr.glow.material.color.set(on ? '#ff3030' : '#3060ff');
  }
  function poseJeep(m, c, dt, time) {
    path.at(c.z, c.x, P);
    m.position.set(P.x, P.y, P.z);
    let yaw = -P.h - c.lean * 0.12, roll = 0;
    if (c.state === 'wipe') { const k = 1 - Math.exp(-c.wipeT * 1.8); yaw += (c.x > 0 ? 1 : -1) * 2.4 * k; roll = (c.x > 0 ? 1 : -1) * 0.12 * Math.sin(Math.min(1, c.wipeT) * Math.PI); }
    m.rotation.set(0, yaw, roll, 'YXZ');
    if (m.userData.far) { const f = m.position.distanceToSquared(camPos) > 32 * 32; m.userData.far.visible = f; m.userData.near.visible = !f; }
    if (c.state === 'ride') flashSiren(m.userData.siren, time); else if (m.userData.siren) { m.userData.siren.r.emissiveIntensity = 0.1; m.userData.siren.b.emissiveIntensity = 0.1; }
  }
  // camera presets, cycled with the camera button (zoom multiplies the distance; pinch / mouse wheel)
  let cam = Object.assign({}, CAMERAS[0]), camIdx = -1;
  const HIP = 1.0;
  function poseRacerGLB(m, r, dt, time) {
    path.at(r.z, r.x, P);
    const d = m.userData, B = d.bikeG, G = d.riderG, p = R.player;
    m.position.set(P.x, P.y, P.z); m.rotation.set(0, -P.h, 0);
    if (d.bikeFar) { const far = m.position.distanceToSquared(camPos) > 15 * 15; d.bikeFar.visible = far; d.bikeNear.visible = !far; }
    if (r.state === 'wipe') {
      if (!d.wiping) { d.wiping = true; d.wdir = r.x > 0 ? 1 : -1; playOneShot(d, 'Fall', true); for (const s in d.hands) { const h = d.hands[s]; h.bat.visible = h.chain.visible = h.rod.visible = h.lathi.visible = false; } }
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
      if (d.wiping) { d.wiping = false; if (d.os) { d.os.stop(); d.os = null; } for (const s in d.hands) { const h = d.hands[s]; h.bat.visible = h.chain.visible = h.rod.visible = h.lathi.visible = false; } }
      const roll = -r.lean * 0.42;
      B.rotation.set(0, 0, roll); B.position.set(0, 0, 0);
      G.rotation.set(0, 0, roll); G.position.set(-HIP * Math.sin(roll), HIP * Math.cos(roll), 0);
      const atk = r.isPlayer ? r.punchT : r.atkT, side = r.isPlayer ? r.punchSide : r.atkSide, hitN = r.hitN || 0;
      if (atk < d.prevAtk && atk < 0.25) {
        const S = side > 0 ? 'R' : 'L', kind = r.isPlayer ? r.punchKind : r.atkKind, w = kind === 'kick' ? null : r.weapon ? r.weapon.type : null;
        playOneShot(d, kind === 'kick' ? 'Kick' + S : w ? 'Swing' + S : 'Punch' + S);
        d.wpn = w; d.wpnSide = S;
      } else if (hitN !== d.prevHit) playOneShot(d, (r.hitSide || 1) > 0 ? 'HitR' : 'HitL');
      else if (!r.isPlayer && !d.os) {
        d.tauntCd -= dt;
        if (d.tauntCd < 0) { d.tauntCd = 5 + Math.random() * 9; if (Math.abs(r.z - p.z) < 2600 && p.state === 'ride') playOneShot(d, 'Taunt'); }
      }
      d.prevAtk = atk; d.prevHit = hitN;
      const swinging = d.os && /^Swing/.test(d.os.getClip().name);
      for (const s in d.hands) { const h = d.hands[s], on = swinging && d.wpnSide === s; h.bat.visible = on && d.wpn === 'bat'; h.chain.visible = on && d.wpn === 'chain'; h.rod.visible = on && d.wpn === 'rod'; h.lathi.visible = on && d.wpn === 'lathi'; }
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
      a.userData.bat.visible = active && (weapon === 'bat' || weapon === 'rod' || weapon === 'lathi'); a.userData.chain.visible = active && weapon === 'chain';
    }
    if (d.siren) { const on = Math.floor(time * 6) % 2; d.siren.r.material.emissiveIntensity = on ? 3 : 0.2; d.siren.b.material.emissiveIntensity = on ? 0.2 : 3; d.siren.glow.material.color.set(on ? '#ff3030' : '#3060ff'); }
  }

  return {
    W: W, H: H, scene: scene,
    resize(w, h) { W = w; H = h; camera.aspect = w / h; camera.updateProjectionMatrix(); if (post) post.resize(w, h); },
    draw(ctx, R, o) {
      o = o || {};
      if (o.ceremony !== undefined && useGLB) { drawCeremony(ctx, R, o); return; }
      const dt = Math.min(0.1, Math.max(0, R.time - lastT)); lastT = R.time; WIND.value = R.time;
      if (waterNrm) waterNrm.offset.set(R.time * 0.012, R.time * 0.02);
      const p = R.player, pIdx = Math.floor(p.z / SEG), far = pIdx + viewUnits / SEG;
      for (const ch of chunks) {
        ch.grp.visible = ch.i1 >= pIdx - 30 && ch.i0 <= far;
        if (ch.casters) { const near = ch.i1 >= pIdx - 20 && ch.i0 <= pIdx + 40; if (ch.castOn !== near) { ch.castOn = near; for (const im of ch.casters) im.castShadow = near; } }
      }
      const dynRange = Math.min(viewUnits, 430 / M3), inView = (z) => z > p.z - 2500 && z < p.z + dynRange;
      R.traffic.forEach((t, i) => {
        const m = traffic3[i]; m.visible = inView(t.z) && t.z < p.z + fogFar * 0.85 / M3; if (!m.visible) return;
        path.at(t.z, t.x, P); m.position.set(P.x, P.y, P.z); m.rotation.set(0, -P.h + (t.dir < 0 ? Math.PI : 0), 0);
        nearShadow(m, Math.abs(t.z - p.z) < 60 / M3);
        if (m.userData.far) { const f = m.position.distanceToSquared(camPos) > 32 * 32; m.userData.far.visible = f; m.userData.near.visible = !f; }
        const spin = (t.speed * M3 * dt) / m.userData.wr; for (const w of m.userData.wheels) w.rotation.x -= spin;
      });
      const labels = [];
      R.rivals.forEach((r, i) => {
        const m = racers3[i]; m.visible = inView(r.z) && r.z < p.z + 170 / M3; if (!m.visible) return; poseRacer(m, r, dt, R.time);
        if (o.hud !== false && r.state === 'ride' && !r.finished && r.z > p.z - 300 && r.z < p.z + 9000) {
          proj.set(m.position.x, m.position.y + 2.4, m.position.z).project(camera);
          if (proj.z < 1) labels.push({ x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * H, text: r.name });
        }
      });
      const alive = new Set(R.cops.map((c) => c.id));
      for (const [id, m] of copModel) if (!alive.has(id)) { copModel.delete(id); m.visible = false; }
      for (const c of R.cops) { const m = modelForCop(c); if (!m) continue; m.visible = inView(c.z); if (m.visible) { if (c.car) poseJeep(m, c, dt, R.time); else poseRacer(m, c, dt, R.time); } }
      R.patrols.forEach((pt, i) => {
        const g = patrol3[i]; g.visible = !pt.used && inView(pt.z); if (!g.visible) return;
        path.at(pt.z, pt.x, P); g.position.set(P.x, P.y, P.z); g.rotation.set(0, -P.h, 0); flashSiren(g.children[0].userData.siren, R.time + i * 0.3);
      });
      R.pickups.forEach((k, i) => {
        const m = pick3[i]; m.visible = !k.got && inView(k.z) && k.z < p.z + 300 / M3; if (!m.visible) return;
        path.at(k.z, k.x, P); m.position.set(P.x, P.y + 1.2 + Math.sin(R.time * 3 + i) * 0.15, P.z); m.userData.inner.rotation.y = R.time * 2.4;
        if (m.userData.beam) m.userData.beam.visible = k.z - p.z > 1800;   // beam guides you in, then gets out of the way
      });
      R.hazards.forEach((h, i) => {
        const m = haz3[i]; m.visible = h.z > 0 && inView(h.z) && h.z < p.z + 260 / M3; if (!m.visible) return;
        nearShadow(m, Math.abs(h.z - p.z) < 50 / M3);
        path.at(h.z, h.x, P); m.position.set(P.x, P.y, P.z); m.rotation.y = -P.h;
        if (m.userData.blink) { const on = (R.time * 1.6 + i * 0.37) % 1 < 0.45; m.userData.blink.visible = on; }
      });
      poseRacer(player3, p, dt, R.time);
      player3.visible = !(p.inv > 0 && p.state === 'ride' && Math.floor(R.time * 16) % 2) || CAMERAS[o.cam | 0].fp;

      // chase camera that follows the road; presets blend smoothly into each other
      const want3 = CAMERAS[clamp(o.cam | 0, 0, CAMERAS.length - 1)], zm = clamp(o.zoom || 1, 0.55, 1.9);
      const blend = camIdx < 0 ? 1 : 1 - Math.exp(-dt * 4.5); camIdx = o.cam | 0;
      for (const k of ['back', 'up', 'ahead', 'look', 'fov', 'lat']) cam[k] += (want3[k] * (k === 'back' || k === 'up' ? (want3.fp ? 1 : zm) : 1) - cam[k]) * blend;
      const fp = want3.fp && cam.up < 1.6 && p.state !== 'wipe';   // a crash cuts to the chase view
      const lx = clamp(p.x, -1.9, 1.9);
      const behind = path.at(p.z - cam.back, lx * cam.lat, {}), ahead = path.at(p.z + cam.ahead, lx * (fp ? 1 : 0.6), {});
      const want = new T3.Vector3(behind.x, behind.y + cam.up, behind.z), look = new T3.Vector3(ahead.x, ahead.y + cam.look, ahead.z);
      const k = first ? 1 : fp ? 1 : 1 - Math.exp(-dt * 8);
      camPos.lerp(want, k); camLook.lerp(look, k); if (first) { camPos.copy(want); camLook.copy(look); first = false; }
      camera.position.copy(camPos);
      // anything sitting between the camera and the rider would fill the screen: hide it until it is past
      const camZ = p.z - Math.max(0, cam.back), camX = lx * cam.lat;
      if (cam.up < 7) {
        R.traffic.forEach((t, i) => { if (traffic3[i].visible && t.z + t.len * 0.5 > camZ - 250 && t.z - t.len * 0.5 < p.z - 150 && Math.abs(t.x - camX) < t.w * 0.5 + 0.18) traffic3[i].visible = false; });
        for (const c of R.cops) if (c.car) { const m = copModel.get(c.id); if (m && m.visible && c.z + 600 > camZ - 250 && c.z - 600 < p.z - 150 && Math.abs(c.x - camX) < 0.3) m.visible = false; }
      }
      // rider cam: just over the helmet, so you see your own helmet, shoulders and arms working the bars,
      // and the view leans with the rider
      const ud = player3.userData, headB = ud.rider ? (ud.headBone || (ud.headBone = ud.rider.getObjectByName('head'))) : null;
      if (fp && headB) {
        player3.updateMatrixWorld(true);
        const hp = headB.getWorldPosition(new T3.Vector3()), hh = path.at(p.z, lx, {}).h;
        const fwd = new T3.Vector3(Math.sin(hh), 0, -Math.cos(hh));
        camPos.copy(hp).addScaledVector(fwd, -0.9); camPos.y += 0.78;
        const ah = path.at(p.z + 2600, lx, {});
        camLook.set(ah.x, ah.y + 0.25, ah.z);
        camera.position.copy(camPos);
        camera.position.y += Math.sin(R.time * 9) * 0.01 * (p.speed / MAXSPEED);
      } else if (fp) player3.visible = false;
      if (R.shake > 0.5) camera.position.add(new T3.Vector3((Math.random() - 0.5) * R.shake * 0.012, (Math.random() - 0.5) * R.shake * 0.012, 0));
      camera.up.copy(up); camera.lookAt(camLook); camera.rotateZ(-p.lean * (fp ? 0.3 : 0.035));
      zoom += ((p.boost ? 1 : 0) - zoom) * Math.min(1, dt * 4);
      camera.fov = cam.fov + zoom * 7 + (p.speed / MAXSPEED) * 3; camera.updateProjectionMatrix();
      // tyre dust / spray behind every bike near the camera, and a cloud when someone goes down
      const em = [];
      for (const r of [p].concat(R.rivals, R.cops)) {
        if (r.car || Math.abs(r.z - p.z) > 12000) continue;
        const crashed = r.state === 'wipe';
        if (crashed && !wipedBefore.has(r)) { wipedBefore.add(r); path.at(r.z, r.x, P); em.push({ x: P.x, y: P.y, z: P.z, h: P.h, speed01: 1, burst: true }); }
        if (!crashed) wipedBefore.delete(r);
        if (r.speed > MAXSPEED * 0.12 && !crashed) { path.at(r.z, r.x, P); em.push({ x: P.x, y: P.y, z: P.z, h: P.h, speed01: Math.min(1, r.speed / (MAXSPEED * PACE)) }); }
      }
      dust.update(dt, em, H, camera.fov);
      skyGroup.position.set(camPos.x, camPos.y, camPos.z);
      sun.target.position.set(player3.position.x, player3.position.y, player3.position.z);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 120);
      gl.setSize(W, H, false);
      if (post) post.render(scene, camera, { time: R.time, speed: zoom * (CAMERAS[o.cam | 0].fp ? 0.6 : 1), bloomMul: o.bloomMul });
      else gl.render(scene, camera);
      overlay.draw(ctx, R, dt, { hud: o.hud, labels: labels });
    },
    dispose() {
      if (envTex) envTex.dispose();
      for (const t of madeTex) t.dispose();
      if (post) post.dispose();
      if (cer) cer.dispose();
      dust.dispose();
      for (const m of [player3].concat(racers3, copBikes3)) if (m.userData.mixer) m.userData.mixer.stopAllAction();
      scene.traverse((o) => {
        // models shared with ASSETS stay on the GPU between races
        if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();   // frees the bone texture of each cloned rider
        if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) { if (m.userData.keep) continue; for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) if (m[k] && !(m[k].userData && m[k].userData.keep)) m[k].dispose(); m.dispose(); }
      });
    },
  };
}
