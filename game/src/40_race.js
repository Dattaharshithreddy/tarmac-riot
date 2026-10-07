/* ---------- race simulation ---------- */
const START_Z = 2000;
const TRAFFIC_TYPES = {      // w and len in road units: 1 unit of x = 9 m, 1 unit of z = 4.5 mm
  car:  { w: 0.24, len: 960,  spd: [0.34, 0.44] },
  rick: { w: 0.18, len: 620,  spd: [0.20, 0.28] },
  truck:{ w: 0.29, len: 1700, spd: [0.24, 0.31] },
  bus:  { w: 0.30, len: 2400, spd: [0.27, 0.34] },
};
const laneOf = (x) => clamp(Math.round((x + 0.75) / 0.5), 0, LANES - 1);

function newRacer(R, slot, style, name, isPlayer) {
  const row = Math.floor(slot / 2), col = slot % 2;
  return {
    z: START_Z + (3 - row) * 420, x: col ? 0.5 : -0.5, tx: col ? 0.5 : -0.5,
    speed: 0, health: 100, state: 'ride', wipeT: 0, inv: 0, cool: 0, atkT: 9, atkSide: 0, hurtT: 0,
    style: style, name: name, weapon: null, finished: false, place: 0, isPlayer: !!isPlayer, lean: 0, think: 0,
    skill: 1, aggr: 0.5,
  };
}

function createRace(save, trackIndex, opts) {
  opts = opts || {};
  const def = TRACKS[trackIndex];
  const seed = (opts.seed || 0) + trackIndex * 977;
  const track = buildTrack(def, 1234 + seed);
  const rnd = makeRng(9876 + seed);
  const R = {
    def: def, track: track, trackIndex: trackIndex, rnd: rnd, stats: bikeStats(save, save.bike),
    time: 0, raceTime: 0, phase: opts.demo ? 'race' : 'countdown', count: 3.4, demo: !!opts.demo,
    events: [], popups: [], shake: 0, flash: 0, burst: 0, heat: 0, bg: 0, bust: 0, lastCop: -99, combo: 0, comboT: 0,
    rivals: [], traffic: [], cops: [], pickups: [], hazards: [], finishedCount: 0, results: null, endDelay: 0,
    nearMisses: 0, takedowns: 0, earned: 0, pickupsCash: 0, speedLines: 0,
  };
  const p = newRacer(R, 7, PLAYER_STYLE, 'You', true);
  p.nitro = 30; p.steer = 0; p.boost = false; p.punchT = 9; p.punchSide = 0; p.cool = 0; p.weapon = null;
  p.takedowns = 0;
  if (opts.demo) { p.z = 6000; p.speed = MAXSPEED * 0.7; }
  R.player = p;

  const names = RIVAL_NAMES.slice().sort(() => rnd() - 0.5);
  for (let i = 0; i < 7; i++) {
    const r = newRacer(R, i, RIVAL_STYLES[i], names[i], false);
    r.skill = 0.95 + rnd() * 0.10;
    r.aggr = 0.3 + rnd() * 0.6;
    if (rnd() < 0.3) { const t = rnd() < 0.5 ? 'chain' : 'bat'; r.weapon = { type: t, uses: 99 }; }
    if (opts.demo) { r.z = 6000 + (i - 3) * 500; r.speed = MAXSPEED * 0.7; }
    R.rivals.push(r);
  }

  const kinds = ['car', 'car', 'car', 'rick', 'truck', 'bus'];
  const nTraffic = Math.floor((def.segs / 1000) * 20 * def.traffic);
  const colors = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22', '#34495e'];
  for (let i = 0; i < nTraffic; i++) {
    const type = pickOf(rnd, kinds);
    const tt = TRAFFIC_TYPES[type];
    R.traffic.push({
      type: type, z: 9000 + rnd() * (track.finishZ - 14000), x: LANE_X[Math.floor(rnd() * LANES)],
      speed: MAXSPEED * (tt.spd[0] + rnd() * (tt.spd[1] - tt.spd[0])), w: tt.w, len: tt.len,
      color: pickOf(rnd, colors), v: Math.floor(rnd() * 4), passed: false, hit: false, minGap: 9,
    });
  }
  const pk = ['cash', 'cash', 'cash', 'nitro', 'nitro', 'chain', 'bat', 'repair', 'repair'];
  for (let i = 0; i < Math.floor(def.segs / 65); i++) {
    R.pickups.push({ type: pickOf(rnd, pk), z: 7000 + rnd() * (track.finishZ - 12000), x: LANE_X[Math.floor(rnd() * LANES)] + (rnd() - 0.5) * 0.2, got: false });
  }
  for (let i = 0; i < Math.floor(def.segs / 100); i++) {
    R.hazards.push({ type: rnd() < 0.5 ? 'cone' : 'barrel', z: 8000 + rnd() * (track.finishZ - 12000), x: LANE_X[Math.floor(rnd() * LANES)] + (rnd() - 0.5) * 0.3, w: 0.12 });
  }
  return R;
}

