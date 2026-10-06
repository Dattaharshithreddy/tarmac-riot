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
    TR.autopilot(R, input);
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
  ok(res && res.time > 40 && res.time < 200, t.id + ': race length is sensible (' + (res && res.time.toFixed(0)) + 's)');
  ok(maxX <= 2.2 && minX >= -2.2, t.id + ': player stays within bounds');
  ok(R.rivals.some((r) => r.finished), t.id + ': rivals also finish');
  const before = save.cash; TR.applyResults(save, R);
  ok(save.cash === before + res.total, t.id + ': payout applied (' + TR.rupees(res.total) + ')');
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
