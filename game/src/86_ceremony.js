/* ---------- post-race victory ceremony (podium finish, 3D only) ----------
   A 16 second cutscene on the road just past the finish line: the Blender podium set, the top three
   riders standing on the blocks (winner lifts the trophy, the others clap and spray champagne),
   their bikes parked in front, confetti cannons, fireworks and camera flashes, shot as five camera
   moves with letterbox bars and title cards. */
const CEREMONY_LEN = 16;

// pose a skinned rider by aiming bones: dirs are in the rider's own frame (up +Y, forward -Z, his left -X)
const _q = () => new THREE.Quaternion(), _v = () => new THREE.Vector3();
const CHAIN = { hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head', upperarmL: 'forearmL', forearmL: 'handL', upperarmR: 'forearmR', forearmR: 'handR', thighL: 'shinL', shinL: 'footL', thighR: 'shinR', shinR: 'footR' };
function aimBones(d, dirs, rootQuat) {
  const Y = new THREE.Vector3(0, 1, 0), pq = _q(), wq = _q(), cur = _v(), want = _v(), dq = _q(), inv = _q();
  for (const n in d.restQ) d.bones[n].quaternion.copy(d.restQ[n]);
  d.rider.updateMatrixWorld(true);
  for (const [name, dir] of dirs) {
    const b = d.bones[name]; if (!b) continue;
    b.getWorldQuaternion(wq);
    const kid = d.bones[CHAIN[name]];
    const a = b.getWorldPosition(_v());
    if (kid && kid.getWorldPosition(_v()).distanceTo(a) > 0.02) cur.copy(kid.getWorldPosition(_v())).sub(a).normalize();
    else cur.copy(Y).applyQuaternion(wq);
    want.set(dir[0], dir[1], dir[2]).normalize().applyQuaternion(rootQuat);
    dq.setFromUnitVectors(cur, want);
    const nw = dq.multiply(wq);
    if (b.parent) { b.parent.getWorldQuaternion(pq); inv.copy(pq).invert(); b.quaternion.copy(inv.multiply(nw)); } else b.quaternion.copy(nw);
    b.updateMatrixWorld(true);
  }
}
function standPose(role, t, seed) {
  const s = Math.sin(t * 5 + seed), c = Math.sin(t * 11 + seed);
  const base = [
    ['hips', [0, 1, 0.02]], ['spine', [0, 1, -0.02]], ['chest', [0, 1, -0.04]], ['neck', [0, 1, -0.12]], ['head', [0, 1, -0.08]],
    ['thighL', [-0.07, -1, 0.0]], ['shinL', [-0.02, -1, 0.04]], ['footL', [-0.1, -0.35, -1]],
    ['thighR', [0.07, -1, 0.0]], ['shinR', [0.02, -1, 0.04]], ['footR', [0.1, -0.35, -1]],
  ];
  let arms;
  if (role === 'win') {      // both fists up, pumping
    const p = 0.12 * s;
    arms = [['upperarmL', [-0.45 - p, 0.88, -0.1]], ['forearmL', [-0.22, 1, -0.05 + p]], ['handL', [-0.1, 1, 0]],
            ['upperarmR', [0.45 + p, 0.88, -0.1]], ['forearmR', [0.22, 1, -0.05 + p]], ['handR', [0.1, 1, 0]]];
  } else if (role === 'spray') {   // right arm out spraying, left waving
    arms = [['upperarmL', [-0.6, 0.6 + 0.2 * s, -0.3]], ['forearmL', [-0.3, 1, -0.2]], ['handL', [-0.2, 1, 0]],
            ['upperarmR', [0.5, 0.25, -0.8]], ['forearmR', [0.25, 0.45, -1]], ['handR', [0.2, 0.5, -1]]];
  } else {                   // clapping
    const k = 0.25 + 0.2 * c;
    arms = [['upperarmL', [-0.3, -0.55, -0.75]], ['forearmL', [k, 0.35, -0.9]], ['handL', [k + 0.2, 0.3, -0.8]],
            ['upperarmR', [0.3, -0.55, -0.75]], ['forearmR', [-k, 0.35, -0.9]], ['handR', [-k - 0.2, 0.3, -0.8]]];
  }
  return base.concat(arms);
}

function createCeremony(env) {
  const T3 = THREE, { scene, path, R, camera, glowTex } = env;
  const g = new T3.Group(); scene.add(g);
  const fz = R.track.finishZ + 4500, at = path.at(fz, 0, {});
  g.position.set(at.x, at.y, at.z); g.rotation.y = -at.h;       // stage front (+Z) faces back toward the finish gate
  let stage = null, trophy = null;
  if (ASSETS.gltf.podium) {
    const sc = ASSETS.gltf.podium.scene.clone(true);
    stage = sc.getObjectByName('podium'); trophy = sc.getObjectByName('trophy');
    if (stage) { stage.position.set(0, 0, 0); g.add(stage); stage.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }
    if (trophy) { trophy.position.set(0, 0, 0); trophy.scale.setScalar(1.5); }
  }
  // stage lights so the podium reads even on a grey day
  const key = new T3.SpotLight('#fff1d8', 2.2, 40, 0.7, 0.5); key.position.set(0, 9, 9); key.target.position.set(0, 1.5, -0.4); g.add(key); g.add(key.target);
  const fill = new T3.PointLight('#ffe2c0', 1.4, 18); fill.position.set(0, 3.2, 5.5); g.add(fill);

  // who stands where
  const p = R.player, all = [p].concat(R.rivals);
  const order = all.slice().sort((a, b) => (a.place || 99) - (b.place || 99) || b.z - a.z);
  const top = order.slice(0, 3);                                     // 1st, 2nd, 3rd
  const SPOT = [[0, 1.6, -0.4], [-2.5, 1.25, -0.4], [2.5, 0.97, -0.4]];
  const riders = top.map((r, i) => ({ r: r, m: r.isPlayer ? env.player3 : env.racers3[R.rivals.indexOf(r)], spot: SPOT[i], place: i + 1, name: r.isPlayer ? 'YOU' : r.name }));
  for (const e of riders) {
    const d = e.m.userData; e.bikeWasVisible = d.bikeG.visible; d.bikeG.visible = false;
    if (d.userBlob) d.userBlob.visible = false;
    if (d.blob) d.blob.visible = false;
    for (const s in d.hands) { const h = d.hands[s]; h.bat.visible = h.chain.visible = h.rod.visible = h.lathi.visible = false; }
    if (d.os) { d.os.stop(); d.os = null; }
  }
  if (trophy && riders[0]) { const hb = riders[0].m.userData.rider.getObjectByName('handR'); if (hb) hb.add(trophy); else g.add(trophy); }
  // their bikes, parked on stands in front of the stage
  const parked = riders.map((e, i) => {
    const b = cloneModel('bike_lo', { BodyPaint: e.r.isPlayer ? R.stats.color : e.r.style.bike }) || new T3.Group();
    b.position.set([0, -3.2, 3.2][i], 0, 4.6 + (i ? 0.6 : 0)); b.rotation.set(0, 0.5 + (i - 1) * 0.35, -0.12);
    b.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.add(b); return b;
  });

  // ---- particles: confetti (square, normal blending) and fireworks / champagne (additive glow) ----
  function points(N, additive, sizeScale) {
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
    const geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.BufferAttribute(pos, 3)); geo.setAttribute('color', new T3.BufferAttribute(col, 3));
    geo.setAttribute('size', new T3.BufferAttribute(size, 1)); geo.setAttribute('alpha', new T3.BufferAttribute(alpha, 1));
    const mat = new T3.ShaderMaterial({
      uniforms: { map: { value: glowTex }, scale: { value: 300 }, square: { value: additive ? 0 : 1 } },
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale; void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; uniform float square; varying float vA; varying vec3 vC; void main(){ float a = square > 0.5 ? 1.0 : texture2D(map, gl_PointCoord).a; if (a * vA < 0.02) discard; gl_FragColor = vec4(vC * (square > 0.5 ? 1.0 : 2.5), a * vA); }',
      transparent: true, depthWrite: false, blending: additive ? T3.AdditiveBlending : T3.NormalBlending,
    });
    const o = new T3.Points(geo, mat); o.frustumCulled = false; o.renderOrder = 6; g.add(o);
    return { N: N, pos: pos, col: col, size: size, alpha: alpha, vel: new Float32Array(N * 3), age: new Float32Array(N).fill(99), life: new Float32Array(N), geo: geo, mat: mat, next: 0, scale: sizeScale };
  }
  const confetti = points(700, false), sparks = points(1400, true), spray = points(260, true);
  const C_CONF = ['#ff6a00', '#ffd400', '#2fbf71', '#2d6cdf', '#e63946', '#ffffff', '#ff4fd8'].map((c) => new T3.Color(c));
  const C_FW = ['#ffcf4a', '#ff4a3d', '#4ad1ff', '#7dff6a', '#ff6af0', '#ffffff'].map((c) => new T3.Color(c));
  function emit(P, x, y, z, vx, vy, vz, c, life, size) {
    const i = P.next; P.next = (P.next + 1) % P.N;
    P.pos.set([x, y, z], i * 3); P.vel.set([vx, vy, vz], i * 3); P.col.set([c.r, c.g, c.b], i * 3);
    P.age[i] = 0; P.life[i] = life; P.size[i] = size; P.alpha[i] = 1;
  }
  function cannon(x) {          // a confetti blast from a stage cannon, up and toward the centre
    for (let k = 0; k < 220; k++) emit(confetti, x, 1.5, 1.8, -Math.sign(x) * (1 + Math.random() * 3), 7 + Math.random() * 6, (Math.random() - 0.3) * 3, C_CONF[k % C_CONF.length], 4 + Math.random() * 2, 0.07 + Math.random() * 0.05);
  }
  const shells = [];
  const bursts = [0, 1, 2, 3].map(() => { const sp = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, depthWrite: false, blending: T3.AdditiveBlending })); sp.visible = false; g.add(sp); return { s: sp, t: 9 }; });
  function launch() { shells.push({ x: (Math.random() - 0.5) * 24, y: 2, z: -5 - Math.random() * 8, vy: 17 + Math.random() * 5, t: 0, fuse: 0.75 + Math.random() * 0.35, c: C_FW[Math.floor(Math.random() * C_FW.length)] }); }
  function burst(s) {
    const n = 140, c2 = Math.random() < 0.4 ? C_FW[Math.floor(Math.random() * C_FW.length)] : s.c;
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = 7 + Math.random() * 3;
      emit(sparks, s.x, s.y, s.z, Math.cos(a) * r * sp, u * sp, Math.sin(a) * r * sp, k % 3 ? s.c : c2, 1.4 + Math.random() * 0.8, 1.1);
    }
    // a bright flash where the shell breaks, so it reads even against a daytime sky
    const fl = bursts.find((b) => b.t > 0.6) || bursts[0];
    if (fl) { fl.t = 0; fl.s.position.set(s.x, s.y, s.z); fl.s.material.color.copy(s.c); fl.s.visible = true; }
    env.events.push('firework');
  }
  function stepPoints(P, dt, grav, drag, flutter) {
    for (let i = 0; i < P.N; i++) {
      if (P.age[i] > P.life[i]) { P.alpha[i] = 0; continue; }
      P.age[i] += dt; const t = P.age[i] / P.life[i];
      P.vel[i * 3 + 1] -= grav * dt;
      const k = Math.pow(drag, dt * 60); P.vel[i * 3] *= k; P.vel[i * 3 + 1] *= k; P.vel[i * 3 + 2] *= k;
      if (flutter) { P.vel[i * 3] += Math.sin(P.age[i] * 7 + i) * flutter * dt; P.vel[i * 3 + 1] = Math.max(P.vel[i * 3 + 1], -1.6); }
      P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      if (P.pos[i * 3 + 1] < 0.36) { P.pos[i * 3 + 1] = 0.36; P.vel[i * 3] = P.vel[i * 3 + 1] = P.vel[i * 3 + 2] = 0; }
      P.alpha[i] = flutter ? Math.min(1, (1 - t) * 4) : (1 - t) * (1 - t);
    }
    P.geo.attributes.position.needsUpdate = P.geo.attributes.alpha.needsUpdate = P.geo.attributes.color.needsUpdate = P.geo.attributes.size.needsUpdate = true;
  }
  // photographer flashes along the front of the stage
  const flashes = [];
  for (let i = 0; i < 6; i++) {
    const s = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, depthWrite: false, blending: T3.AdditiveBlending }));
    s.position.set(-6 + i * 2.4 + Math.random(), 1.6 + Math.random() * 0.4, 7 + Math.random() * 3); s.scale.set(2.2, 2.2, 1); s.visible = false; g.add(s); flashes.push({ s: s, t: Math.random() * 3 });
  }

  // camera moves in stage space: [start, end, from pos, to pos, from look, to look]
  const W3 = riders[0] ? riders[0].spot : SPOT[0];
  const SHOTS = [
    [0, 3.5, [0, 13, 30], [7, 4.5, 15], [0, 4, 0], [0, 2.6, 0]],
    [3.5, 6, [6.2, 2.2, 5.5], [4.6, 2.1, 4.2], [2.5, 1.9, -0.4], [2.5, 2.0, -0.4]],
    [6, 8.5, [-6.4, 2.6, 5.5], [-4.8, 2.4, 4.2], [-2.5, 2.2, -0.4], [-2.5, 2.3, -0.4]],
    [8.5, 12.5, null, null, [W3[0], W3[1] + 1.1, W3[2]], [W3[0], W3[1] + 1.2, W3[2]]],
    [12.5, CEREMONY_LEN, [0, 3.5, 11], [5, 7.5, 17.5], [0, 3.6, 0], [0, 8.5, -4]],
  ];
  const tmpV = _v(), lookV = _v(), lerp3 = (a, b, k, out) => out.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
  const ease = (k) => k * k * (3 - 2 * k);
  let lastT = -1, fwTimer = 0, cannonsFired = false, cheer = false;
  const rootQ = new T3.Quaternion();

  return {
    riders: riders,
    shot(t) { for (let i = 0; i < SHOTS.length; i++) if (t < SHOTS[i][1]) return i; return SHOTS.length - 1; },
    update(t, dt) {
      if (lastT < 0) { env.events.push('cheer'); cheer = true; }
      // riders on their blocks
      riders.forEach((e, i) => {
        const m = e.m, d = m.userData;
        m.visible = true; m.position.copy(g.localToWorld(tmpV.set(e.spot[0], e.spot[1], e.spot[2])));
        m.rotation.set(0, -at.h + Math.PI + (i === 1 ? 0.25 : i === 2 ? -0.25 : 0), 0);
        d.riderG.position.set(0, 0.97, 0); d.riderG.rotation.set(0, 0, 0);
        m.updateMatrixWorld(true); d.riderG.getWorldQuaternion(rootQ);
        const role = i === 0 ? 'win' : t > 9 ? 'spray' : 'clap';
        aimBones(d, standPose(role, t, i * 1.7), rootQ);
      });
      if (trophy && trophy.parent && trophy.parent.isBone) {     // keep the cup upright in the winner's hand
        trophy.position.set(0, 0.05, 0);
        const pq = trophy.parent.getWorldQuaternion(_q()), up = _q().setFromAxisAngle(new T3.Vector3(0, 1, 0), -at.h);
        trophy.quaternion.copy(pq.invert().multiply(up));
      }
      // effects
      if (!cannonsFired && t > 8.6) { cannonsFired = true; cannon(-6.4); cannon(6.4); env.events.push('cannon'); }
      fwTimer -= dt; if (t > 1 && fwTimer <= 0) { fwTimer = t > 12 ? 0.22 : 0.6 + Math.random() * 0.5; launch(); if (t > 12) launch(); }
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i]; s.t += dt; s.vy -= 9.8 * dt; s.y += s.vy * dt;
        if (Math.random() < 0.8) emit(sparks, s.x, s.y, s.z, (Math.random() - 0.5) * 0.4, -1, (Math.random() - 0.5) * 0.4, C_FW[0], 0.4, 0.25);
        if (s.t > s.fuse) { burst(s); shells.splice(i, 1); }
      }
      if (t > 9 && t < 14) for (let k = 1; k < riders.length; k++) {     // champagne from 2nd and 3rd toward the winner
        const hb = riders[k].m.userData.rider.getObjectByName('handR'); if (!hb) continue;
        const hp = g.worldToLocal(hb.getWorldPosition(_v()));
        for (let j = 0; j < 4; j++) emit(spray, hp.x, hp.y + 0.1, hp.z, (W3[0] - hp.x) * (0.9 + Math.random() * 0.5), 2.5 + Math.random() * 2, (Math.random() - 0.2) * 1.5, new T3.Color('#fff6dc'), 0.9, 0.22);
      }
      for (const b of bursts) { b.t += dt; const k2 = Math.max(0, 1 - b.t / 0.5); b.s.visible = k2 > 0; b.s.scale.setScalar(4 + 10 * (1 - k2)); b.s.material.opacity = k2; }
      for (const f of flashes) { f.t -= dt; f.s.visible = false; if (f.t < 0) { f.s.visible = true; f.t = 0.4 + Math.random() * 2.2; } }
      const fov = camera.fov;
      for (const P of [confetti, sparks, spray]) P.mat.uniforms.scale.value = env.H / (2 * Math.tan(fov * Math.PI / 360));
      stepPoints(confetti, dt, 6, 0.985, 2.5); stepPoints(sparks, dt, 3.5, 0.97, 0); stepPoints(spray, dt, 7, 0.99, 0);
      // camera
      const si = this.shot(t), S = SHOTS[si], k = ease(Math.min(1, (t - S[0]) / (S[1] - S[0])));
      if (S[2]) lerp3(S[2], S[3], k, tmpV); else { const a = -0.7 + k * 1.3, r = 4.6 - k * 0.6; tmpV.set(W3[0] + Math.sin(a) * r, W3[1] + 1.0 + k * 0.4, W3[2] + Math.cos(a) * r); }
      lerp3(S[4], S[5], k, lookV);
      camera.position.copy(g.localToWorld(tmpV)); camera.up.set(0, 1, 0); camera.lookAt(g.localToWorld(lookV));
      camera.fov = si === 3 ? 42 : si === 0 || si === 4 ? 55 : 46; camera.updateProjectionMatrix();
      lastT = t;
      return { flash: flashes.some((f) => f.s.visible) ? 0.04 : 0 };
    },
    // 2D layer: letterbox, title cards, skip hint
    drawOverlay(ctx, t, W, H) {
      ctx.clearRect(0, 0, W, H);
      if (t >= CEREMONY_LEN) return;
      const u = H / 540, bar = H * 0.1 * Math.min(1, t / 0.6);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      const title = (txt, sub, col, t0, t1, big) => {
        if (t < t0 || t > t1) return;
        const k = Math.min(1, (t - t0) / 0.35, (t1 - t) / 0.35), x = W * 0.06 - (1 - k) * 40 * u, y = H * 0.74;
        ctx.save(); ctx.globalAlpha = Math.max(0, k);
        ctx.font = 'italic 900 ' + Math.round((big ? 64 : 46) * u) + 'px ' + FONT; ctx.textAlign = 'left';
        ctx.lineWidth = 7 * u; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
        if (sub) { ctx.font = 'italic 800 ' + Math.round(22 * u) + 'px ' + FONT; ctx.lineWidth = 4 * u; ctx.strokeText(sub, x + 4 * u, y + 34 * u); ctx.fillStyle = '#fff'; ctx.fillText(sub, x + 4 * u, y + 34 * u); }
        ctx.restore();
      };
      const pl = R.player.place, tn = R.def.name.toUpperCase();
      title('PODIUM CEREMONY', tn, '#ffd400', 0.4, 3.4, true);
      if (riders[2]) title('3RD  ' + riders[2].name, riders[2].r.isPlayer ? 'Bronze for you' : 'Bronze', '#e0965a', 3.7, 5.9);
      if (riders[1]) title('2ND  ' + riders[1].name, riders[1].r.isPlayer ? 'Silver for you' : 'Silver', '#d6dbe3', 6.2, 8.4);
      if (riders[0]) title(riders[0].r.isPlayer ? 'CHAMPION!' : '1ST  ' + riders[0].name, riders[0].r.isPlayer ? 'You won the ' + tn : 'Winner', '#ffd400', 8.8, 12.4, true);
      title(pl === 1 ? 'VICTORY' : 'PODIUM FINISH  ' + ordinal(pl), 'Prize money incoming', '#ff8a3d', 12.7, CEREMONY_LEN - 0.2, true);
      ctx.font = '800 ' + Math.round(14 * u) + 'px ' + FONT; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText('TAP TO SKIP  ▶▶', W - 18 * u, H - bar - 12 * u);
    },
    dispose() {
      riders.forEach((e) => { const d = e.m.userData; d.bikeG.visible = e.bikeWasVisible !== false; for (const n in d.restQ) d.bones[n].quaternion.copy(d.restQ[n]); });
      if (trophy && trophy.parent) trophy.parent.remove(trophy);
      scene.remove(g);
      for (const P of [confetti, sparks, spray]) { P.geo.dispose(); P.mat.dispose(); }
    },
  };
}