const fire = (R, name) => R.events.push(name);
const popup = (R, text, color) => { R.popups.push({ text: text, t: 0, color: color || '#ffd400' }); if (R.popups.length > 4) R.popups.shift(); };

function startWipe(R, r) {
  r.state = 'wipe'; r.wipeT = 0;
  if (r.isPlayer) { R.burst = 40; R.shake = 18; R.flash = 0.8; fire(R, 'wipe'); R.heat = Math.min(100, R.heat + 8); }
}
function crashPlayer(R, rel) {
  const p = R.player;
  p.health -= (12 + rel * 42) / R.stats.armor;
  p.speed *= 0.35; p.inv = 1.0; R.shake = 14; R.flash = 0.6; R.burst = 18; fire(R, 'crash');
  R.heat = Math.min(100, R.heat + 6); R.combo = 0;
  if (p.health <= 0 || rel > 0.75) { p.health = Math.max(p.health, 0); startWipe(R, p); }
}
function nearestFreeLane(R, z, x) {
  let best = laneOf(x), bd = 9;
  for (let i = 0; i < LANES; i++) {
    let blocked = false;
    for (const t of R.traffic) if (Math.abs(t.z - z) < 900 && Math.abs(t.x - LANE_X[i]) < 0.4) { blocked = true; break; }
    if (blocked) continue;
    const d = Math.abs(LANE_X[i] - x);
    if (d < bd) { bd = d; best = i; }
  }
  return LANE_X[best];
}
function nearMiss(R) {
  R.combo = R.comboT > 0 ? R.combo + 1 : 1; R.comboT = 3.5; R.nearMisses++;
  const bonus = 15 * R.combo;
  R.earned += bonus; R.player.nitro = Math.min(100, R.player.nitro + 4);
  popup(R, R.combo > 1 ? 'NEAR MISS x' + R.combo + '  +' + rupees(bonus) : 'NEAR MISS  +' + rupees(bonus), '#7CFFB2');
  fire(R, 'near');
}

function damageRacer(R, r, dmg, side) {
  r.health -= dmg; r.x = clamp(r.x + side * 0.2, -1.1, 1.1); r.speed *= 0.84; r.hurtT = 0.3; r.hitN = (r.hitN || 0) + 1; r.hitSide = -side;
  R.shake = Math.max(R.shake, 7); fire(R, 'hit');
  if (r.health <= 0 && r.state === 'ride') {
    startWipe(R, r);
    if (r.isCop) { R.earned += 200; R.takedowns++; R.heat = Math.max(0, R.heat - 20); popup(R, 'COP DOWN  +' + rupees(200), '#7db8ff'); }
    else { R.earned += 100; R.takedowns++; R.player.nitro = Math.min(100, R.player.nitro + 22); R.heat = Math.min(100, R.heat + 14); popup(R, 'TAKEDOWN  +' + rupees(100), '#ff7a3d'); }
    fire(R, 'takedown');
  }
}
function playerPunch(R, side) {
  const p = R.player;
  if (R.phase !== 'race' || p.state !== 'ride' || p.cool > 0 || p.finished) return false;
  p.punchT = 0; p.punchSide = side; p.cool = 0.36;
  const w = p.weapon ? WEAPONS[p.weapon.type] : WEAPONS.fist;
  fire(R, 'swing');
  const targets = R.rivals.concat(R.cops);
  for (const r of targets) {
    if (r.state !== 'ride') continue;
    const dz = r.z - p.z, dx = (r.x - p.x) * side;
    if (dz > -420 && dz < 360 && dx > 0.03 && dx < 0.62) {
      damageRacer(R, r, w.dmg * (0.85 + R.rnd() * 0.3), side);
      if (p.weapon) { p.weapon.uses--; if (p.weapon.uses <= 0) p.weapon = null; }
      return true;
    }
  }
  return false;
}
function rivalAttack(R, r, side) {
  const p = R.player;
  if (p.inv > 0 || p.state !== 'ride' || p.finished) return;
  const dmg = ((7 + r.aggr * 8) * (r.weapon ? 1.6 : 1)) / R.stats.armor;
  p.health -= dmg; p.x = clamp(p.x + side * 0.07, -2.2, 2.2); p.speed *= 0.93; p.inv = 0.4; p.hitN = (p.hitN || 0) + 1; p.hitSide = -side;
  R.shake = Math.max(R.shake, 8); R.flash = Math.max(R.flash, 0.4); fire(R, 'hit'); R.combo = 0;
  if (p.health <= 0) { p.health = 0; startWipe(R, p); }
}

