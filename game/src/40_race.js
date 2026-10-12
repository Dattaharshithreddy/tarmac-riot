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
    skill: 1, aggr: 0.5, atkKind: 'punch', lastHitBy: -99, id: ++R.uid,
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
    uid: 0, wanted: 0, calmT: 0, offences: 0, patrols: [], copsDown: 0, accidents: 0,
  };
  const p = newRacer(R, 7, PLAYER_STYLE, 'You', true);
  p.nitro = 30; p.steer = 0; p.boost = false; p.punchT = 9; p.punchSide = 0; p.punchKind = 'punch'; p.cool = 0; p.weapon = null;
  p.takedowns = 0;
  if (opts.demo) { p.z = 6000; p.speed = MAXSPEED * 0.7; }
  R.player = p;

  const names = RIVAL_NAMES.slice().sort(() => rnd() - 0.5);
  for (let i = 0; i < 7; i++) {
    const r = newRacer(R, i, RIVAL_STYLES[i], names[i], false);
    r.skill = 0.95 + rnd() * 0.10;
    r.aggr = 0.3 + rnd() * 0.6;
    if (rnd() < 0.4) { const t = pickOf(rnd, ['chain', 'bat', 'rod']); r.weapon = { type: t, uses: 99 }; }
    if (opts.demo) { r.z = 6000 + (i - 3) * 500; r.speed = MAXSPEED * 0.7; }
    R.rivals.push(r);
  }

  const kinds = ['car', 'car', 'car', 'rick', 'truck', 'bus'];
  const nTraffic = Math.floor((def.segs / 1000) * 20 * def.traffic);
  const colors = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22', '#34495e'];
  for (let i = 0; i < nTraffic; i++) {
    const type = pickOf(rnd, kinds);
    const tt = TRAFFIC_TYPES[type];
    const dir = def.twoWay && rnd() < 0.42 ? -1 : 1;
    const lane = dir < 0 ? pickOf(rnd, ONCOMING_LANES) : def.twoWay ? pickOf(rnd, OWN_LANES) : Math.floor(rnd() * LANES);
    R.traffic.push({
      type: type, z: 9000 + rnd() * (track.finishZ - 14000), x: LANE_X[lane], dir: dir,
      speed: dir * MAXSPEED * (tt.spd[0] + rnd() * (tt.spd[1] - tt.spd[0])), w: tt.w, len: tt.len,
      color: pickOf(rnd, colors), v: Math.floor(rnd() * 4), passed: false, hit: false, minGap: 9,
    });
  }
  // police checkpoints: a patrol jeep parked at the roadside every few kilometres
  const nPatrol = 2 + def.cops;
  for (let i = 0; i < nPatrol; i++) {
    const z = Math.round(track.finishZ * (0.16 + 0.78 * (i + 0.5) / nPatrol) / SEG) * SEG;
    R.patrols.push({ z: z, x: -1.24, used: false });
    // clear the verge so the jeep and its barricades have room
    for (let k = z / SEG - 10; k <= z / SEG + 10; k++) { const sg = track.segs[k]; if (sg) sg.sprites = sg.sprites.filter((o) => o.off > 0 || o.off < -3.2); }
  }
  const pk = ['cash', 'cash', 'cash', 'nitro', 'nitro', 'chain', 'bat', 'rod', 'repair', 'repair'];
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

