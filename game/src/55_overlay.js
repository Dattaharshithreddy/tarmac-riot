/* ---------- 2D overlay for the 3D view: HUD, weather, flashes ---------- */
function createOverlay(R, W, H) {
  const def = R.track.def, pal = def.pal, u = H / 540;
  const rnd = makeRng(7);
  const fx = { parts: [] };
  const nWeather = def.weather === 'rain' ? 170 : def.weather === 'snow' ? 110 : def.weather === 'dust' ? 50 : 0;
  const drops = [];
  for (let i = 0; i < nWeather; i++) drops.push({ x: rnd() * W, y: rnd() * H, s: 0.6 + rnd() * 0.8, r: rnd() });
  function spawnSparks(n) {
    for (let i = 0; i < n; i++) fx.parts.push({ x: W / 2 + (Math.random() - 0.5) * 60 * u, y: H - 60 * u, vx: (Math.random() - 0.5) * 520 * u, vy: -(80 + Math.random() * 380) * u, life: 0.5 + Math.random() * 0.5, c: Math.random() < 0.5 ? '#ffd23f' : '#ff7a1a' });
  }
  function drawEffects(ctx, R, dt) {
    const p = R.player;
    if (R.burst > 0) { spawnSparks(R.burst); R.burst = 0; }
    for (const q of fx.parts) { q.life -= dt; q.vy += 900 * u * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    fx.parts = fx.parts.filter((q) => q.life > 0);
    ctx.save();
    for (const q of fx.parts) { ctx.globalAlpha = Math.min(1, q.life * 2); ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, 3 * u, 3 * u); }
    ctx.restore();
    if (p.boost) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2 * u;
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, r0 = H * (0.32 + Math.random() * 0.2), r1 = r0 + H * (0.12 + Math.random() * 0.25);
        ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r0 * 1.5, H / 2 + Math.sin(a) * r0); ctx.lineTo(W / 2 + Math.cos(a) * r1 * 1.5, H / 2 + Math.sin(a) * r1); ctx.stroke();
      }
      ctx.restore();
    }
    // weather
    if (drops.length) {
      ctx.save();
      const sp = Math.max(0.3, p.speed / MAXSPEED);
      if (def.weather === 'rain') {
        ctx.strokeStyle = 'rgba(210,225,240,.45)'; ctx.lineWidth = 1.4 * u; ctx.beginPath();
        for (const d of drops) { d.y += (900 + 500 * sp) * d.s * u * dt; d.x -= 140 * u * dt; if (d.y > H) { d.y = -20; d.x = Math.random() * W * 1.2; } if (d.x < -10) d.x += W; ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 5 * u, d.y - 20 * u * d.s); }
        ctx.stroke();
      } else if (def.weather === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        for (const d of drops) { d.y += (90 + 140 * sp) * d.s * u * dt; d.x += Math.sin(R.time * 2 + d.r * 9) * 30 * u * dt; if (d.y > H) { d.y = -6; d.x = Math.random() * W; } ctx.beginPath(); ctx.arc(d.x, d.y, (1.2 + d.r * 1.8) * u, 0, 7); ctx.fill(); }
      } else {
        ctx.fillStyle = 'rgba(255,220,160,.22)';
        for (const d of drops) { d.x -= (300 + 500 * sp) * d.s * u * dt; if (d.x < -20) { d.x = W + 10; d.y = H * (0.35 + Math.random() * 0.65); } ctx.fillRect(d.x, d.y, (8 + d.r * 16) * u, 2 * u); }
      }
      ctx.restore();
    }
    if (def.weather === 'dust' || def.weather === 'rain') { ctx.fillStyle = def.weather === 'rain' ? 'rgba(20,30,45,.14)' : 'rgba(255,200,120,.10)'; ctx.fillRect(0, 0, W, H); }
    if (R.flash > 0.02) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
      g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, 'rgba(255,0,0,' + Math.min(0.75, R.flash) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  function text(ctx, str, x, y, size, color, align, italic) {
    ctx.font = (italic === false ? '800 ' : 'italic 900 ') + Math.round(size) + 'px ' + FONT; ctx.textAlign = align || 'left';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size * 0.14); ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.strokeText(str, x, y);
    ctx.fillStyle = color || '#fff'; ctx.fillText(str, x, y);
  }
  function bar(ctx, x, y, w, h, frac, color, back) {
    fillRR(ctx, x, y, w, h, h / 2, back || 'rgba(0,0,0,.5)');
    if (frac > 0) fillRR(ctx, x + 1.5 * u, y + 1.5 * u, Math.max(h - 3 * u, (w - 3 * u) * clamp(frac, 0, 1)), h - 3 * u, (h - 3 * u) / 2, color);
  }
  function drawHUD(ctx, R) {
    const p = R.player, pad = 16 * u;
    text(ctx, ordinal(p.livePlace || 8), pad, pad + 50 * u, 56 * u, '#ffd400');
    text(ctx, '/ ' + (R.rivals.length + 1), pad + ctx.measureText(ordinal(p.livePlace || 8)).width + 8 * u, pad + 50 * u, 22 * u, '#fff');
    // wanted stars
    const stars = R.wanted || 0;
    if (stars > 0) text(ctx, R.cops.some((c) => c.state === 'ride' && !c.giveUp) ? 'WANTED \u2022 POLICE CHASE' : 'WANTED', pad + 128 * u, pad + 77 * u, 14 * u, Math.floor(R.time * 3) % 2 ? '#ff6b6b' : '#69b7ff');
    for (let i = 0; i < 5; i++) {
      const cx = pad + 10 * u + i * 24 * u, cy = pad + 72 * u, ro = 10 * u, ri = 4.4 * u;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? ri : ro; ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fillStyle = i < stars ? (R.cops.length ? '#69b7ff' : '#ff5d5d') : 'rgba(255,255,255,.28)'; ctx.fill();
      ctx.lineWidth = 1.2 * u; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
    }
    // progress
    const bw = W * 0.30, bx = (W - bw) / 2, by = pad + 6 * u, bh = 12 * u;
    fillRR(ctx, bx, by, bw, bh, bh / 2, 'rgba(0,0,0,.5)');
    const fin = R.track.finishZ, pr = (z) => bx + clamp((z - START_Z) / (fin - START_Z), 0, 1) * bw;
    for (const r of R.rivals) { ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.beginPath(); ctx.arc(pr(r.z), by + bh / 2, 3.2 * u, 0, 7); ctx.fill(); }
    for (const c of R.cops) { ctx.fillStyle = '#69b7ff'; ctx.beginPath(); ctx.arc(pr(c.z), by + bh / 2, 3.6 * u, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#ff6a00'; ctx.beginPath(); ctx.arc(pr(p.z), by + bh / 2, 5.5 * u, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw - 2 * u, by - 3 * u, 3 * u, bh + 6 * u);
    // health and nitro
    const sw = bw * 0.48, sy = by + 24 * u;
    bar(ctx, bx, sy, sw, 11 * u, p.health / 100, p.health < 30 ? '#ff4d4d' : '#4ddc7a');
    bar(ctx, bx + bw - sw, sy, sw, 11 * u, p.nitro / 100, p.boost ? '#ffffff' : '#46a8ff');
    ctx.font = '800 ' + Math.round(11 * u) + 'px ' + FONT; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'left'; ctx.fillText('HEALTH', bx, sy + 24 * u); ctx.textAlign = 'right'; ctx.fillText('NITRO', bx + bw, sy + 24 * u);
    // speed + time
    text(ctx, Math.round(p.speed * KMH), W - 84 * u, pad + 50 * u, 52 * u, p.boost ? '#9fd4ff' : '#ffffff', 'right');
    text(ctx, 'KM/H', W - 84 * u, pad + 68 * u, 14 * u, '#ffffff', 'right');
    text(ctx, fmtTime(R.raceTime), W - 84 * u, pad + 92 * u, 20 * u, '#ffffff', 'right', false);
    // weapon
    if (p.weapon) text(ctx, WEAPONS[p.weapon.type].label.toUpperCase() + ' x' + p.weapon.uses, W / 2, sy + 52 * u, 20 * u, '#ffd400', 'center');
    // cash this race
    text(ctx, rupees(R.earned), W - 84 * u, pad + 118 * u, 18 * u, '#7CFFB2', 'right', false);
    // police closing in from behind (the camera looks ahead, so warn the rider)
    let nearest = null;
    for (const c of R.cops) if (c.state === 'ride' && !c.giveUp && c.z < p.z - 250 && c.z > p.z - 9000 && (!nearest || c.z > nearest.z)) nearest = c;
    if (nearest && R.phase === 'race') {
      const m = Math.round((p.z - nearest.z) * 0.0045), side = nearest.x < p.x - 0.2 ? '\u25E3 ' : nearest.x > p.x + 0.2 ? ' \u25E2' : '';
      const on = Math.floor(R.time * 4) % 2;
      fillRR(ctx, W / 2 - 92 * u, H - 54 * u, 184 * u, 30 * u, 15 * u, on ? 'rgba(200,30,30,.75)' : 'rgba(30,70,200,.75)');
      text(ctx, (nearest.car ? 'POLICE JEEP ' : 'POLICE ') + m + ' m BEHIND' + side, W / 2, H - 33 * u, 16 * u, '#ffffff', 'center');
    }
    // bust meter
    if (R.bust > 0.05) { const w2 = W * 0.22; bar(ctx, (W - w2) / 2, H * 0.62, w2, 10 * u, R.bust / 3, '#ff5d5d'); text(ctx, 'BUSTING...', W / 2, H * 0.62 - 6 * u, 16 * u, '#ff8a8a', 'center'); }
    // popups
    let py = H * 0.28;
    for (const q of R.popups) {
      ctx.save(); ctx.globalAlpha = clamp(1 - (q.t - 1.4) / 0.8, 0, 1);
      const pop = q.t < 0.18 ? 0.6 + q.t / 0.18 * 0.4 : 1;
      text(ctx, q.text, W / 2, py - q.t * 18 * u, 30 * u * pop, q.color, 'center'); ctx.restore(); py += 38 * u;
    }
    // countdown
    if (R.phase === 'countdown') {
      const n = Math.ceil(R.count);
      text(ctx, n >= 1 && n <= 3 ? String(n) : 'GET READY', W / 2, H * 0.36, (n >= 1 && n <= 3 ? 120 : 56) * u, '#ffd400', 'center');
    }
  }

  return {
    draw(ctx, R, dt, o) { o = o || {}; ctx.clearRect(0, 0, W, H); drawEffects(ctx, R, dt); if (o.hud !== false) drawHUD(ctx, R); if (o.labels) for (const l of o.labels) text(ctx, l.text, l.x, l.y, 15 * u, '#ffffff', 'center'); },
  };
}