function collect(R, pk) {
  const p = R.player; pk.got = true; fire(R, 'pickup');
  if (pk.type === 'cash') { const v = 50 + Math.floor(R.rnd() * 100); R.earned += v; R.pickupsCash += v; popup(R, '+' + rupees(v), '#7CFFB2'); }
  else if (pk.type === 'nitro') { p.nitro = Math.min(100, p.nitro + 40); popup(R, 'NITRO +40', '#69b7ff'); }
  else if (pk.type === 'repair') { p.health = Math.min(100, p.health + 35); popup(R, 'REPAIRED', '#ff8a8a'); }
  else { p.weapon = { type: pk.type, uses: WEAPONS[pk.type].uses }; popup(R, WEAPONS[pk.type].label.toUpperCase() + ' EQUIPPED', '#ffd400'); }
}

function updatePlayer(R, dt, input) {
  const p = R.player, track = R.track;
  const segP = segAt(track, p.z);
  p.cool = Math.max(0, p.cool - dt); p.inv = Math.max(0, p.inv - dt); p.punchT += dt;
  const racing = R.phase === 'race' && !p.finished;

  if (p.state === 'ride') {
    const tgt = racing ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
    p.steer += (tgt - p.steer) * Math.min(1, dt * 9);
    const sp = p.speed / MAXSPEED;
    const wet = R.def.wet;
    const dx = dt * 2.5 * R.stats.handling * (wet ? 0.9 : 1) * (0.28 + 0.72 * sp);
    p.x += p.steer * dx;
    p.x -= dx * sp * segP.curve * 0.14 * (wet ? 1.2 : 1);
    p.lean += (clamp(p.steer * 0.8 + segP.curve * 0.04 * sp, -1, 1) - p.lean) * Math.min(1, dt * 8);

    const offroad = Math.abs(p.x) > 1.08;
    const boosting = racing && input.nitro && p.nitro > 1 && p.speed > MAXSPEED * 0.15;
    p.boost = boosting;
    let cap = MAXSPEED * R.stats.top * (boosting ? 1.24 : 1);
    if (offroad) cap = Math.min(cap, MAXSPEED * 0.32);
    if (!racing) { p.speed = R.phase === 'finished' ? Math.max(0, p.speed - MAXSPEED * 0.45 * dt) : 0; }
    else if (input.brake) p.speed -= MAXSPEED * 1.1 * dt;
    else if (p.speed < cap) p.speed += (MAXSPEED / 4.2) * R.stats.acc * (boosting ? 2.2 : 1) * dt;
    else p.speed -= (offroad ? MAXSPEED * 0.9 : MAXSPEED * 0.25) * dt;
    p.speed = clamp(p.speed, 0, MAXSPEED * 1.45);
    if (boosting) p.nitro = Math.max(0, p.nitro - 42 * dt); else p.nitro = Math.min(100, p.nitro + 0.8 * dt);
    p.x = clamp(p.x, -2.2, 2.2);
    if (R.def.walls && Math.abs(p.x) > 1.12) {        // bridge parapet
      p.x = sign(p.x) * 1.12; p.steer *= -0.3;
      if (racing && p.inv <= 0 && p.speed > MAXSPEED * 0.25) { p.speed *= 0.72; p.health -= 6 / R.stats.armor; p.inv = 0.5; R.shake = 9; R.burst = 10; fire(R, 'crash'); if (p.health <= 0) { p.health = 0; startWipe(R, p); } }
    }

    // roadside objects
    if (racing && p.inv <= 0) {
      const segs = [segP, segAt(track, p.z + SEG)];
      for (const s of segs) for (const o of s.sprites) {
        if (o.solid && Math.abs(p.x - o.off) < 0.2) { crashPlayer(R, 0.3 + sp * 0.35); p.x = clamp(p.x + sign(p.x - o.off) * 0.25, -2.2, 2.2); break; }
      }
      for (const h of R.hazards) {
        if (Math.abs(h.z - p.z) < 160 && Math.abs(h.x - p.x) < h.w + 0.08) { h.z = -9999; crashPlayer(R, 0.18 + sp * 0.3); break; }
      }
    }
    // traffic
    for (const t of R.traffic) {
      const dz = t.z - p.z;
      if (Math.abs(dz) > t.len * 0.5 + 60) {
        if (!t.passed && dz < 0) {
          t.passed = true;
          if (!t.hit && t.minGap < 0.32 && p.speed > MAXSPEED * 0.45 && racing) nearMiss(R);
        }
        if (dz > 0) { t.passed = false; t.minGap = 9; }
        continue;
      }
      const gap = Math.abs(t.x - p.x) - t.w * 0.5;
      t.minGap = Math.min(t.minGap, gap);
      if (racing && p.inv <= 0 && gap < 0.09) {
        const rel = Math.max(0, (p.speed - t.speed) / MAXSPEED);
        t.hit = true; crashPlayer(R, rel);
        p.speed = Math.min(p.speed, t.speed * 0.85); p.x = clamp(p.x + sign(p.x - t.x || 1) * 0.14, -2.2, 2.2);
      }
    }
    // pickups
    if (racing) for (const pk of R.pickups) {
      if (!pk.got && Math.abs(pk.z - p.z) < 260 && Math.abs(pk.x - p.x) < 0.24) collect(R, pk);
    }
    if (racing) {
      if (input.punchL) { input.punchL = false; playerPunch(R, -1); }
      if (input.punchR) { input.punchR = false; playerPunch(R, 1); }
    } else { input.punchL = input.punchR = false; }
  } else if (p.state === 'wipe') {
    p.speed = Math.max(0, p.speed - MAXSPEED * 0.9 * dt);
    p.wipeT += dt;
    if (p.wipeT > 1.9) {
      p.state = 'ride'; p.health = 55; p.speed = MAXSPEED * 0.18; p.inv = 1.8; p.steer = 0;
      p.x = nearestFreeLane(R, p.z, p.x); p.nitro = Math.max(p.nitro, 10);
    }
  }
  p.z += p.speed * dt;
  if (p.state === 'busted') p.speed = Math.max(0, p.speed - MAXSPEED * 1.2 * dt);
}