const playerCap = (R) => MAXSPEED * PACE * R.stats.top;
const copNear = (R, dist) => R.cops.some((c) => c.state === 'ride' && Math.abs(c.z - R.player.z) < dist);
/* Breaking the law raises the wanted level. Police are only sent after you for accidents and for attacking them. */
function offence(R, stars, why, cap) {
  if (R.demo || R.phase !== 'race' || R.player.finished) return;
  const before = R.wanted;
  R.wanted = Math.max(R.wanted, Math.min(cap || 5, R.wanted + stars)); R.calmT = 0; R.offences++;
  R.heat = R.wanted * 20;
  if (R.wanted > before) { popup(R, (before === 0 ? 'POLICE ALERTED: ' : 'WANTED UP: ') + why, '#69b7ff'); if (before === 0) R.lastCop = -99; }
  // a nearby checkpoint joins the chase straight away
  for (const pt of R.patrols) if (!pt.used && Math.abs(pt.z - R.player.z) < 9000) launchPatrol(R, pt);
}
function startWipe(R, r) {
  r.state = 'wipe'; r.wipeT = 0;
  if (r.isPlayer) {
    R.burst = 40; R.shake = 18; R.flash = 0.8; fire(R, 'wipe');
    if (R.wanted >= 2 && copNear(R, 1600)) R.bustPending = true;   // went down with police right behind
  }
}
function crashPlayer(R, rel, what) {
  const p = R.player;
  p.health -= (12 + rel * 42) / R.stats.armor;
  p.speed *= 0.35; p.inv = 1.0; R.shake = 14; R.flash = 0.6; R.burst = 18; fire(R, 'crash');
  R.combo = 0;
  if (what === 'vehicle' && rel > 0.22) { R.accidents++; offence(R, rel > 0.75 ? 2 : 1, rel > 0.75 ? 'HEAD-ON CRASH' : 'ACCIDENT', rel > 0.75 ? 4 : 3); }
  if (p.health <= 0 || rel > 0.75) { p.health = Math.max(p.health, 0); startWipe(R, p); }
}
function nearestFreeLane(R, z, x) {
  let best = R.def.twoWay ? 1 : laneOf(x), bd = 9;
  for (let i = 0; i < LANES; i++) {
    if (R.def.twoWay && i >= 2) continue;
    let blocked = false;
    for (const t of R.traffic) if (t.z - z > -900 && t.z - z < (t.dir < 0 ? 9000 : 900) && Math.abs(t.x - LANE_X[i]) < 0.4) { blocked = true; break; }
    if (blocked) continue;
    const d = Math.abs(LANE_X[i] - x);
    if (d < bd) { bd = d; best = i; }
  }
  return LANE_X[best];
}
function nearMiss(R, oncoming) {
  R.combo = R.comboT > 0 ? R.combo + 1 : 1; R.comboT = 3.5; R.nearMisses++;
  const bonus = (oncoming ? 25 : 15) * R.combo;
  R.earned += bonus; R.player.nitro = Math.min(100, R.player.nitro + 4);
  const label = oncoming ? 'CLOSE CALL' : 'NEAR MISS';
  popup(R, R.combo > 1 ? label + ' x' + R.combo + '  +' + rupees(bonus) : label + '  +' + rupees(bonus), '#7CFFB2');
  fire(R, 'near');
}

