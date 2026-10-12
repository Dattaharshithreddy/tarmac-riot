/* ---------- track builder ---------- */
const NEAR_SOLID = { palm: 1, coconut: 1, lamp: 1, pole: 1, cactus: 1, rock: 1, marker: 1, chorten: 1, tree: 1, poplar: 1, sign: 1, warn: 1, speed: 1 };
const FAR_TYPES = { building: 1, house: 1, fort: 1, billboard: 1, dhaba: 1, pump: 1 };

function buildTrack(def, seed) {
  const rnd = makeRng(seed);
  const pal = def.pal;
  const segs = [];
  const lastY = () => (segs.length ? segs[segs.length - 1].p2.world.y : 0);

  function addSegment(curve, y) {
    const n = segs.length;
    segs.push({
      index: n,
      p1: { world: { y: lastY(), z: n * SEG }, camera: {}, screen: {} },
      p2: { world: { y: y, z: (n + 1) * SEG }, camera: {}, screen: {} },
      curve: curve, sprites: [], color: Math.floor(n / RUMBLE) % 2, finish: false, gate: null,
    });
  }
  function addRoad(enter, hold, leave, curve, y) {
    const startY = lastY();
    const endY = startY + y * SEG;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  }
  const hillDelta = () => {
    let d = pickOf(rnd, def.mix.hill) * (rnd() < 0.5 ? -1 : 1);
    const cur = lastY() / SEG;
    if (cur + d > def.mix.maxUp) d = -Math.abs(d);
    if (cur + d < -def.mix.maxDown) d = Math.abs(d);
    return d;
  };
  const curveVal = () => pickOf(rnd, def.mix.curve) * (rnd() < 0.5 ? -1 : 1);

  const sections = [
    () => addRoad(20, 30 + Math.floor(rnd() * 40), 20, 0, 0),
    () => addRoad(25, 40 + Math.floor(rnd() * 30), 25, curveVal(), 0),
    () => addRoad(25, 45, 25, curveVal(), hillDelta()),
    () => addRoad(30, 50 + Math.floor(rnd() * 40), 30, 0, hillDelta()),
    () => { const c = curveVal(); addRoad(20, 30, 20, c, 0); addRoad(20, 30, 20, -c, hillDelta() * 0.5); },
    () => {
      if (def.bumps) { for (let i = 0; i < 4; i++) { const b = 4 + Math.floor(rnd() * 4); addRoad(8, 8, 8, 0, b); addRoad(8, 8, 8, 0, -b); } }
      else addRoad(20, 40, 20, 0, 0);
    },
  ];
  const weights = [2.2, 2.4, 2.0, 1.4, 1.6, def.bumps ? 1.2 : 0.4];

  addRoad(25, 25, 25, 0, 0);
  while (segs.length < def.segs - 160) pickWeighted(rnd, sections, weights)();
  const y = lastY() / SEG;
  addRoad(40, 50, 40, 0, -y);
  addRoad(10, 40, 10, 0, 0);
  const F = segs.length;                 // finish line segment index
  addRoad(100, 200, 120, 0, 0);          // run-out so the road never wraps into view

  segs[F].finish = true; segs[F + 1].finish = true;
  segs[F + 1].gate = 'finish';
  segs[32].gate = 'start';

  // crash barriers on bends and steep drops (not on the bridge, which has its own walls)
  if (!def.walls) {
    for (let n = 40; n < F; n++) {
      const c = Math.abs(segs[n].curve), dy = Math.abs(segs[n].p2.world.y - segs[n].p1.world.y);
      if (c >= 2.5 || dy > 30) for (let k = Math.max(0, n - 12); k <= Math.min(F, n + 12); k++) segs[k].rail = true;
    }
  }
  // road signs: curve warnings before bends, distance boards and speed limits along the way
  let lastWarn = -999;
  for (let n = 60; n < F - 40; n++) {
    const c = segs[n + 30].curve, c0 = segs[n + 29].curve;
    if (Math.abs(c) >= 2 && Math.abs(c0) < 2 && n - lastWarn > 90) { segs[n].sprites.push({ t: 'warn', off: -1.32, v: c > 0 ? 1 : 0, solid: true }); lastWarn = n; }
    if (n % 620 === 300) segs[n].sprites.push({ t: 'sign', off: -1.42, v: Math.floor(n / 620) % 4, solid: true });
    if (n % 620 === 520) segs[n].sprites.push({ t: 'speed', off: -1.3, v: 0, solid: true });
  }
  // roadside scenery
  for (let n = 16; n < F + 80; n += 3 + Math.floor(rnd() * 5)) {
    for (const side of [-1, 1]) {
      if (rnd() < 0.3) continue;
      const t = pickWeighted(rnd, pal.scenery, pal.weights);
      let off = side * (FAR_TYPES[t] ? 2.4 + rnd() * 3.2 : 1.35 + rnd() * 1.1);
      if (t === 'dhaba' || t === 'pump') off = side * (1.75 + rnd() * 0.4);
      if (segs[n].rail && !FAR_TYPES[t] && Math.abs(off) < 1.5) off = side * 1.5;
      segs[n].sprites.push({ t: t, off: off, v: Math.floor(rnd() * 4), solid: !!NEAR_SOLID[t] });
    }
  }
  return { def: def, pal: pal, segs: segs, F: F, finishZ: F * SEG, length: segs.length * SEG };
}
const segAt = (track, z) => track.segs[clamp(Math.floor(z / SEG), 0, track.segs.length - 1)];
