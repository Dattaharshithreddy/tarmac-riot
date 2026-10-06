/* ---------- UI, input and game loop (browser only) ---------- */
const SAVE_KEY = 'tarmac-riot-save-v1';
function loadSave() {
  let s = null;
  try { if (typeof window !== 'undefined' && window.__TR_SAVE__) s = JSON.parse(window.__TR_SAVE__); } catch (e) { s = null; }
  if (!s) { try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; } }
  const d = DEFAULT_SAVE();
  if (!s || s.v !== 1) return d;
  const out = Object.assign(d, s);
  out.stats = Object.assign(DEFAULT_SAVE().stats, s.stats || {});
  if (!Array.isArray(out.owned) || !out.owned.length) out.owned = [0];
  if (!out.up) out.up = {};
  for (const i of out.owned) if (!out.up[i]) out.up[i] = { e: 0, t: 0, a: 0 };
  if (out.owned.indexOf(out.bike) < 0) out.bike = 0;
  out.unlocked = clamp(out.unlocked | 0, 1, TRACKS.length);
  return out;
}
function writeSave(s) {
  const j = JSON.stringify(s);
  try { localStorage.setItem(SAVE_KEY, j); } catch (e) { /* storage can be unavailable */ }
  try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'save', data: j })); } catch (e) { /* not in the app */ }
}