function damageRacer(R, r, dmg, side, push, byPlayer) {
  r.health -= dmg; r.x = clamp(r.x + side * (r.car ? 0.03 : push || 0.2), -1.25, 1.25); r.speed *= r.car ? 0.95 : 0.84; r.hurtT = 0.3; r.hitN = (r.hitN || 0) + 1; r.hitSide = -side;
  if (byPlayer) r.lastHitBy = R.time;
  R.shake = Math.max(R.shake, 7); fire(R, 'hit');
  if (r.isCop && byPlayer) { if (!r.hitByPlayerOnce) offence(R, 2, 'ASSAULTING POLICE'); r.hitByPlayerOnce = true; }
  if (r.health <= 0 && r.state === 'ride') {
    startWipe(R, r);
    if (byPlayer) knockedDown(R, r);
  }
}
function knockedDown(R, r) {
  const p = R.player;
  if (r.isCop) {
    R.earned += 200; R.takedowns++; R.copsDown++; popup(R, (r.car ? 'POLICE JEEP WRECKED' : 'COP DOWN') + '  +' + rupees(200), '#7db8ff');
    R.lastCop = R.time + 3;   // backup takes a while to arrive
    if (!r.car && !p.weapon) { p.weapon = { type: 'lathi', uses: WEAPONS.lathi.uses }; popup(R, 'GRABBED LATHI', '#ffd400'); }
  } else {
    R.earned += 100; R.takedowns++; p.nitro = Math.min(100, p.nitro + 22); popup(R, 'TAKEDOWN  +' + rupees(100), '#ff7a3d');
    // Road Rash style: snatch the weapon off a rider you knock down
    if (r.weapon && (!p.weapon || WEAPONS[r.weapon.type].dmg > WEAPONS[p.weapon.type].dmg)) {
      p.weapon = { type: r.weapon.type, uses: WEAPONS[r.weapon.type].uses }; r.weapon = null;
      popup(R, 'GRABBED ' + WEAPONS[p.weapon.type].label.toUpperCase(), '#ffd400');
    }
  }
  fire(R, 'takedown');
}
/* kind: 'punch' (fists or the weapon in hand) or 'kick' (shoves the target sideways, into traffic or off the road) */
function playerAttack(R, side, kind) {
  const p = R.player;
  if (R.phase !== 'race' || p.state !== 'ride' || p.cool > 0 || p.finished) return false;
  const kick = kind === 'kick';
  const targets = R.rivals.concat(R.cops).filter((r) => r.state === 'ride');
  if (!side) {   // kick button: aim at whoever is closest beside us
    let best = null, bd = 9;
    for (const r of targets) { const dz = r.z - p.z, dx = r.x - p.x; if (dz > -480 && dz < 420 && Math.abs(dx) < 0.8) { const d = Math.abs(dx) + Math.abs(dz) / 1500; if (d < bd) { bd = d; best = r; } } }
    side = best ? sign(best.x - p.x) || 1 : (p.punchSide > 0 ? -1 : 1);
  }
  p.punchT = 0; p.punchSide = side; p.punchKind = kick ? 'kick' : p.weapon ? 'swing' : 'punch'; p.cool = kick ? 0.55 : 0.36;
  const w = kick ? WEAPONS.kick : p.weapon ? WEAPONS[p.weapon.type] : WEAPONS.fist;
  fire(R, 'swing');
  const reach = kick ? 0.78 : p.weapon ? 0.7 : 0.62;
  for (const r of targets) {
    const dz = r.z - p.z, dx = (r.x - p.x) * side;
    if (dz > -440 && dz < 380 && dx > 0.03 && dx < reach) {
      damageRacer(R, r, w.dmg * (0.85 + R.rnd() * 0.3), side, kick ? 0.4 : 0.2, true);
      if (kick) r.speed *= 0.86;
      if (!kick && p.weapon) { p.weapon.uses--; if (p.weapon.uses <= 0) { popup(R, WEAPONS[p.weapon.type].label.toUpperCase() + ' BROKE', '#ffb27a'); p.weapon = null; } }
      return true;
    }
  }
  return false;
}
const playerPunch = (R, side) => playerAttack(R, side, 'punch');
function rivalAttack(R, r, side) {
  const p = R.player;
  if (p.inv > 0 || p.state !== 'ride' || p.finished) return;
  const kick = r.atkKind === 'kick';
  let dmg = ((7 + r.aggr * 8) * (r.weapon ? 1.6 : 1) * (kick ? 0.8 : 1)) / R.stats.armor;
  if (r.isCop) dmg = (r.car ? 9 : 9) / R.stats.armor;
  p.health -= dmg; p.x = clamp(p.x + side * (r.car ? 0.2 : kick ? 0.16 : 0.07), -2.2, 2.2); p.speed *= r.car ? 0.86 : 0.93; p.inv = 0.4; p.hitN = (p.hitN || 0) + 1; p.hitSide = -side;
  R.shake = Math.max(R.shake, r.car ? 12 : 8); R.flash = Math.max(R.flash, 0.4); fire(R, r.car ? 'crash' : 'hit'); R.combo = 0;
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
    // steering eases in, so a tap nudges half a lane and holding moves across smoothly
    p.steer += (tgt - p.steer) * Math.min(1, dt * (tgt ? 5.5 : 8));
    const sp = p.speed / MAXSPEED, sn = Math.min(1.3, p.speed / (MAXSPEED * PACE));
    const wet = R.def.wet;
    const dx = dt * 1.6 * R.stats.handling * (wet ? 0.9 : 1) * (0.35 + 0.65 * sn);
    p.x += p.steer * dx;
    p.x -= dx * sn * segP.curve * 0.13 * (wet ? 1.2 : 1);
    p.lean += (clamp(p.steer * 0.8 + segP.curve * 0.04 * sn, -1, 1) - p.lean) * Math.min(1, dt * 7);

    const offroad = Math.abs(p.x) > 1.08;
    const boosting = racing && input.nitro && p.nitro > 1 && p.speed > MAXSPEED * 0.1;
    p.boost = boosting;
    let cap = playerCap(R) * (boosting ? 1.25 : 1);
    if (offroad) cap = Math.min(cap, MAXSPEED * 0.24);
    if (!racing) { p.speed = R.phase === 'finished' ? Math.max(0, p.speed - MAXSPEED * 0.35 * dt) : 0; }
    else if (input.brake) p.speed -= MAXSPEED * 0.8 * dt;
    else if (p.speed < cap) p.speed += (MAXSPEED * PACE / 4.6) * R.stats.acc * (boosting ? 2.0 : 1) * (1 - 0.45 * sp) * dt;
    else p.speed -= (offroad ? MAXSPEED * 0.7 : MAXSPEED * 0.2) * dt;
    p.speed = clamp(p.speed, 0, MAXSPEED * PACE * 1.6);
    if (boosting) p.nitro = Math.max(0, p.nitro - 36 * dt); else p.nitro = Math.min(100, p.nitro + 0.8 * dt);
    p.x = clamp(p.x, -2.2, 2.2);
    const wall = R.def.walls || segP.rail;
    if (wall && Math.abs(p.x) > 1.12) {        // bridge parapet or crash barrier
      p.x = sign(p.x) * 1.12; p.steer *= -0.3;
      if (racing && p.inv <= 0 && p.speed > MAXSPEED * 0.2) { p.speed *= 0.72; p.health -= 6 / R.stats.armor; p.inv = 0.5; R.shake = 9; R.burst = 10; fire(R, 'crash'); if (p.health <= 0) { p.health = 0; startWipe(R, p); } }
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
      for (const pt of R.patrols) {   // ploughing into a parked police jeep
        if (!pt.used && Math.abs(pt.z - p.z) < 520 && Math.abs(pt.x - p.x) < 0.2) { crashPlayer(R, 0.4 + sp * 0.4); offence(R, 2, 'HIT A POLICE JEEP'); p.x = clamp(p.x + 0.25, -2.2, 2.2); break; }
      }
    }
    // traffic
    for (const t of R.traffic) {
      const dz = t.z - p.z;
      if (Math.abs(dz) > t.len * 0.5 + 60) {
        if (!t.passed && dz < 0) {
          t.passed = true;
          if (!t.hit && t.minGap < 0.32 && p.speed > MAXSPEED * 0.3 && racing) nearMiss(R, t.dir < 0);
        }
        if (dz > 0) { t.passed = false; t.minGap = 9; }
        continue;
      }
      const gap = Math.abs(t.x - p.x) - t.w * 0.5;
      t.minGap = Math.min(t.minGap, gap);
      if (racing && p.inv <= 0 && gap < 0.09) {
        const rel = Math.max(0, (p.speed - t.speed) / MAXSPEED);
        t.hit = true; crashPlayer(R, rel, 'vehicle');
        p.speed = Math.max(0, Math.min(p.speed, t.speed * 0.85)); p.x = clamp(p.x + sign(p.x - t.x || 1) * 0.14, -2.2, 2.2);
      }
    }
    // pickups
    if (racing) for (const pk of R.pickups) {
      if (!pk.got && Math.abs(pk.z - p.z) < 260 && Math.abs(pk.x - p.x) < 0.24) collect(R, pk);
    }
    if (racing) {
      if (input.punchL) { input.punchL = false; playerAttack(R, -1, 'punch'); }
      if (input.punchR) { input.punchR = false; playerAttack(R, 1, 'punch'); }
      if (input.kick) { input.kick = false; playerAttack(R, input.kickSide || 0, 'kick'); input.kickSide = 0; }
    } else { input.punchL = input.punchR = input.kick = false; }
  } else if (p.state === 'wipe') {
    p.speed = Math.max(0, p.speed - MAXSPEED * 0.9 * dt);
    p.wipeT += dt;
    if (R.bustPending && p.wipeT > 1.2 && R.phase === 'race') { R.bustWhy = 'wipe'; bustPlayer(R); }
    else if (p.wipeT > 1.9) {
      p.state = 'ride'; p.health = 70; p.speed = MAXSPEED * 0.14; p.inv = 1.8; p.steer = 0;
      p.x = nearestFreeLane(R, p.z, p.x); p.nitro = Math.max(p.nitro, 10);
    }
  }
  p.z += p.speed * dt;
  if (p.state === 'busted') p.speed = Math.max(0, p.speed - MAXSPEED * 1.2 * dt);
}

