const TR = require('./dist/game.js');
const PEACE = process.argv.includes('--peaceful');
function run(ti, save, seed) {
  const R = TR.createRace(save, ti, { seed });
  const input = { left: false, right: false, brake: false, nitro: false, punchL: false, punchR: false };
  let f = 0;
  while (!R.results && f < 60 * 400) { TR.autopilot(R, input, { peaceful: PEACE }); TR.stepRace(R, 1 / 60, input); R.events.length = 0; f++; }
  return R.results;
}
function cfg(name, bike, up) { const s = TR.DEFAULT_SAVE(); s.bike = bike; s.owned = [0, 1, 2, 3]; s.up = {}; for (let i = 0; i < 4; i++) s.up[i] = { e: 0, t: 0, a: 0 }; if (up) s.up[bike] = { e: up, t: up, a: up }; return [name, s]; }
const configs = [cfg('Scrapper', 0, 0), cfg('Wasp', 1, 0), cfg('Viper+2', 2, 2), cfg('Reaper+3', 3, 3)];
for (let ti = 0; ti < TR.TRACKS.length; ti++) {
  const line = [];
  for (const [name, s] of configs) {
    const places = [];
    for (let seed = 0; seed < 6; seed++) { const r = run(ti, JSON.parse(JSON.stringify(s)), seed * 13); places.push(r.busted ? 'B' : r.place); }
    line.push(name.padEnd(9) + places.join(''));
  }
  console.log(TR.TRACKS[ti].id.padEnd(8), 'diff', TR.TRACKS[ti].difficulty, '|', line.join('  |  '));
}