function updateRival(R, r, dt) {
  const p = R.player;
  r.cool = Math.max(0, r.cool - dt); r.atkT += dt; r.hurtT = Math.max(0, r.hurtT - dt);
  if (r.state === 'wipe') {
    r.speed = Math.max(0, r.speed - MAXSPEED * 0.9 * dt); r.wipeT += dt; r.z += r.speed * dt;
    if (r.wipeT > 2.4) { r.state = 'ride'; r.health = 70; r.speed = MAXSPEED * 0.2; r.tx = r.x = nearestFreeLane(R, r.z, r.x); }
    return;
  }
  if (R.phase === 'countdown') return;
  const gap = p.z - r.z;
  const band = clamp(gap / 30000, -0.1, 0.12);
  let target = MAXSPEED * R.def.difficulty * r.skill * (1 + band);
  if (r.finished) target = 0;

  r.think -= dt;
  if (r.think <= 0) {
    r.think = 0.12 + R.rnd() * 0.1;
    const li = laneOf(r.x);
    const blockedBy = (lane) => {
      for (const t of R.traffic) { const dz = t.z - r.z; if (dz > 0 && dz < 4800 && Math.abs(t.x - LANE_X[lane]) < 0.42) return t; }
      for (const h of R.hazards) { const dz = h.z - r.z; if (dz > 0 && dz < 3200 && Math.abs(h.x - LANE_X[lane]) < 0.35) return h; }
      return null;
    };
    r.block = blockedBy(li);
    if (r.block) {
      for (const d of [1, -1, 2, -2]) {
        const lj = li + d;
        if (lj >= 0 && lj < LANES && !blockedBy(lj)) { r.tx = LANE_X[lj]; r.block = null; break; }
      }
    } else if (Math.abs(gap) < 900 && r.aggr > 0.5 && p.state === 'ride') {
      r.tx = clamp(p.x + (r.x < p.x ? -0.34 : 0.34), -0.85, 0.85);
    } else if (R.rnd() < 0.15) {
      r.tx = LANE_X[Math.floor(R.rnd() * LANES)];
    }
  }
  if (r.block && r.block.speed !== undefined) target = Math.min(target, r.block.speed * 0.95);
  else if (r.block) target *= 0.75;
  r.speed += clamp(target - r.speed, -MAXSPEED * 0.8 * dt, MAXSPEED * 0.3 * dt);
  r.z += r.speed * dt;
  const prevX = r.x;
  r.x += clamp(r.tx - r.x, -1.9 * dt, 1.9 * dt);
  r.lean += (clamp((r.x - prevX) * 30, -1, 1) - r.lean) * Math.min(1, dt * 8);

  // rivals crash into things they could not avoid
  if (R.phase === 'race' && !r.finished) {
    for (const t of R.traffic) if (Math.abs(t.z - r.z) < t.len * 0.5 + 40 && Math.abs(t.x - r.x) < t.w * 0.5 + 0.08) {
      r.speed = Math.min(r.speed, t.speed * 0.8); r.health -= 12; r.x = clamp(r.x + sign(r.x - t.x || 1) * 0.15, -1.1, 1.1);
      if (r.health <= 0) startWipe(R, r);
      break;
    }
    // attack the player
    const dz = r.z - p.z, dx = p.x - r.x;
    if (p.state === 'ride' && !p.finished && Math.abs(dz) < 420 && Math.abs(dx) > 0.05 && Math.abs(dx) < 0.55 && r.cool <= 0) {
      if (R.rnd() < r.aggr * dt * 2.2) { r.atkSide = sign(dx); r.atkT = 0; r.cool = 1.1 + R.rnd(); rivalAttack(R, r, r.atkSide); }
    }
  }
  if (!r.finished && r.z >= R.track.finishZ) { r.finished = true; R.finishedCount++; r.place = R.finishedCount; }
}