/* how soon (in world units at our speed) we would reach a vehicle; oncoming ones close in much faster */
function threatDist(rz, rspeed, t) {
  const dz = t.z - rz;
  if (t.dir < 0) return dz * Math.max(rspeed, 1500) / Math.max(rspeed - t.speed, 1500);
  return dz;
}
function updateRival(R, r, dt) {
  const p = R.player;
  r.cool = Math.max(0, r.cool - dt); r.atkT += dt; r.hurtT = Math.max(0, r.hurtT - dt);
  if (r.state === 'wipe') {
    r.speed = Math.max(0, r.speed - MAXSPEED * 0.9 * dt); r.wipeT += dt; r.z += r.speed * dt;
    if (r.wipeT > 2.4) { r.state = 'ride'; r.health = 70; r.speed = MAXSPEED * 0.15; r.tx = r.x = nearestFreeLane(R, r.z, r.x); }
    return;
  }
  if (R.phase === 'countdown') return;
  const gap = p.z - r.z;
  const band = clamp(gap / 30000, -0.1, 0.12);
  let target = MAXSPEED * PACE * R.def.difficulty * r.skill * (1 + band);
  if (r.finished) target = 0;
  const two = R.def.twoWay;

  r.think -= dt;
  if (r.think <= 0) {
    r.think = 0.12 + R.rnd() * 0.1;
    const li = laneOf(r.x);
    const blockedBy = (lane) => {
      for (const t of R.traffic) { const d = threatDist(r.z, r.speed, t); if (t.z - r.z > -300 && d < 4200 && Math.abs(t.x - LANE_X[lane]) < 0.42) return t; }
      for (const h of R.hazards) { const dz = h.z - r.z; if (dz > 0 && dz < 3000 && Math.abs(h.x - LANE_X[lane]) < 0.35) return h; }
      return null;
    };
    r.block = blockedBy(li);
    if (r.block) {
      for (const d of [-1, 1, -2, 2, 3, -3]) {
        const lj = li + d;
        if (lj >= 0 && lj < LANES && !blockedBy(lj)) { r.tx = LANE_X[lj]; r.block = null; break; }
      }
    } else if (Math.abs(gap) < 900 && r.aggr > 0.5 && p.state === 'ride') {
      r.tx = clamp(p.x + (r.x < p.x ? -0.34 : 0.34), -0.85, 0.85);
    } else if (two && li >= 2 && R.rnd() < 0.5) {
      if (!blockedBy(1)) r.tx = LANE_X[1];          // get back on our side of the road
    } else if (R.rnd() < 0.15) {
      r.tx = LANE_X[two ? pickOf(R.rnd, OWN_LANES) : Math.floor(R.rnd() * LANES)];
    }
  }
  if (r.block && r.block.speed !== undefined) target = r.block.dir < 0 ? target * 0.6 : Math.min(target, r.block.speed * 0.95);
  else if (r.block) target *= 0.75;
  r.speed += clamp(target - r.speed, -MAXSPEED * 0.6 * dt, MAXSPEED * 0.22 * dt);
  r.speed = Math.max(0, r.speed);
  r.z += r.speed * dt;
  const prevX = r.x;
  r.x += clamp(r.tx - r.x, -1.3 * dt, 1.3 * dt);
  r.lean += (clamp((r.x - prevX) * 40, -1, 1) - r.lean) * Math.min(1, dt * 7);

  // rivals crash into things they could not avoid (or were kicked into)
  if (R.phase === 'race' && !r.finished) {
    for (const t of R.traffic) if (Math.abs(t.z - r.z) < t.len * 0.5 + 40 && Math.abs(t.x - r.x) < t.w * 0.5 + 0.08) {
      const rel = Math.max(0, (r.speed - t.speed) / MAXSPEED);
      r.health -= 12 + rel * 60; r.speed = Math.max(0, Math.min(r.speed, t.speed * 0.8)); r.x = clamp(r.x + sign(r.x - t.x || 1) * 0.15, -1.1, 1.1);
      const byPlayer = R.time - r.lastHitBy < 1.6;
      if (r.health <= 0 || rel > 0.7) {
        r.health = Math.min(r.health, 0); startWipe(R, r);
        if (byPlayer) { knockedDown(R, r); popup(R, 'SMASHED INTO TRAFFIC!', '#ff7a3d'); offence(R, 1, 'CAUSED AN ACCIDENT', 2); }
      }
      break;
    }
    if (Math.abs(r.x) > 1.12 && (R.def.walls || segAt(R.track, r.z).rail)) {   // slammed into the barrier
      r.x = sign(r.x) * 1.1; r.tx = sign(r.x) * 0.75;
      if (R.time - r.lastHitBy < 1.2) { r.health -= 25; if (r.health <= 0) { startWipe(R, r); knockedDown(R, r); } }
    }
    // attack the player
    const dz = r.z - p.z, dx = p.x - r.x;
    if (p.state === 'ride' && !p.finished && Math.abs(dz) < 420 && Math.abs(dx) > 0.05 && Math.abs(dx) < 0.55 && r.cool <= 0) {
      if (R.rnd() < r.aggr * dt * 2.2) {
        r.atkSide = sign(dx); r.atkT = 0; r.cool = 1.1 + R.rnd();
        r.atkKind = r.weapon ? 'swing' : R.rnd() < 0.35 ? 'kick' : 'punch';
        rivalAttack(R, r, r.atkSide);
      }
    }
  }
  if (!r.finished && r.z >= R.track.finishZ) { r.finished = true; R.finishedCount++; r.place = R.finishedCount; }
}