function boot() {
  const doc = document, win = window;
  const canvas = doc.getElementById('c'), ui = doc.getElementById('ui'), controls = doc.getElementById('controls'), rot = doc.getElementById('rot'), toastEl = doc.getElementById('toast');
  const ctx = canvas.getContext('2d');
  const sound = createSound();
  let save = loadSave();
  sound.setMuted(!!save.mute);
  const input = { left: false, right: false, brake: false, nitro: false, punchL: false, punchR: false };
  const aInput = { left: false, right: false, brake: false, nitro: false, punchL: false, punchR: false };
  const S = { screen: 'menu', paused: false, sel: 0, gsel: save.bike, W: 960, H: 540, resetArm: false };
  let R = null, rd = null, attract = null, attractRd = null, attractIdx = -1, last = 0, acc = 0, toastT = 0;
  const env = { makeCanvas: (w, h) => { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }, quality: save.quality };
  // 3D if the phone supports WebGL, otherwise the 2D renderer
  const c3 = doc.getElementById('c3');
  let use3D = false;
  try {
    if (win.THREE && c3) {
      const gl3 = new win.THREE.WebGLRenderer({ canvas: c3, antialias: true, powerPreference: 'high-performance' });
      gl3.setPixelRatio(1); gl3.shadowMap.enabled = true; gl3.shadowMap.type = win.THREE.PCFSoftShadowMap;
      env.gl3 = gl3; env.aniso = Math.min(8, gl3.capabilities.getMaxAnisotropy ? gl3.capabilities.getMaxAnisotropy() : 1);
      env.tex = (cv) => new win.THREE.CanvasTexture(cv);
      use3D = true;
    }
  } catch (e) { use3D = false; }
  if (!use3D && c3) c3.style.display = 'none';
  const makeRd = (race, old) => {
    if (old && old.dispose) { try { old.dispose(); } catch (e) { /* ignore */ } }
    env.quality = save.quality;
    if (use3D) { env.gl3.shadowMap.enabled = !!save.quality; try { return createRenderer3D(env, race, S.W, S.H); } catch (e) { use3D = false; c3.style.display = 'none'; } }
    return createRenderer(env, race, S.W, S.H);
  };
  const loadingEl = doc.getElementById('loading');
  const withLoading = (fn) => { loadingEl.classList.add('on'); setTimeout(() => { try { fn(); } finally { loadingEl.classList.remove('on'); } }, 40); };

  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); toastT = 2.2; }
  function computeSize() {
    const vw = win.innerWidth || 960, vh = win.innerHeight || 540;
    const aspect = clamp(vw / vh, 1.3, 2.6);
    S.H = save.quality === 0 ? 400 : 540; S.W = Math.round(S.H * aspect);
    canvas.width = S.W; canvas.height = S.H;
    rot.style.display = vh > vw * 0.95 ? 'flex' : 'none';
  }
  function startAttract() {
    attractIdx = (attractIdx + 1) % TRACKS.length;
    attract = createRace(save, attractIdx, { demo: true, seed: Math.floor(Math.random() * 500) });
    attractRd = makeRd(attract, attractRd);
  }
  function startRace(ti) {
    sound.init();
    withLoading(() => {
      R = createRace(save, ti, { seed: Math.floor(Math.random() * 1000) });
      rd = makeRd(R, rd);
      S.paused = false; S.sel = ti;
      for (const k in input) input[k] = false;
      show('race');
    });
  }
  function startRaceNow(ti) {
    R = createRace(save, ti, { seed: Math.floor(Math.random() * 1000) }); rd = makeRd(R, rd);
    S.paused = false; S.sel = ti; for (const k in input) input[k] = false; show('race');
  }

  /* ----- screens ----- */
  const money = (n) => '<span class="chip">' + rupees(n) + '</span>';
  const head = (title) => '<div class="head"><button class="btn small ghost" data-a="back">\u2039 BACK</button><h2>' + title + '</h2>' + money(save.cash) + '</div>';
  const dots = (n, max) => { let s = ''; for (let i = 0; i < max; i++) s += '<i class="' + (i < n ? 'on' : '') + '"></i>'; return '<span class="dots">' + s + '</span>'; };
  const statBar = (label, pct) => '<div class="stat"><span>' + label + '</span><div class="bar"><b style="width:' + Math.round(clamp(pct, 0.04, 1) * 100) + '%"></b></div></div>';

  const screens = {
    menu() {
      return '<div class="scr dimL"><div class="menu"><div class="logo"><div class="l1">TARMAC</div><div class="l2">RIOT</div><div class="tag">Street racing. Zero rules.</div></div>' +
        '<div class="mbtns"><button class="btn big" data-a="race">RACE</button><button class="btn" data-a="garage">GARAGE</button><button class="btn ghost" data-a="settings">SETTINGS</button></div></div>' +
        '<div class="topr">' + money(save.cash) + '<button class="ico" data-a="mute" aria-label="Sound">' + (save.mute ? '\uD83D\uDD07' : '\uD83D\uDD0A') + '</button><button class="ico" data-a="fs" aria-label="Full screen">\u26F6</button></div></div>';
    },
    tracks() {
      const cards = TRACKS.map((t, i) => {
        const locked = i >= save.unlocked, best = save.best[t.id];
        const lvl = Math.round((t.difficulty - 0.85) / 0.06) + 1;
        const bg = 'linear-gradient(180deg,' + t.pal.skyTop + ',' + t.pal.skyMid + ' 55%,' + t.pal.skyBot + ' 56%,' + t.pal.grass[0] + ' 57%,' + t.pal.road[0] + ' 100%)';
        return '<button class="card' + (locked ? ' lock' : '') + '" data-a="track" data-i="' + i + '"' + (locked ? ' disabled' : '') + '><div class="thumb" style="background:' + bg + '"></div>' +
          '<b>' + t.name + '</b><small>' + t.sub + '</small><div class="meta">' + dots(clamp(lvl, 1, 4), 4) + '<span>' + (best ? 'Best: ' + ordinal(best) : (locked ? '' : 'Not raced')) + '</span></div>' +
          (locked ? '<div class="lockmsg">\uD83D\uDD12 Finish top 3 on the previous race</div>' : '') + '</button>';
      }).join('');
      return '<div class="scr dimA">' + head('SELECT RACE') + '<div class="cards">' + cards + '</div><div class="foot">Bike: <b>' + BIKES[save.bike].name + '</b><button class="btn small" data-a="garage">CHANGE</button></div></div>';
    },
    garage() {
      const g = S.gsel, b = BIKES[g], owned = save.owned.indexOf(g) >= 0, eq = save.bike === g;
      const st = bikeStats(save, owned ? g : g);
      const list = BIKES.map((x, i) => '<button class="bk' + (i === g ? ' sel' : '') + '" data-a="bike" data-i="' + i + '"><b>' + x.name + '</b><small>' + (save.owned.indexOf(i) >= 0 ? (save.bike === i ? 'EQUIPPED' : 'OWNED') : rupees(x.price)) + '</small></button>').join('');
      const up = save.up[g] || { e: 0, t: 0, a: 0 };
      const ups = UPGRADES.map((u) => {
        const lvl = up[u.id] || 0, max = lvl >= 3;
        const btn = !owned ? '<button class="btn small" disabled>OWN IT FIRST</button>' : max ? '<button class="btn small ghost" disabled>MAX</button>' : '<button class="btn small" data-a="upg" data-k="' + u.id + '">' + rupees(u.costs[lvl]) + '</button>';
        return '<div class="up"><div><b>' + u.name + '</b><small>' + u.desc + '</small></div>' + dots(lvl, 3) + btn + '</div>';
      }).join('');
      const act = owned ? (eq ? '<button class="btn" disabled>EQUIPPED</button>' : '<button class="btn" data-a="equip">EQUIP</button>') : '<button class="btn" data-a="buybike"' + (save.cash < b.price ? ' disabled' : '') + '>BUY ' + rupees(b.price) + '</button>';
      return '<div class="scr dimA">' + head('GARAGE') + '<div class="garage"><div class="blist">' + list + '</div><div class="bdet"><h3>' + b.name + '</h3><p>' + b.blurb + '</p>' +
        statBar('Top speed', st.top / 1.25) + statBar('Pickup', st.acc / 1.5) + statBar('Handling', st.handling / 1.4) + statBar('Armour', st.armor / 1.6) +
        '<div class="ups">' + ups + '</div><div class="act">' + act + '</div></div></div></div>';
    },
    settings() {
      return '<div class="scr dimA">' + head('SETTINGS') + '<div class="set"><div class="row"><span>Sound</span><button class="btn small" data-a="mute">' + (save.mute ? 'OFF' : 'ON') + '</button></div>' +
        '<div class="row"><span>Graphics</span><button class="btn small" data-a="quality">' + (save.quality ? 'HIGH' : 'LOW (faster)') + '</button></div>' +
        '<div class="how"><b>How to play</b><p>\u25C0 \u25B6 steer. Hold <b>NITRO</b> for a speed burst. Tap \uD83D\uDC4A to punch the rider beside you on that side.</p>' +
        '<p>Take riders down, near-miss traffic and grab pickups for cash and nitro. Hit things and you crash. Cause chaos and the police come: stay clear of them or knock them down.</p>' +
        '<p>Finish in the top 3 to unlock the next race. Spend cash in the garage.</p></div>' +
        '<div class="row"><span>Races ' + save.stats.races + ' \u00B7 Wins ' + save.stats.wins + ' \u00B7 Takedowns ' + save.stats.takedowns + '</span><button class="btn small danger" data-a="reset">' + (S.resetArm ? 'TAP AGAIN TO CONFIRM' : 'RESET PROGRESS') + '</button></div></div></div>';
    },
    results() {
      const r = R.results, t = TRACKS[R.trackIndex];
      const next = R.trackIndex + 1 < TRACKS.length && R.trackIndex + 1 < save.unlocked;
      const line = (k, v, cls) => '<div class="rl ' + (cls || '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
      return '<div class="scr dimA"><div class="res"><div class="rtitle">' + (r.busted ? 'BUSTED!' : 'RACE COMPLETE') + '</div><div class="rsub">' + t.name + '</div>' +
        '<div class="place ' + (r.place <= 3 && !r.busted ? 'win' : '') + '">' + (r.busted ? 'LAST' : ordinal(r.place)) + '</div>' +
        '<div class="rls">' + line('Race time', fmtTime(r.time)) + line('Takedowns', r.takedowns) + line('Near misses', r.nearMisses) +
        line('Prize money', rupees(r.prize)) + line('Bonuses', rupees(r.bonus)) + (r.fines ? line('Police fine', '-' + rupees(r.fines), 'bad') : '') + line('TOTAL', rupees(r.total), 'tot') + '</div>' +
        (R.justUnlocked ? '<div class="unl">\uD83C\uDFC1 New race unlocked: ' + TRACKS[R.trackIndex + 1].name + '</div>' : '') +
        '<div class="rbtns">' + (next ? '<button class="btn" data-a="next">NEXT RACE</button>' : '') + '<button class="btn' + (next ? ' ghost' : '') + '" data-a="retry">RETRY</button><button class="btn ghost" data-a="garage">GARAGE</button><button class="btn ghost" data-a="menu">MENU</button></div></div></div>';
    },
    pause() { return '<div class="scr dimA center"><div class="pbox"><div class="rtitle">PAUSED</div><button class="btn big" data-a="resume">RESUME</button><button class="btn" data-a="restart">RESTART</button><button class="btn ghost" data-a="quit">QUIT TO MENU</button></div></div>'; },
    race() { return ''; },
  };
  function show(name) {
    if (S.screen !== name) S.resetArm = false;
    S.screen = name;
    ui.className = 's-' + name;
    ui.innerHTML = screens[name]();
    controls.style.display = name === 'race' ? 'block' : 'none';
    if (name === 'menu' || name === 'tracks' || name === 'garage' || name === 'settings') { if (!attract) startAttract(); }
  }

  /* ----- actions ----- */
  function applyRaceResults() {
    const before = save.unlocked;
    applyResults(save, R); R.applied = true; R.justUnlocked = save.unlocked > before; writeSave(save);
  }
  const actions = {
    race() { show('tracks'); },
    garage() { S.gsel = save.bike; show('garage'); },
    settings() { show('settings'); },
    back() { show(S.screen === 'results' ? 'menu' : 'menu'); },
    menu() { withLoading(() => { startAttract(); show('menu'); }); },
    track(b) { const i = +b.dataset.i; if (i < save.unlocked) startRace(i); },
    next() { startRace(Math.min(R.trackIndex + 1, TRACKS.length - 1)); },
    retry() { startRace(R.trackIndex); },
    restart() { startRace(R.trackIndex); },
    resume() { S.paused = false; show('race'); },
    quit() { withLoading(() => { startAttract(); show('menu'); }); },
    bike(b) { S.gsel = +b.dataset.i; sound.sfx('ui'); show('garage'); },
    equip() { if (save.owned.indexOf(S.gsel) >= 0) { save.bike = S.gsel; writeSave(save); sound.sfx('buy'); show('garage'); } },
    buybike() {
      const b = BIKES[S.gsel];
      if (save.owned.indexOf(S.gsel) >= 0) return;
      if (save.cash < b.price) { toast('Not enough cash'); return; }
      save.cash -= b.price; save.owned.push(S.gsel); save.up[S.gsel] = { e: 0, t: 0, a: 0 }; save.bike = S.gsel; writeSave(save); sound.sfx('buy'); show('garage'); toast(b.name + ' is yours');
    },
    upg(b) {
      const k = b.dataset.k, up = save.up[S.gsel] || (save.up[S.gsel] = { e: 0, t: 0, a: 0 }), def = UPGRADES.filter((u) => u.id === k)[0];
      const lvl = up[k] || 0;
      if (lvl >= 3) return;
      if (save.cash < def.costs[lvl]) { toast('Not enough cash'); return; }
      save.cash -= def.costs[lvl]; up[k] = lvl + 1; writeSave(save); sound.sfx('buy'); show('garage');
    },
    mute() { save.mute = !save.mute; sound.setMuted(save.mute); writeSave(save); show(S.screen); },
    quality() { save.quality = save.quality ? 0 : 1; writeSave(save); env.quality = save.quality; computeSize(); startAttract(); show('settings'); },
    fs() { try { const e = doc.documentElement; (e.requestFullscreen || e.webkitRequestFullscreen).call(e); } catch (err) { toast('Full screen is not available here'); } },
    reset() {
      if (!S.resetArm) { S.resetArm = true; show('settings'); return; }
      save = DEFAULT_SAVE(); writeSave(save); S.gsel = 0; S.resetArm = false; toast('Progress reset'); show('settings');
    },
  };
  ui.addEventListener('click', (e) => {
    const b = e.target.closest ? e.target.closest('[data-a]') : null;
    if (!b || b.disabled) return;
    sound.init(); if (b.dataset.a !== 'buybike' && b.dataset.a !== 'upg' && b.dataset.a !== 'equip' && b.dataset.a !== 'bike') sound.sfx('ui');
    const fn = actions[b.dataset.a]; if (fn) fn(b);
  });

  /* ----- touch + keyboard controls ----- */
  function hold(id, key) {
    const el = doc.getElementById(id); if (!el) return;
    const down = (e) => { e.preventDefault(); input[key] = true; el.classList.add('on'); sound.init(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
    const up = () => { input[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  }
  function tap(id, key) {
    const el = doc.getElementById(id); if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); input[key] = true; el.classList.add('on'); sound.init(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
    const up = () => el.classList.remove('on'); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  hold('bL', 'left'); hold('bR', 'right'); hold('bB', 'brake'); hold('bN', 'nitro'); tap('bPL', 'punchL'); tap('bPR', 'punchR');
  const pauseBtn = doc.getElementById('bP');
  if (pauseBtn) pauseBtn.addEventListener('click', () => { if (S.screen === 'race' && R && R.phase !== 'finished') { S.paused = true; show('pause'); } });
  const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowDown: 'brake', s: 'brake', S: 'brake', ' ': 'nitro', Shift: 'nitro', z: 'punchL', Z: 'punchL', q: 'punchL', x: 'punchR', X: 'punchR', e: 'punchR' };
  win.addEventListener('keydown', (e) => { const k = KEYS[e.key]; if (k) { input[k] = true; sound.init(); e.preventDefault(); } if (e.key === 'Escape' && S.screen === 'race') { S.paused = true; show('pause'); } });
  win.addEventListener('keyup', (e) => { const k = KEYS[e.key]; if (k && k !== 'punchL' && k !== 'punchR') input[k] = false; });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden && S.screen === 'race' && R && R.phase !== 'finished') { S.paused = true; show('pause'); } });
  let resizeT = null;
  win.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const w0 = S.W, h0 = S.H; computeSize(); if (w0 === S.W && h0 === S.H) return; if (R && rd && (S.screen === 'race' || S.screen === 'pause' || S.screen === 'results')) rd = makeRd(R, rd); if (attract) attractRd = makeRd(attract, attractRd); }, 250); });

  /* ----- main loop ----- */
  function handleEvents(r) {
    for (const e of r.events) {
      if (e === 'siren') continue;
      sound.sfx(e);
      if (win.navigator && win.navigator.vibrate) { try { if (e === 'crash' || e === 'wipe') win.navigator.vibrate(45); else if (e === 'hit') win.navigator.vibrate(18); } catch (err) { /* ignore */ } }
    }
    r.events.length = 0;
  }
  function tick(dt) {
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }
    if ((S.screen === 'race') && R && !S.paused) {
      stepRace(R, STEP, input);
      handleEvents(R);
      sound.drive(R.player.speed / MAXSPEED, R.player.boost, R.phase !== 'countdown' && R.player.state === 'ride', R.cops.some((c) => c.state === 'ride'));
      if (R.results && !R.applied) { applyRaceResults(); sound.drive(0, false, false, false); show('results'); }
    } else if (attract && (S.screen === 'menu' || S.screen === 'tracks' || S.screen === 'garage' || S.screen === 'settings')) {
      autopilot(attract, aInput); stepRace(attract, STEP, aInput); attract.events.length = 0;
      sound.drive(0, false, false, false);
      if (attract.player.z > attract.track.finishZ - 9000) { attract.player.z = 6000; attract.rivals.forEach((r, i) => { r.z = 6000 + (i - 3) * 500; r.finished = false; }); attract.traffic.forEach((tr) => { tr.z = 9000 + Math.random() * (attract.track.finishZ - 14000); }); }
    } else if (S.screen === 'results' || S.screen === 'pause') sound.drive(0, false, false, false);
  }
  function frame(ts) {
    win.requestAnimationFrame(frame);
    const now = ts / 1000; let dt = now - last; last = now; if (!(dt > 0) || dt > 0.25) dt = STEP;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { tick(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    if ((S.screen === 'race' || S.screen === 'pause' || S.screen === 'results') && R && rd) rd.draw(ctx, R, { hud: S.screen !== 'results' });
    else if (attract && attractRd) attractRd.draw(ctx, attract, { hud: false });
  }

  computeSize();
  startAttract();
  show('menu');
  win.requestAnimationFrame(frame);
  win.__TR = { S: S, input: input, startRaceNow: startRaceNow, get use3D() { return use3D; }, get R() { return R; }, get save() { return save; }, get attract() { return attract; }, startRace: startRace, show: show, tick: tick, actions: actions };
}