function updateCops(R, dt) {
  const p = R.player;
  const want = R.heat >= 75 ? 2 : R.heat >= 40 ? 1 : 0;
  const active = R.cops.filter((c) => c.state === 'ride').length;
  if (R.phase === 'race' && !p.finished && active < Math.min(want, R.def.cops) && R.time - R.lastCop > 9) {
    R.lastCop = R.time;
    const c = newRacer(R, 0, COP_STYLE, 'Police', false);
    c.isCop = true; c.health = 70; c.z = Math.max(1500, p.z - 5200); c.x = clamp(p.x, -0.8, 0.8); c.tx = c.x; c.speed = Math.max(p.speed, MAXSPEED * 0.5) * 1.05;
    R.cops.push(c); popup(R, 'POLICE ON YOUR TAIL!', '#69b7ff'); fire(R, 'siren');
  }
  let closest = 0;
  for (const c of R.cops) {
    c.cool = Math.max(0, c.cool - dt); c.hurtT = Math.max(0, c.hurtT - dt); c.atkT += dt;
    if (c.state === 'wipe') { c.speed = Math.max(0, c.speed - MAXSPEED * dt); c.wipeT += dt; c.z += c.speed * dt; continue; }
    const dz = c.z - p.z;
    let target;
    if (dz < 0) target = clamp(Math.max(p.speed * 1.04, MAXSPEED * 0.55), 0, MAXSPEED * (0.92 + 0.04 * R.trackIndex)); else target = p.speed * 0.75;
    c.speed += clamp(target - c.speed, -MAXSPEED * dt, MAXSPEED * 0.35 * dt);
    c.z += c.speed * dt;
    c.x += clamp(p.x - c.x, -0.9 * dt, 0.9 * dt);
    const dx = Math.abs(p.x - c.x);
    if (Math.abs(dz) < 380 && dx < 0.4 && p.state === 'ride') closest = Math.max(closest, 1);
  }
  R.cops = R.cops.filter((c) => !(c.state === 'wipe' && c.wipeT > 3) && c.z > p.z - 15000);
  if (closest && R.phase === 'race' && !p.finished) R.bust += dt; else R.bust = Math.max(0, R.bust - dt * 0.8);
  if (R.bust > 3.2 && p.state === 'ride') {
    p.state = 'busted'; R.bust = 0; popup(R, 'BUSTED!', '#ff5d5d'); fire(R, 'busted');
    R.phase = 'finished'; p.finished = true; p.place = 8; R.endDelay = 0; R.busted = true;
  }
  R.heat = Math.max(0, R.heat - (R.cops.length ? 0.4 : 4) * dt);
}

