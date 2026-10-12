const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync('dist/index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const errors = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.org/', beforeParse(w) {
  const grad = { addColorStop() {} };
  const ctxProxy = () => new Proxy({}, { get(t, p) { if (p in t) return t[p]; if (p === 'measureText') return () => ({ width: 50 }); if (/^create.*Gradient$/.test(p)) return () => grad; return () => {}; }, set(t, p, v) { t[p] = v; return true; } });
  w.HTMLCanvasElement.prototype.getContext = function () { return this.__ctx || (this.__ctx = ctxProxy()); };
  w.requestAnimationFrame = () => 0;
  w.innerWidth = 900; w.innerHeight = 400;
  w.addEventListener('error', (e) => errors.push(e.message));
} });
const w = dom.window, d = w.document;
(async () => {
await new Promise((r) => setTimeout(r, 50));
const T = w.__TR;
const click = (sel) => { const el = d.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
ok(!!T && T.S.screen === 'menu', 'boots into the menu');
ok(d.querySelector('.l2').textContent === 'RIOT', 'title shows');
click('[data-a="race"]'); ok(T.S.screen === 'tracks', 'RACE opens track select');
ok(d.querySelectorAll('.card').length === 4 && d.querySelectorAll('.card.lock').length === 3, '4 tracks, 3 locked at start');
click('[data-a="track"][data-i="0"]'); await new Promise((r) => setTimeout(r, 150)); ok(T.S.screen === 'race' && T.R && T.R.trackIndex === 0, 'tapping a track starts the race');
ok(d.getElementById('controls').style.display === 'block', 'touch controls visible in race');
// press buttons via pointer events
const pe = (id, type) => d.getElementById(id).dispatchEvent(new w.Event(type, { bubbles: true }));
pe('bR', 'pointerdown'); ok(T.input.right === true, 'right button sets steering'); pe('bR', 'pointerup'); ok(T.input.right === false, 'release clears steering');
pe('bPL', 'pointerdown'); ok(T.input.punchL === true, 'punch button queues a punch');
pe('bK', 'pointerdown'); ok(T.input.kick === true, 'kick button queues a kick');
// pause/resume
d.getElementById('bP').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); ok(T.S.screen === 'pause', 'pause button pauses');
click('[data-a="resume"]'); ok(T.S.screen === 'race', 'resume returns to race');
// drive the race with the autopilot by feeding inputs through the real tick()
const TR = w.TarmacRiot; let n = 0;
while (T.S.screen === 'race' && n < 60 * 300) { TR.autopilot(T.R, T.input); T.tick(1 / 60); n++; }
ok(T.S.screen === 'results', 'race ends on the results screen (' + (n / 60).toFixed(0) + 's)');
const r = T.R.results; ok(T.save.cash === 300 + r.total, 'cash paid out and saved (' + r.total + ')');
ok(d.querySelector('.place').textContent.length > 0, 'results show finishing place: ' + d.querySelector('.place').textContent);
const saved = JSON.parse(w.localStorage.getItem('tarmac-riot-save-v1')); ok(saved && saved.cash === T.save.cash, 'progress persisted to storage');
if (r.place <= 3 && !r.busted) ok(T.save.unlocked === 2 && !!d.querySelector('.unl'), 'top-3 unlocks race 2 and says so');
// garage: give cash, buy the Wasp, upgrade it
T.save.cash = 20000; click('[data-a="garage"]'); ok(T.S.screen === 'garage', 'garage opens');
click('[data-a="bike"][data-i="1"]'); click('[data-a="buybike"]');
ok(T.save.owned.includes(1) && T.save.bike === 1 && T.save.cash === 17500, 'buying the Wasp works');
click('[data-a="upg"][data-k="e"]'); ok(T.save.up[1].e === 1 && T.save.cash === 16500, 'engine upgrade works');
click('[data-a="bike"][data-i="0"]'); click('[data-a="equip"]'); ok(T.save.bike === 0, 'equipping another bike works');
// settings
click('[data-a="back"]'); click('[data-a="settings"]'); ok(T.S.screen === 'settings', 'settings open');
click('[data-a="mute"]'); ok(T.save.mute === true, 'mute toggles');
click('[data-a="quality"]'); ok(T.save.quality === 0, 'graphics quality toggles');
click('[data-a="reset"]'); ok(T.save.cash === 16500, 'reset needs a second tap');
click('[data-a="reset"]'); ok(T.save.cash === 300 && T.save.unlocked === 1, 'reset clears progress');
// reload keeps progress
T.save.cash = 999; w.localStorage.setItem('tarmac-riot-save-v1', JSON.stringify(T.save));
const d2 = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.org/', beforeParse(w2) { w2.localStorage.setItem('tarmac-riot-save-v1', JSON.stringify({ v: 1, cash: 999, bike: 0, owned: [0], up: {}, unlocked: 2, best: {}, mute: false, quality: 1, stats: {} })); w2.HTMLCanvasElement.prototype.getContext = w.HTMLCanvasElement.prototype.getContext; w2.requestAnimationFrame = () => 0; } });
await new Promise((r) => setTimeout(r, 50));
ok(d2.window.__TR.save.cash === 999 && d2.window.__TR.save.unlocked === 2, 'saved progress loads on restart');
ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(fails ? 'FAILURES: ' + fails : 'all UI checks passed');
})();
