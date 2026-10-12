/* ---------- renderer ---------- */
function createRenderer(env, R, W, H) {
  const make = env.makeCanvas;
  const def = R.track.def, pal = def.pal;
  const rnd = makeRng(99 + R.trackIndex * 13);
  const S = buildSprites(make, def, rnd);
  const BG = buildBackdrop(make, def, W, H, rnd);
  const u = H / 540;
  let drawDist = env.quality === 0 ? 120 : 200;
  const fx = { zoom: 0, parts: [], lastT: R.time, rainT: 0 };
  const nWeather = def.weather === 'rain' ? 150 : def.weather === 'snow' ? 100 : def.weather === 'dust' ? 50 : 0;
  const drops = [];
  for (let i = 0; i < nWeather; i++) drops.push({ x: rnd() * W, y: rnd() * H, s: 0.6 + rnd() * 0.8, r: rnd() });

  const BASE_SCALE = CAM_DEPTH / PLAYER_Z;
  const COLS = { shadow: 'rgba(0,0,0,0.55)' };

  function project(p, cx, cy, cz) {
    p.camera.x = (p.world.x || 0) - cx;
    p.camera.y = (p.world.y || 0) - cy;
    p.camera.z = (p.world.z || 0) - cz;
    p.screen.scale = CAM_DEPTH / p.camera.z;
    p.screen.x = Math.round(W / 2 + p.screen.scale * p.camera.x * W / 2);
    p.screen.y = Math.round(H / 2 - p.screen.scale * p.camera.y * H / 2);
    p.screen.w = Math.round(p.screen.scale * ROAD_W * W / 2);
  }
  function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
  }
  function drawSegment(ctx, seg) {
    const a = seg.p1.screen, b = seg.p2.screen, c = seg.color;
    const x1 = a.x, y1 = a.y, w1 = a.w, x2 = b.x, y2 = b.y, w2 = b.w;
    ctx.fillStyle = pal.grass[c]; ctx.fillRect(0, y2, W, y1 - y2);
    const r1 = w1 / Math.max(6, 2 * LANES), r2 = w2 / Math.max(6, 2 * LANES);
    quad(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, pal.rumble[c]);
    quad(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, pal.rumble[c]);
    quad(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, pal.road[c]);
    if (seg.finish) {
      const cells = 12;
      for (let i = 0; i < cells; i++) {
        const t0 = i / cells, t1 = (i + 1) / cells;
        quad(ctx, x1 - w1 + 2 * w1 * t0, y1, x1 - w1 + 2 * w1 * t1, y1, x2 - w2 + 2 * w2 * t1, y2, x2 - w2 + 2 * w2 * t0, y2, (i + seg.index) % 2 ? '#111' : '#f4f4f4');
      }
      return;
    }
    const l1 = w1 / Math.max(32, 8 * LANES), l2 = w2 / Math.max(32, 8 * LANES);
    const lw1 = (w1 * 2) / LANES, lw2 = (w2 * 2) / LANES;
    let lx1 = x1 - w1 + lw1, lx2 = x2 - w2 + lw2;
    for (let lane = 1; lane < LANES; lane++, lx1 += lw1, lx2 += lw2) {
      if (lane === LANES / 2) {
        quad(ctx, lx1 - l1 * 1.4, y1, lx1 + l1 * 1.4, y1, lx2 + l2 * 1.4, y2, lx2 - l2 * 1.4, y2, pal.laneC);
      } else if (c === 0) {
        quad(ctx, lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2, pal.lane);
      }
    }
  }
  function blit(ctx, img, destX, baseY, worldW, scale, clipY, rot, alpha) {
    const dw = scale * ROAD_W * (W / 2) * worldW;
    if (dw < 1.5 || dw > W * 4) return 0;
    const dh = (dw * img.height) / img.width;
    if (clipY !== undefined && baseY - dh >= clipY) return dw;
    if (destX + dw < -dw || destX - dw > W + dw) return dw;
    const needClip = clipY !== undefined && baseY > clipY + 0.5;
    if (needClip || rot || alpha !== undefined) ctx.save();
    if (needClip) { ctx.beginPath(); ctx.rect(0, 0, W, clipY); ctx.clip(); }
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    if (rot) { ctx.translate(destX, baseY); ctx.rotate(rot); ctx.drawImage(img, -dw / 2, -dh, dw, dh); }
    else ctx.drawImage(img, destX - dw / 2, baseY - dh, dw, dh);
    if (needClip || rot || alpha !== undefined) ctx.restore();
    return dw;
  }
  function drawGate(ctx, seg, label) {
    const a = seg.p1.screen; if (seg.p1.camera.z <= CAM_DEPTH * 1.5 || a.w > W * 2.5) return;
    const gh = a.w * 0.78, th = Math.max(2, a.w * 0.06);
    ctx.fillStyle = '#2b2d33'; ctx.fillRect(a.x - a.w * 1.12 - th, a.y - gh, th, gh); ctx.fillRect(a.x + a.w * 1.12, a.y - gh, th, gh);
    const bh = gh * 0.26, bx = a.x - a.w * 1.12 - th, bw = a.w * 2.24 + th * 2, by = a.y - gh;
    ctx.fillStyle = '#17181c'; ctx.fillRect(bx, by, bw, bh);
    if (label === 'finish') {
      const cells = 28, ch = bh / 2;
      for (let i = 0; i < cells; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; ctx.fillRect(bx + (bw / cells) * i, by + ch * j, bw / cells + 0.5, ch + 0.5); }
    } else {
      ctx.fillStyle = '#ff6a00'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#fff'; ctx.font = 'italic 900 ' + Math.max(6, bh * 0.7) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('TARMAC RIOT', a.x, by + bh * 0.76);
    }
  }
  const imgFor = (t) => {
    if (t.type === 'car') return S.carFor(t.color);
    if (t.type === 'truck') return S.truckFor(t.color, t.v);
    return t.type === 'rick' ? S.rick : S.bus;
  };

  function drawRacer(ctx, r, x, baseY, scale, clipY, time) {
    const st = r.style;
    let frame = 'idle', rot = r.lean * 0.3, lift = 0, alpha;
    const weapon = r.weapon ? (r.weapon.type === 'chain' ? 'chain' : 'bat') : null;
    let tumble = 0;
    if (r.state === 'wipe') {
      if (r.wipeT < 0.55) { const k = r.wipeT / 0.55; tumble = r.wipeT * 15 * (r.x > 0 ? -1 : 1); rot = 0; lift = Math.sin(k * Math.PI) * 0.55; }
      else { frame = 'down'; rot = 0; }
    } else {
      const atkT = r.isPlayer ? r.punchT : r.atkT, side = r.isPlayer ? r.punchSide : r.atkSide;
      if (atkT < 0.26 && side) frame = side < 0 ? 'L' : 'R';
    }
    if (r.isPlayer && r.inv > 0 && r.state === 'ride' && Math.floor(time * 16) % 2) alpha = 0.45;
    const img = getRider(make, st, frame, frame === 'L' || frame === 'R' ? weapon : null);
    let dw;
    if (tumble) {
      dw = scale * ROAD_W * (W / 2) * SPRITE_W.rider;
      const dhh = (dw * img.height) / img.width;
      ctx.save(); ctx.translate(x, baseY - dhh * 0.5 - lift * dhh * 1.4); ctx.rotate(tumble); ctx.drawImage(img, -dw / 2, -dhh / 2, dw, dhh); ctx.restore();
    } else dw = blit(ctx, img, x, baseY, SPRITE_W.rider, scale, clipY, rot, alpha);
    if (!dw) return;
    const dh = dw * img.height / img.width;
    if (st.cop && r.state === 'ride') {
      const on = Math.floor(time * 6) % 2, sx = x + (on ? -dw * 0.08 : dw * 0.08), sy = baseY - dh * 0.95;
      const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, dw * 0.28); g.addColorStop(0, on ? 'rgba(255,60,60,.95)' : 'rgba(70,130,255,.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - dw * 0.3, sy - dw * 0.3, dw * 0.6, dw * 0.6);
    }
    if (r.hurtT > 0.12 && r.state === 'ride') {
      const cx = x + (r.x > R.player.x ? -1 : 1) * dw * 0.1, cy = baseY - dh * 0.55;
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, dw * 0.03);
      for (let i = 0; i < 8; i++) { const a = i * 0.785 + 0.2, r0 = dw * 0.12, r1 = dw * (0.26 + (i % 2) * 0.1); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke(); }
      ctx.restore();
    }
    if (!r.isPlayer && !r.isCop && dw > 70 * u && dw < 260 * u && r.state === 'ride' && !r.finished) {
      ctx.font = 'italic 800 ' + Math.round(14 * u) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillText(r.name, x + 1, baseY - dh - 5 * u + 1); ctx.fillStyle = '#fff'; ctx.fillText(r.name, x, baseY - dh - 5 * u);
    }
  }

  function drawBackdrop(ctx, R) {
    ctx.drawImage(BG.sky, 0, 0);
    const y = Math.round(H * 0.5 + 12 - BG.LH);
    const fo = ((((R.bg * 0.5) % 1) + 1) % 1) * BG.LW, mo = ((((R.bg * 1.0) % 1) + 1) % 1) * BG.LW;
    ctx.drawImage(BG.far, -fo, y); ctx.drawImage(BG.far, -fo + BG.LW, y);
    ctx.drawImage(BG.mid, -mo, y + 10); ctx.drawImage(BG.mid, -mo + BG.LW, y + 10);
  }

  function drawWorld(ctx, R) {
    const p = R.player, track = R.track, segs = track.segs, N = segs.length;
    const position = Math.max(0, p.z - PLAYER_Z);
    const baseIdx = clamp(Math.floor(position / SEG), 0, N - 1);
    const base = segs[baseIdx];
    const basePercent = (position % SEG) / SEG;
    const pSeg = segAt(track, p.z), pPercent = (p.z % SEG) / SEG;
    const playerY = lerp(pSeg.p1.world.y, pSeg.p2.world.y, pPercent);
    const camX = p.x * ROAD_W;
    const nMax = Math.min(drawDist, N - baseIdx);
    let maxy = H, x = 0, dx = -(base.curve * basePercent);

    for (let n = 0; n < nMax; n++) {
      const seg = segs[baseIdx + n];
      seg.clip = maxy;
      project(seg.p1, camX - x, playerY + CAM_H, position);
      project(seg.p2, camX - x - dx, playerY + CAM_H, position);
      x += dx; dx += seg.curve;
      seg.shown = false;
      if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      seg.shown = true;
      drawSegment(ctx, seg);
      maxy = seg.p1.screen.y;
    }

    // bucket moving things by segment
    const buckets = new Array(nMax);
    const put = (kind, e) => {
      const idx = Math.floor(e.z / SEG) - baseIdx;
      if (idx < 0 || idx >= nMax) return;
      (buckets[idx] || (buckets[idx] = [])).push({ k: kind, e: e });
    };
    for (const t of R.traffic) put('t', t);
    for (const r of R.rivals) put('r', r);
    for (const c of R.cops) put('r', c);
    for (const k of R.pickups) if (!k.got) put('p', k);
    for (const h of R.hazards) put('h', h);

    for (let n = nMax - 1; n >= 0; n--) {
      const seg = segs[baseIdx + n];
      const a = seg.p1.screen, b = seg.p2.screen;
      if (seg.p1.camera.z <= CAM_DEPTH) continue;
      for (const s of seg.sprites) {
        const imgs = S.scenery[s.t]; if (!imgs) continue;
        const img = imgs[s.v % imgs.length];
        blit(ctx, img, a.x + a.scale * s.off * ROAD_W * W / 2, a.y, SPRITE_W[s.t] || 1, a.scale, seg.clip);
      }
      if (seg.gate) drawGate(ctx, seg, seg.gate);
      const list = buckets[n];
      if (list) {
        list.sort((m, q) => q.e.z - m.e.z);
        for (const it of list) {
          const e = it.e, pc = (e.z - seg.p1.world.z) / SEG;
          const sc = lerp(a.scale, b.scale, pc), sx = lerp(a.x, b.x, pc) + sc * e.x * ROAD_W * W / 2, sy = lerp(a.y, b.y, pc);
          if (it.k === 't') {
            const img = imgFor(e), wd = SPRITE_W[e.type];
            blit(ctx, img, sx, sy, wd, sc, seg.clip);
          } else if (it.k === 'r' && e.car) {
            blit(ctx, S.carFor('#f2f2f2'), sx, sy, SPRITE_W.car, sc, seg.clip);
            if (e.state === 'ride') { const on = Math.floor(R.time * 6) % 2, rr = sc * ROAD_W * W * 0.06; ctx.fillStyle = on ? 'rgba(255,60,60,.9)' : 'rgba(70,130,255,.9)'; ctx.beginPath(); ctx.arc(sx, sy - rr * 2.2, Math.max(2, rr * 0.4), 0, 7); ctx.fill(); }
          } else if (it.k === 'r') drawRacer(ctx, e, sx, sy, sc, seg.clip, R.time);
          else if (it.k === 'p') { const bob = Math.sin(R.time * 4 + e.z) * 6 * u * (sc / BASE_SCALE); blit(ctx, S.pick[e.type], sx, sy - 20 * u * sc / BASE_SCALE * 0.8 + bob, SPRITE_W.pick, sc, seg.clip); }
          else blit(ctx, e.type === 'cone' ? S.cone : S.barrel, sx, sy, e.type === 'cone' ? SPRITE_W.cone : SPRITE_W.barrel, sc, seg.clip);
        }
      }
    }

    // haze toward the horizon
    const hz = H * 0.5, hg = ctx.createLinearGradient(0, hz - H * 0.07, 0, hz + H * 0.26);
    hg.addColorStop(0, rgba(pal.fog, 0)); hg.addColorStop(0.27, rgba(pal.fog, 0.8)); hg.addColorStop(1, rgba(pal.fog, 0));
    ctx.fillStyle = hg; ctx.fillRect(0, hz - H * 0.07, W, H * 0.33);

    // the player
    const pcy = lerp(pSeg.p1.camera.y, pSeg.p2.camera.y, pPercent);
    const bounce = (p.speed / MAXSPEED) * Math.sin(R.time * 55) * 1.3 * u + (Math.abs(p.x) > 1.08 ? Math.sin(R.time * 90) * 3 * u : 0);
    const py = H / 2 - BASE_SCALE * pcy * H / 2 + bounce;
    if (p.state !== 'busted' || true) drawRacer(ctx, p, W / 2, py, BASE_SCALE, undefined, R.time);
    return { pSeg: pSeg };
  }

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
    // heat stars
    const stars = Math.ceil(R.heat / 20);
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
    W: W, H: H, S: S,
    setQuality(q) { drawDist = q === 0 ? 120 : 200; },
    draw(ctx, R, o) {
      o = o || {};
      const dt = Math.min(0.1, Math.max(0, R.time - fx.lastT)); fx.lastT = R.time;
      const p = R.player;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      if (R.shake > 0.5) ctx.translate((Math.random() - 0.5) * R.shake * u, (Math.random() - 0.5) * R.shake * u);
      fx.zoom += ((p.boost ? 0.05 : 0) - fx.zoom) * Math.min(1, dt * 7);
      if (fx.zoom > 0.002) { ctx.translate(W / 2, H / 2); ctx.scale(1 + fx.zoom, 1 + fx.zoom); ctx.translate(-W / 2, -H / 2); }
      drawBackdrop(ctx, R);
      drawWorld(ctx, R);
      ctx.restore();
      drawEffects(ctx, R, dt);
      if (o.hud !== false) drawHUD(ctx, R);
    },
  };
}