function finishResults(R) {
  const p = R.player;
  const tier = 1 + R.trackIndex * 0.5;
  const table = [0, 1500, 900, 500, 250, 100, 100, 100, 0];
  const prize = R.busted ? 0 : Math.round(table[p.place] * tier);
  let bonus = R.earned;
  let fines = 0;
  if (R.busted) { fines = Math.round(bonus * 0.5); }
  R.results = {
    place: p.place, time: R.raceTime, takedowns: R.takedowns, nearMisses: R.nearMisses, busted: !!R.busted,
    prize: prize, bonus: bonus, fines: fines, total: prize + bonus - fines,
  };
}
function applyResults(save, R) {
  const r = R.results; if (!r) return save;
  save.cash += r.total;
  save.stats.races++; save.stats.takedowns += r.takedowns;
  if (r.place === 1) save.stats.wins++;
  const prev = save.best[R.def.id];
  if (!r.busted && (!prev || r.place < prev)) save.best[R.def.id] = r.place;
  if (!r.busted && r.place <= 3 && R.trackIndex + 1 === save.unlocked && save.unlocked < TRACKS.length) save.unlocked++;
  return save;
}

function stepRace(R, dt, input) {
  dt = Math.min(dt, 1 / 20);
  R.time += dt;
  if (R.phase === 'countdown') {
    R.count -= dt;
    const sec = Math.ceil(R.count);
    if (R.lastSec !== sec) { R.lastSec = sec; if (sec >= 1 && sec <= 3) fire(R, 'beep'); }
    if (R.count <= 0) { R.phase = 'race'; popup(R, 'GO!', '#7CFFB2'); fire(R, 'go'); }
  } else if (R.phase === 'race') R.raceTime += dt;

  updatePlayer(R, dt, input);
  for (const r of R.rivals) updateRival(R, r, dt);
  for (const t of R.traffic) t.z += t.speed * dt;
  updateCops(R, dt);

  const p = R.player;
  if (R.phase === 'race' && !p.finished && p.z >= R.track.finishZ) {
    p.finished = true; p.place = R.finishedCount + 1; R.finishedCount++; R.phase = 'finished'; R.endDelay = 0;
    popup(R, 'FINISH!  ' + ordinal(p.place), '#ffd400'); fire(R, 'finish');
  }
  if (R.phase === 'finished') {
    R.endDelay += dt;
    if (!R.results && R.endDelay > 2.6) finishResults(R);
  }
  // live position
  if (!p.finished) {
    let ahead = 0;
    for (const r of R.rivals) if (r.finished || r.z > p.z) ahead++;
    p.livePlace = ahead + 1;
  } else p.livePlace = p.place;

  R.comboT = Math.max(0, R.comboT - dt);
  R.shake = Math.max(0, R.shake - dt * 30); R.flash = Math.max(0, R.flash - dt * 1.8);
  for (const q of R.popups) q.t += dt;
  R.popups = R.popups.filter((q) => q.t < 2.2);
  const segP = segAt(R.track, p.z);
  R.bg += segP.curve * (p.speed / MAXSPEED) * dt * 0.0016;
  return R;
}

/* simple driver used for the menu background and for tests */
function autopilot(R, input) {
  const p = R.player;
  input.left = input.right = input.brake = input.nitro = false;
  let best = 0, bestScore = -1e9;
  for (let i = 0; i < LANES; i++) {
    let clear = 7000;
    for (const t of R.traffic) { const dz = t.z - p.z; if (dz > -200 && dz < clear && Math.abs(t.x - LANE_X[i]) < 0.45) clear = dz; }
    for (const h of R.hazards) { const dz = h.z - p.z; if (dz > 0 && dz < clear && Math.abs(h.x - LANE_X[i]) < 0.4) clear = dz; }
    const score = clear - Math.abs(LANE_X[i] - p.x) * 900;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  const err = LANE_X[best] - p.x;
  if (err > 0.07) input.right = true; else if (err < -0.07) input.left = true;
  if (bestScore < 2200 || (Math.abs(segAt(R.track, p.z).curve) > 3.5 && p.speed > MAXSPEED * 0.95)) input.brake = true;
  if (R.phase === 'race' && p.state === 'ride') {
    for (const r of R.rivals.concat(R.cops)) {
      if (r.state !== 'ride') continue;
      const dz = r.z - p.z, dx = r.x - p.x;
      if (dz > -400 && dz < 340 && Math.abs(dx) > 0.04 && Math.abs(dx) < 0.6) { if (dx > 0) input.punchR = true; else input.punchL = true; break; }
    }
  }
  if (p.nitro > 45 && Math.abs(segAt(R.track, p.z).curve) < 1.5) input.nitro = true;
  return input;
}
