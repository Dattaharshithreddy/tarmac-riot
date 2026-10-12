const TR = require('./dist/game.js');
let fails = 0;
const ok = (c, m) => { if (!c) { console.log('FAIL', m); fails++; } else console.log('ok  ', m); };

for (let ti = 0; ti < TR.TRACKS.length; ti++) {
  const save = TR.DEFAULT_SAVE();
  const R = TR.createRace(save, ti, {});
  const input = { left: false, right: false, brake: false, nitro: false, punchL: false, punchR: false };
  let frames = 0, nan = false, maxSpeed = 0, minX = 9, maxX = -9;
  const evs = {};
  while (!R.results && frames < 60 * 400) {
    TR.autopilot(R, input, { peaceful: true });
    TR.stepRace(R, 1 / 60, input);
    for (const e of R.events) evs[e] = (evs[e] || 0) + 1; R.events.length = 0;
    const p = R.player;
    if (![p.z, p.x, p.speed, p.health, p.nitro].every(Number.isFinite)) nan = true;
    maxSpeed = Math.max(maxSpeed, p.speed / TR.MAXSPEED); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    frames++;
  }
  const t = TR.TRACKS[ti], res = R.results;
  console.log(`\n== ${t.name}: ${t.segs} segs, ${R.traffic.length} traffic, ${R.rivals.length} rivals, ${R.pickups.length} pickups, ${R.hazards.length} hazards`);
  console.log('   finished:', !!res, 'place', res && res.place, 'time', res && res.time.toFixed(1) + 's', 'takedowns', R.takedowns, 'nearMiss', R.nearMisses, 'busted', !!R.busted);
  console.log('   max speed', maxSpeed.toFixed(2), 'x range', minX.toFixed(2), maxX.toFixed(2), 'events', JSON.stringify(evs));
  ok(!nan, t.id + ': no NaN values');
  ok(!!res, t.id + ': race ends with results');
  ok(res && (res.busted || (res.time > 60 && res.time < 170)), t.id + ': race length is sensible (' + (res && res.time.toFixed(0)) + 's)');
  ok(maxX <= 2.2 && minX >= -2.2, t.id + ': player stays within bounds');
  ok(res.busted || R.rivals.some((r) => r.finished), t.id + ': rivals also finish');
  ok(maxSpeed < TR.PACE * 1.6, t.id + ': top speed is held to the slower pace (' + Math.round(maxSpeed * TR.MAXSPEED * TR.KMH) + ' km/h)');
  ok(R.offences > 0 || !evs.siren, t.id + ': police only turn up after an offence (' + R.offences + ' offences)');
  const onc = R.traffic.filter((v) => v.dir < 0);
  ok(t.twoWay ? onc.length > 5 && onc.every((v) => v.x > 0 && v.speed < 0) : onc.length === 0, t.id + ': ' + (t.twoWay ? onc.length + ' oncoming vehicles on the right-hand lanes' : 'no oncoming traffic on the divided bridge'));
  const before = save.cash; TR.applyResults(save, R);
  ok(save.cash === before + res.total, t.id + ': payout applied (' + TR.rupees(res.total) + ')');
}
// ---- combat and police ----
function fresh(ti) { const R = TR.createRace(TR.DEFAULT_SAVE(), ti || 2, { seed: 5 }); const inp = {}; for (let i = 0; i < 60 * 5; i++) TR.stepRace(R, 1 / 60, inp); R.events.length = 0; return R; }
const idle = () => ({ left: false, right: false, brake: false, nitro: false, punchL: false, punchR: false, kick: false });
{ // kick shoves a rival sideways
  const R = fresh(), p = R.player, r = R.rivals[0];
  r.z = p.z + 100; r.x = p.x + 0.4; r.tx = r.x; r.state = 'ride'; r.health = 100; R.cops.length = 0;
  const x0 = r.x, inp = idle(); inp.kick = true; TR.stepRace(R, 1 / 60, inp);
  ok(r.health < 100 && r.x - x0 > 0.3, 'kick damages and shoves a rival (' + (r.x - x0).toFixed(2) + ' lanes)');
  ok(R.wanted === 0, 'kicking a rival does not bring the police');
}
{ // knocking a rival down grabs his weapon
  const R = fresh(), p = R.player, r = R.rivals[1];
  r.z = p.z + 100; r.x = p.x - 0.3; r.state = 'ride'; r.health = 5; r.weapon = { type: 'rod', uses: 99 }; p.weapon = null;
  const inp = idle(); inp.punchL = true; TR.stepRace(R, 1 / 60, inp);
  ok(r.state === 'wipe' && p.weapon && p.weapon.type === 'rod', 'takedown steals the rider\'s iron rod');
}
{ // an accident alerts the police and a unit gets dispatched
  const R = fresh(), p = R.player;
  p.speed = TR.MAXSPEED * 0.6; p.inv = 0;
  const v = R.traffic.find((t) => t.dir > 0); v.z = p.z + 300; v.x = p.x; v.speed = TR.MAXSPEED * 0.2;
  const inp = idle(); TR.stepRace(R, 1 / 60, inp);
  ok(R.wanted >= 1, 'rear-ending a vehicle at speed raises the wanted level (' + R.wanted + ')');
  for (let i = 0; i < 60 * 10 && !R.cops.length; i++) TR.stepRace(R, 1 / 60, inp);
  ok(R.cops.length > 0, 'police are dispatched after the accident');
  // punching that cop escalates
  const c = R.cops[0]; c.z = p.z + 80; c.x = p.x + 0.3; c.state = 'ride'; p.state = 'ride'; p.cool = 0; p.inv = 0;
  const w0 = R.wanted; inp.punchR = true; TR.stepRace(R, 1 / 60, inp);
  ok(R.wanted >= w0 + 2 || R.wanted === 5, 'attacking a police officer raises the wanted level by two (' + w0 + ' -> ' + R.wanted + ')');
  // shake them off
  R.cops.length = 0; R.lastCop = R.time + 999; R.patrols.forEach((pt) => { pt.used = true; }); R.bustPending = false; R.phase = 'race'; p.state = 'ride'; p.finished = false; const w1 = R.wanted;
  for (let i = 0; i < 60 * 10; i++) { const inp = idle(); inp.brake = true; p.inv = 1; TR.stepRace(R, 1 / 60, inp); }
  ok(R.wanted === w1 - 1, 'wanted level drops after losing the police for a while (' + w1 + ' -> ' + R.wanted + ', ' + R.phase + ', cops ' + R.cops.length + ')');
}
{ // stopping next to a cop gets you busted
  const R = fresh(), p = R.player; R.wanted = 1; R.lastCop = R.time + 999;
  const c = TR.createRace(TR.DEFAULT_SAVE(), 2, { seed: 5 }).rivals[0];
  Object.assign(c, { isCop: true, z: p.z + 100, x: p.x + 0.3, speed: 0, state: 'ride' }); R.cops.push(c);
  const inp = idle(); inp.brake = true;
  for (let i = 0; i < 60 * 6 && !R.busted; i++) { c.z = p.z + 100; c.speed = p.speed; TR.stepRace(R, 1 / 60, inp); }
  ok(R.busted, 'stopping beside a police officer gets you busted');
}
{ // traffic keeps coming on two-way roads
  const R = fresh(3), p = R.player; const inp = {};
  for (let i = 0; i < 60 * 50; i++) { TR.autopilot(R, inp, { peaceful: true }); TR.stepRace(R, 1 / 60, inp); }
  const ahead = R.traffic.filter((t) => t.dir < 0 && t.z > p.z && t.z < p.z + 80000).length;
  ok(ahead >= 3, 'oncoming traffic keeps arriving mid-race (' + ahead + ' ahead)');
}
// track geometry checks
const trk = TR.buildTrack(TR.TRACKS[1], 1);
const ys = trk.segs.map((s) => s.p2.world.y);
ok(Math.max(...ys) < 200 * 90 && Math.min(...ys) > -200 * 45, 'ladakh hills stay within bounds (' + Math.round(Math.min(...ys)/200) + '..' + Math.round(Math.max(...ys)/200) + ' segs high)');
ok(Math.abs(trk.segs[trk.F].p1.world.y) < 200 * 3, 'track is flat at the finish line');
ok(trk.segs.length - trk.F > 400, 'run-out after finish is longer than the draw distance');
// unlock logic
const s2 = TR.DEFAULT_SAVE(); const Rf = { results: { place: 2, busted: false, total: 100, takedowns: 1 }, def: TR.TRACKS[0], trackIndex: 0 };
TR.applyResults(s2, Rf); ok(s2.unlocked === 2, 'top-3 finish unlocks next track');
const s3 = TR.DEFAULT_SAVE(); Rf.results.place = 5; TR.applyResults(s3, Rf); ok(s3.unlocked === 1, '5th place does not unlock');
console.log(fails ? '\nFAILURES: ' + fails : '\nall checks passed'); process.exit(fails ? 1 : 0);