/* ---------- police ---------- */
function newCop(R, car, z, x, speed) {
  const c = newRacer(R, 0, COP_STYLE, 'Police', false);
  c.isCop = true; c.car = !!car; c.health = car ? 170 : 70; c.z = z; c.x = x; c.tx = x; c.speed = speed;
  c.weapon = car ? null : { type: 'lathi', uses: 99 }; c.aggr = 0.8;
  if (car) { c.w = 0.24; c.len = 1000; }
  R.cops.push(c); fire(R, 'siren');
  return c;
}
function launchPatrol(R, pt) {
  pt.used = true;
  const p = R.player;
  newCop(R, true, pt.z, -1.05, Math.max(MAXSPEED * 0.15, Math.min(p.speed, MAXSPEED * 0.3)));
  popup(R, 'CHECKPOINT! POLICE JEEP IN PURSUIT', '#69b7ff');
}
function bustPlayer(R) {
  const p = R.player;
  p.state = 'busted'; R.bust = 0; R.bustPending = false; popup(R, 'BUSTED!', '#ff5d5d'); fire(R, 'busted');
  R.phase = 'finished'; p.finished = true; p.place = 8; R.endDelay = 0; R.busted = true;
}
function updateCops(R, dt) {
  const p = R.player, racing = R.phase === 'race' && !p.finished;
  const riding = R.cops.filter((c) => c.state === 'ride' && !c.giveUp);
  // send units after a wanted rider: bikes first, a jeep once it gets serious
  if (racing && R.wanted > 0 && R.time - R.lastCop > 8) {
    const bikes = riding.filter((c) => !c.car).length, cars = riding.filter((c) => c.car).length;
    const wantBikes = Math.min(R.wanted >= 3 ? 3 : R.wanted, 1 + R.def.cops), wantCars = R.wanted >= 3 ? Math.min(2, R.wanted - 2) : 0;
    if (bikes < wantBikes || cars < wantCars) {
      R.lastCop = R.time;
      const car = cars < wantCars && (bikes >= 1 || R.wanted >= 4);
      newCop(R, car, Math.max(1500, p.z - 5200), clamp(p.x, -0.8, 0.8), Math.max(p.speed, MAXSPEED * 0.35) * 1.05);
      popup(R, car ? 'POLICE JEEP ON YOUR TAIL!' : 'POLICE ON YOUR TAIL!', '#69b7ff');
    }
  }
  // checkpoints you ride past while wanted pull out after you
  if (racing && R.wanted > 0) for (const pt of R.patrols) if (!pt.used && pt.z - p.z < 5000 && pt.z - p.z > -1500) launchPatrol(R, pt);

  let beside = 0;
  for (const c of R.cops) {
    c.cool = Math.max(0, c.cool - dt); c.hurtT = Math.max(0, c.hurtT - dt); c.atkT += dt; c.inv = Math.max(0, c.inv - dt);
    if (c.state === 'wipe') { c.speed = Math.max(0, c.speed - MAXSPEED * dt); c.wipeT += dt; c.z += c.speed * dt; continue; }
    if (R.wanted === 0 && racing) c.giveUp = true;
    // just quicker than your bike flat out, so nitro (or a well-aimed kick) is how you shake them
    const dz = c.z - p.z, capV = playerCap(R) * ((c.car ? 0.97 : 1.05) + 0.02 * R.trackIndex);
    let target;
    if (c.giveUp || !racing) target = p.speed * 0.6;
    else if (dz < -300) target = clamp(Math.max(p.speed * 1.1, MAXSPEED * 0.4), 0, capV);
    else if (dz > 600) target = Math.max(p.speed * 0.85, playerCap(R) * 0.55);   // ahead of you: slow down and try to block
    else target = p.speed * (c.car ? 1.0 : 1.02);
    // dodge traffic like everyone else
    let lane = c.tx, threat = null;
    for (const t of R.traffic) { const d = threatDist(c.z, c.speed, t); if (t.z - c.z > -200 && d < 3200 && Math.abs(t.x - c.x) < t.w * 0.5 + 0.2) { threat = t; break; } }
    if (threat) lane = nearestFreeLane(R, c.z, c.x + (threat.x > c.x ? -0.5 : 0.5));
    else if (!c.giveUp) lane = clamp(p.x + (Math.abs(dz) < 1500 ? (c.x < p.x ? -0.3 : 0.3) : 0), -1.0, 1.0);
    c.tx = lane;
    if (threat && threat.dir > 0) target = Math.min(target, threat.speed);
    c.speed += clamp(target - c.speed, -MAXSPEED * 0.8 * dt, MAXSPEED * 0.3 * dt);
    c.speed = Math.max(0, c.speed);
    c.z += c.speed * dt;
    const prevX = c.x;
    c.x += clamp(c.tx - c.x, -(c.car ? 0.7 : 1.1) * dt, (c.car ? 0.7 : 1.1) * dt);
    c.lean += (clamp((c.x - prevX) * 40, -1, 1) - c.lean) * Math.min(1, dt * 7);
    if (!racing || c.giveUp) continue;
    // wrecks: cops that get shoved into traffic go down too
    if (c.inv <= 0) for (const t of R.traffic) if (Math.abs(t.z - c.z) < t.len * 0.5 + (c.car ? 500 : 40) && Math.abs(t.x - c.x) < t.w * 0.5 + (c.car ? 0.12 : 0.08)) {
      const byPlayer = R.time - c.lastHitBy < 1.6;
      c.inv = 1.0; c.health -= c.car ? 60 : 40; c.speed *= 0.5; c.x = clamp(c.x + sign(c.x - t.x || 1) * 0.15, -1.1, 1.1);
      if (c.health <= 0) { startWipe(R, c); if (byPlayer) knockedDown(R, c); }
      break;
    }
    const dx = p.x - c.x;
    if (p.state === 'ride' && ((Math.abs(dz) < 520 && Math.abs(dx) < 0.5) || (c.car && dz > 0 && dz < 1600 && Math.abs(dx) < 0.4))) beside = 1;
    // one star: they try to pull you over. Two: the lathi comes out. Three: jeeps try to run you off the road
    if (p.state === 'ride' && c.cool <= 0 && c.state === 'ride') {
      if (c.car && Math.abs(dz) < 560 && Math.abs(dx) < 0.36 && R.rnd() < dt * 1.5) { c.atkSide = sign(dx) || 1; c.atkT = 0; c.cool = 3; c.atkKind = 'ram'; rivalAttack(R, c, c.atkSide); }
      else if (!c.car && R.wanted >= 2 && Math.abs(dz) < 420 && Math.abs(dx) > 0.05 && Math.abs(dx) < 0.55 && R.rnd() < dt * 1.1) { c.atkSide = sign(dx); c.atkT = 0; c.cool = 1.8 + R.rnd() * 0.9; c.atkKind = 'swing'; rivalAttack(R, c, c.atkSide); }
    }
    // you rammed the jeep
    if (c.car && p.state === 'ride' && p.inv <= 0 && Math.abs(dz) < c.len * 0.5 + 60 && Math.abs(dx) - c.w * 0.5 < 0.06) {
      crashPlayer(R, Math.max(0, (p.speed - c.speed) / MAXSPEED) + 0.15); offence(R, 1, 'RAMMED POLICE');
      p.x = clamp(p.x + (sign(dx) || 1) * 0.15, -2.2, 2.2);
    }
  }
  R.cops = R.cops.filter((c) => !(c.state === 'wipe' && c.wipeT > 3) && c.z > p.z - 15000 && !(c.giveUp && c.z < p.z - 6000));
  // stop (or crawl) with a cop right there and he pulls you over
  const slow = p.speed < playerCap(R) * 0.3;
  if (beside && racing && slow) R.bust += dt; else R.bust = Math.max(0, R.bust - dt * 1.2);
  if (R.bust > 3 && p.state === 'ride') { R.bustWhy = 'meter'; bustPlayer(R); }
  // shake them off: no police near you for a while and the wanted level drops
  if (racing && R.wanted > 0) {
    const close = R.cops.some((c) => c.state === 'ride' && !c.giveUp && Math.abs(c.z - p.z) < 14000);
    R.calmT += close ? -dt * 0.5 : dt; R.calmT = Math.max(0, R.calmT);
    if (R.calmT > 8) { R.calmT = 0; R.wanted--; popup(R, R.wanted ? 'WANTED LEVEL DOWN' : 'YOU LOST THE COPS!', '#7CFFB2'); }
  }
  R.heat = R.wanted * 20;
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

/* keep the road busy: vehicles far behind (and oncoming ones that have passed) reappear well ahead, out of sight */
function recycleTraffic(R) {
  const p = R.player, lim = R.track.finishZ + 30000;
  for (const t of R.traffic) {
    const behind = t.dir < 0 ? t.z < p.z - 3000 : t.z < p.z - 26000;
    if (!behind) continue;
    let z = p.z + 78000 + R.rnd() * 60000;
    if (z > lim) { if (t.dir < 0) z = lim - R.rnd() * 20000; else continue; }
    const lanes = t.dir < 0 ? ONCOMING_LANES : R.def.twoWay ? OWN_LANES : [0, 1, 2, 3];
    let lane = pickOf(R.rnd, lanes);
    for (let k = 0; k < 3; k++) {
      let clash = false;
      for (const o of R.traffic) if (o !== t && Math.abs(o.z - z) < 2600 && Math.abs(o.x - LANE_X[lane]) < 0.3) { clash = true; break; }
      if (!clash) break;
      z += 3000; lane = pickOf(R.rnd, lanes);
    }
    t.z = z; t.x = LANE_X[lane]; t.passed = false; t.hit = false; t.minGap = 9;
  }
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
  recycleTraffic(R);
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
function autopilot(R, input, opts) {
  const p = R.player, peaceful = opts && opts.peaceful;
  input.left = input.right = input.brake = input.nitro = false;
  let best = 0, bestScore = -1e9;
  for (let i = 0; i < LANES; i++) {
    let clear = 7000;
    for (const t of R.traffic) { const d = threatDist(p.z, p.speed, t); if (t.z - p.z > -200 && d < clear && Math.abs(t.x - LANE_X[i]) < 0.45) clear = Math.max(0, d); }
    // crossing over to that lane means passing through the ones in between
    for (let j = Math.min(i, laneOf(p.x)); j <= Math.max(i, laneOf(p.x)); j++) for (const t of R.traffic) { const dz = t.z - p.z; if (dz > -t.len * 0.5 - 300 && dz < t.len * 0.5 + 500 && Math.abs(t.x - LANE_X[j]) < 0.3) clear = Math.min(clear, 200); }
    for (const h of R.hazards) { const dz = h.z - p.z; if (dz > 0 && dz < clear && Math.abs(h.x - LANE_X[i]) < 0.4) clear = dz; }
    for (const c of R.cops) if (c.car && c.state === 'ride') { const dz = c.z - p.z; if (dz > -200 && dz < clear && Math.abs(c.x - LANE_X[i]) < 0.4) clear = dz; }
    const score = clear - Math.abs(LANE_X[i] - p.x) * 900 - (R.def.twoWay && i >= 2 ? 2500 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  const err = LANE_X[best] - p.x;
  if (err > 0.06) input.right = true; else if (err < -0.06) input.left = true;
  if ((bestScore < 1800 && p.speed > MAXSPEED * PACE * 0.3) || (Math.abs(segAt(R.track, p.z).curve) > 3.5 && p.speed > MAXSPEED * PACE)) input.brake = true;
  if (R.phase === 'race' && p.state === 'ride' && !peaceful) {
    for (const r of R.rivals.concat(R.cops)) {
      if (r.state !== 'ride' || r.isCop) continue;   // a sensible rider leaves the police alone
      const dz = r.z - p.z, dx = r.x - p.x;
      if (dz > -400 && dz < 340 && Math.abs(dx) > 0.04 && Math.abs(dx) < 0.6) {
        if (Math.abs(dx) > 0.45 || R.rnd() < 0.25) { input.kick = true; input.kickSide = sign(dx); }
        else if (dx > 0) input.punchR = true; else input.punchL = true;
        break;
      }
    }
  }
  if (p.nitro > 45 && Math.abs(segAt(R.track, p.z).curve) < 1.5 && bestScore > 4000) input.nitro = true;
  return input;
}
