/* ---------- procedural art ---------- */
const FONT = '"Roboto Condensed","sans-serif-condensed","Arial Narrow",system-ui,sans-serif';
function rrPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function fillRR(c, x, y, w, h, r, fill) { rrPath(c, x, y, w, h, r); c.fillStyle = fill; c.fill(); }
function ellipseFill(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
function poly(c, pts, fill) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fillStyle = fill; c.fill(); }
function mk(make, w, h, fn) { const cv = make(w, h); const c = cv.getContext('2d'); fn(c, w, h); return cv; }
function groundShadow(c, cx, y, rx) { ellipseFill(c, cx, y, rx, 6, 'rgba(0,0,0,0.30)'); }

/* ----- riders (seen from behind) ----- */
const RIDER_W = 176, RIDER_H = 160;
function drawRiderFrame(c, style, frame, weapon) {
  const cx = 88;
  c.clearRect(0, 0, RIDER_W, RIDER_H);
  groundShadow(c, cx, 152, 40);
  if (frame === 'down') {
    // bike lying on its side with the rider sprawled next to it
    ellipseFill(c, cx - 36, 138, 15, 15, '#111'); ellipseFill(c, cx - 36, 138, 6, 6, '#777');
    fillRR(c, cx - 26, 124, 56, 20, 8, style.bike); fillRR(c, cx - 20, 128, 22, 6, 3, 'rgba(255,255,255,.35)');
    c.save(); c.translate(cx + 30, 128); c.rotate(-0.18);
    fillRR(c, -4, -12, 46, 24, 10, style.jacket); fillRR(c, 36, -6, 26, 14, 6, '#1c1f26'); c.restore();
    ellipseFill(c, cx + 18, 118, 15, 15, style.helmet); ellipseFill(c, cx + 14, 114, 5, 4, 'rgba(255,255,255,.5)');
    return;
  }
  // rear wheel
  fillRR(c, cx - 9, 108, 18, 44, 8, '#0f0f10');
  c.fillStyle = '#2b2b2e'; for (let i = 0; i < 6; i++) c.fillRect(cx - 7, 112 + i * 6.5, 14, 2);
  // exhaust
  fillRR(c, cx + 16, 112, 13, 34, 6, '#9a9aa2'); fillRR(c, cx + 18, 140, 9, 8, 3, '#47474d');
  // tail section and light
  fillRR(c, cx - 16, 98, 32, 18, 6, shade(style.bike, -0.28));
  poly(c, [[cx - 22, 94], [cx + 22, 94], [cx + 15, 114], [cx - 15, 114]], style.bike);
  fillRR(c, cx - 10, 103, 20, 6, 3, '#ff2f2f');
  // legs and boots
  fillRR(c, cx - 26, 80, 19, 38, 7, '#1d2028'); fillRR(c, cx + 7, 80, 19, 38, 7, '#1d2028');
  fillRR(c, cx - 29, 108, 22, 13, 5, '#0b0c0f'); fillRR(c, cx + 7, 108, 22, 13, 5, '#0b0c0f');
  // torso
  const g = c.createLinearGradient(cx - 28, 0, cx + 28, 0);
  g.addColorStop(0, shade(style.jacket, -0.22)); g.addColorStop(0.5, shade(style.jacket, 0.1)); g.addColorStop(1, shade(style.jacket, -0.22));
  c.beginPath(); c.moveTo(cx - 28, 54); c.quadraticCurveTo(cx, 44, cx + 28, 54); c.lineTo(cx + 23, 96); c.lineTo(cx - 23, 96); c.closePath(); c.fillStyle = g; c.fill();
  c.fillStyle = 'rgba(255,255,255,.88)'; c.fillRect(cx - 3, 50, 6, 46);
  c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(cx - 23, 88, 46, 8);
  // handlebar
  c.strokeStyle = '#1b1b1f'; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - 50, 90); c.lineTo(cx + 50, 90); c.stroke();
  fillRR(c, cx - 58, 74, 12, 8, 3, '#222'); fillRR(c, cx + 46, 74, 12, 8, 3, '#222');
  // arms
  c.lineCap = 'round'; c.strokeStyle = style.jacket; c.lineWidth = 14;
  const armTo = (side) => (frame === 'L' && side < 0) ? [cx - 84, 56] : (frame === 'R' && side > 0) ? [cx + 84, 56] : [cx + side * 46, 88];
  for (const side of [-1, 1]) {
    const [ex, ey] = armTo(side);
    c.beginPath(); c.moveTo(cx + side * 24, 60); c.lineTo(ex, ey); c.stroke();
    ellipseFill(c, ex, ey, 8, 8, side * (ex - cx) > 60 ? '#e8b48a' : '#15161a');
  }
  if (frame === 'L' || frame === 'R') {
    const s = frame === 'L' ? -1 : 1, hx = cx + s * 84, hy = 56;
    if (weapon === 'bat') {
      c.strokeStyle = '#7a4a22'; c.lineWidth = 9; c.beginPath(); c.moveTo(hx, hy + 12); c.lineTo(hx + s * 8, hy - 44); c.stroke();
      c.strokeStyle = '#a56a35'; c.lineWidth = 4; c.beginPath(); c.moveTo(hx + 2 * s, hy + 6); c.lineTo(hx + s * 8, hy - 40); c.stroke();
    } else if (weapon === 'chain') {
      c.strokeStyle = '#c9ced6'; c.lineWidth = 3.5;
      for (let i = 0; i < 7; i++) { const a = i * 0.55; c.beginPath(); c.ellipse(hx + s * (6 + i * 3), hy - 8 - Math.sin(a) * 26 + i * 4, 5, 3, 0.6 * s, 0, Math.PI * 2); c.stroke(); }
    }
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3;
    c.beginPath(); c.arc(hx, hy, 15, s > 0 ? -0.9 : Math.PI - 0.9, s > 0 ? 0.9 : Math.PI + 0.9, false); c.stroke();
  }
  // helmet
  ellipseFill(c, cx, 33, 19, 19, style.helmet);
  c.fillStyle = 'rgba(0,0,0,.16)'; c.beginPath(); c.arc(cx, 33, 19, 0.2, Math.PI - 0.2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(cx - 7, 25, 6, 4, -0.6, 0, Math.PI * 2); c.fill();
  c.fillStyle = shade(style.jacket, 0); c.fillRect(cx - 3, 15, 6, 30);
  fillRR(c, cx - 8, 46, 16, 8, 3, '#1d2028');
}
const riderCache = new Map();
function getRider(make, style, frame, weapon) {
  const key = style.jacket + style.helmet + style.bike + '|' + frame + '|' + (weapon || '');
  let cv = riderCache.get(key);
  if (!cv || cv.__make !== make) {
    cv = mk(make, RIDER_W, RIDER_H, (c) => drawRiderFrame(c, style, frame, weapon)); cv.__make = make; riderCache.set(key, cv);
  }
  return cv;
}

/* ----- traffic ----- */
function carSprite(make, color) {
  return mk(make, 160, 112, (c) => {
    groundShadow(c, 80, 106, 72);
    fillRR(c, 16, 86, 26, 22, 5, '#101010'); fillRR(c, 118, 86, 26, 22, 5, '#101010');
    const g = c.createLinearGradient(0, 48, 0, 96); g.addColorStop(0, shade(color, 0.18)); g.addColorStop(1, shade(color, -0.3));
    fillRR(c, 8, 48, 144, 48, 12, g);
    poly(c, [[28, 50], [46, 16], [114, 16], [132, 50]], shade(color, -0.1));
    poly(c, [[38, 48], [52, 23], [108, 23], [122, 48]], '#17222e');
    poly(c, [[52, 23], [72, 23], [62, 48], [42, 48]], 'rgba(255,255,255,.13)');
    fillRR(c, 12, 58, 30, 14, 4, '#ff2a2a'); fillRR(c, 118, 58, 30, 14, 4, '#ff2a2a');
    fillRR(c, 14, 60, 26, 4, 2, '#ff9a9a'); fillRR(c, 120, 60, 26, 4, 2, '#ff9a9a');
    fillRR(c, 10, 84, 140, 12, 4, '#1b1b1f'); fillRR(c, 62, 66, 36, 15, 2, '#f2f2f2');
    c.fillStyle = '#222'; c.font = 'bold 11px ' + FONT; c.textAlign = 'center'; c.fillText('MH 01', 80, 77);
  });
}
function rickSprite(make) {
  return mk(make, 130, 130, (c) => {
    groundShadow(c, 65, 124, 58);
    fillRR(c, 8, 98, 22, 28, 6, '#101010'); fillRR(c, 100, 98, 22, 28, 6, '#101010');
    fillRR(c, 14, 52, 102, 54, 8, '#f6c700'); fillRR(c, 14, 92, 102, 14, 6, '#d9a900');
    fillRR(c, 6, 22, 118, 36, 12, '#1c1c20'); fillRR(c, 14, 26, 102, 8, 4, '#33333a');
    fillRR(c, 34, 60, 62, 24, 5, '#18222c'); poly(c, [[34, 60], [52, 60], [44, 84], [34, 84]], 'rgba(255,255,255,.12)');
    fillRR(c, 16, 90, 14, 8, 3, '#ff2a2a'); fillRR(c, 100, 90, 14, 8, 3, '#ff2a2a');
    c.fillStyle = '#1c1c20'; c.font = 'bold 10px ' + FONT; c.textAlign = 'center'; c.fillText('AUTO', 65, 100);
  });
}
function truckSprite(make, color, v) {
  const texts = ['HORN OK PLEASE', 'BUDDY WAIT', 'SAFE JOURNEY', 'MAA KA AASHIRVAD'];
  return mk(make, 190, 220, (c) => {
    groundShadow(c, 95, 214, 84);
    fillRR(c, 16, 178, 32, 38, 6, '#0e0e0e'); fillRR(c, 142, 178, 32, 38, 6, '#0e0e0e');
    fillRR(c, 10, 150, 170, 34, 5, '#1d1f24');
    const g = c.createLinearGradient(0, 8, 0, 152); g.addColorStop(0, shade(color, 0.12)); g.addColorStop(1, shade(color, -0.25));
    fillRR(c, 12, 8, 166, 146, 6, g);
    fillRR(c, 12, 108, 166, 12, 0, '#f2b705'); fillRR(c, 12, 122, 166, 8, 0, '#1fa97a'); fillRR(c, 12, 132, 166, 8, 0, '#d9382b');
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(12 + i * 27.6, 10); c.lineTo(12 + i * 27.6, 106); c.stroke(); }
    fillRR(c, 30, 38, 130, 34, 6, 'rgba(255,255,255,.9)');
    c.fillStyle = '#c0261b'; c.textAlign = 'center'; let fs = 19; c.font = 'bold ' + fs + 'px ' + FONT; while (c.measureText(texts[v % 4]).width > 118 && fs > 9) { fs--; c.font = 'bold ' + fs + 'px ' + FONT; } c.fillText(texts[v % 4], 95, 62);
    fillRR(c, 16, 150, 18, 12, 3, '#ff2a2a'); fillRR(c, 156, 150, 18, 12, 3, '#ff2a2a');
    fillRR(c, 40, 168, 110, 8, 3, '#2a2c33'); fillRR(c, 62, 158, 66, 12, 2, '#f2f2f2');
    c.fillStyle = '#222'; c.font = 'bold 9px ' + FONT; c.fillText('RJ 14 GA 4421', 95, 168);
  });
}
function busSprite(make) {
  return mk(make, 200, 190, (c) => {
    groundShadow(c, 100, 184, 90);
    fillRR(c, 18, 150, 32, 36, 6, '#0e0e0e'); fillRR(c, 150, 150, 32, 36, 6, '#0e0e0e');
    const g = c.createLinearGradient(0, 8, 0, 160); g.addColorStop(0, '#e24a3d'); g.addColorStop(1, '#a52319');
    fillRR(c, 10, 8, 180, 148, 12, g);
    fillRR(c, 10, 92, 180, 30, 0, '#f3f3f3');
    fillRR(c, 24, 26, 152, 60, 8, '#16212b'); poly(c, [[24, 26], [60, 26], [40, 86], [24, 86]], 'rgba(255,255,255,.10)');
    fillRR(c, 62, 12, 76, 14, 3, '#ffb300'); c.fillStyle = '#222'; c.font = 'bold 11px ' + FONT; c.textAlign = 'center'; c.fillText('PUNE - GOA', 100, 23);
    fillRR(c, 16, 100, 20, 14, 4, '#ff2a2a'); fillRR(c, 164, 100, 20, 14, 4, '#ff2a2a');
    fillRR(c, 70, 128, 60, 14, 2, '#f2f2f2'); fillRR(c, 14, 148, 172, 10, 4, '#222');
  });
}
function coneSprite(make) {
  return mk(make, 48, 56, (c) => { groundShadow(c, 24, 52, 18); fillRR(c, 6, 46, 36, 7, 2, '#222'); poly(c, [[24, 4], [37, 46], [11, 46]], '#ff6a00'); poly(c, [[24, 16], [31, 34], [17, 34]], '#fff'); poly(c, [[24, 4], [28, 14], [20, 14]], '#ff6a00'); });
}
function barrelSprite(make) {
  return mk(make, 56, 64, (c) => { groundShadow(c, 28, 60, 22); fillRR(c, 8, 8, 40, 50, 6, '#d9382b'); fillRR(c, 8, 22, 40, 8, 0, '#f3f3f3'); fillRR(c, 8, 38, 40, 8, 0, '#f3f3f3'); fillRR(c, 6, 6, 44, 6, 3, '#9d241b'); });
}
function pickupSprite(make, type) {
  return mk(make, 72, 72, (c) => {
    const col = { cash: '#2fbf71', nitro: '#3b9bff', chain: '#cfd5df', bat: '#c88a4a', rod: '#b9c0ca', repair: '#ff5a5a' }[type];
    const rg = c.createRadialGradient(36, 36, 8, 36, 36, 34); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 0.55; c.fillStyle = rg; c.beginPath(); c.arc(36, 36, 34, 0, 7); c.fill(); c.globalAlpha = 1;
    ellipseFill(c, 36, 36, 24, 24, '#12151b'); c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.arc(36, 36, 24, 0, 7); c.stroke();
    c.lineCap = 'round';
    if (type === 'cash') { fillRR(c, 20, 26, 32, 20, 3, '#2fbf71'); c.fillStyle = '#0c3'; c.fillStyle = '#e9fff1'; c.font = 'bold 18px ' + FONT; c.textAlign = 'center'; c.fillText('\u20B9', 36, 42); }
    else if (type === 'nitro') { fillRR(c, 27, 22, 18, 28, 5, '#3b9bff'); fillRR(c, 31, 17, 10, 6, 2, '#cfe6ff'); poly(c, [[36, 56], [31, 48], [41, 48]], '#ff9d00'); }
    else if (type === 'chain') { c.strokeStyle = '#cfd5df'; c.lineWidth = 4; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(26 + i * 10, 36 + (i % 2 ? 4 : -4), 8, 5, 0.5, 0, 7); c.stroke(); } }
    else if (type === 'rod') { c.save(); c.translate(36, 36); c.rotate(0.7); fillRR(c, -2.5, -22, 5, 44, 2, '#b9c0ca'); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(-1, -20, 1.5, 40); c.restore(); }
    else if (type === 'bat') { c.save(); c.translate(36, 36); c.rotate(0.7); fillRR(c, -6, -22, 12, 12, 5, '#d79a58'); poly(c, [[-5, -14], [5, -14], [3, 20], [-3, 20]], '#c88a4a'); fillRR(c, -3.5, 18, 7, 6, 2, '#6b4423'); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-2, -18, 2, 30); c.restore(); }
    else { fillRR(c, 28, 20, 16, 32, 3, '#fff'); fillRR(c, 20, 28, 32, 16, 3, '#fff'); fillRR(c, 31, 23, 10, 26, 2, '#ff3b3b'); fillRR(c, 23, 31, 26, 10, 2, '#ff3b3b'); }
  });
}

/* ----- scenery ----- */
function palmSprite(make, leaf, v) {
  return mk(make, 128, 256, (c) => {
    groundShadow(c, 64, 252, 30);
    c.lineCap = 'round'; const bend = (v % 2 ? 1 : -1) * 10;
    c.strokeStyle = '#6d4724'; c.lineWidth = 12; c.beginPath(); c.moveTo(62, 252); c.quadraticCurveTo(62 + bend, 150, 66 + bend * 0.4, 66); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 2; for (let y = 236; y > 80; y -= 14) { c.beginPath(); c.moveTo(56 + (236 - y) * 0.03 * bend / 10, y); c.lineTo(70 + (236 - y) * 0.03 * bend / 10, y - 3); c.stroke(); }
    const tx = 66 + bend * 0.4, ty = 66;
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI + (i / 7) * Math.PI; const dx = Math.cos(a), dy = Math.sin(a);
      c.strokeStyle = i % 2 ? leaf : shade(leaf, -0.2); c.lineWidth = 7;
      c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + dx * 34, ty + dy * 40 - 8, tx + dx * 60, ty + dy * 18 + 26); c.stroke();
    }
    ellipseFill(c, tx - 5, ty + 8, 6, 6, '#4b2f12'); ellipseFill(c, tx + 6, ty + 10, 6, 6, '#4b2f12');
  });
}
function lampSprite(make) {
  return mk(make, 64, 256, (c) => {
    groundShadow(c, 32, 252, 14);
    c.fillStyle = '#7d8590'; c.fillRect(30, 40, 6, 214); c.fillStyle = '#a2abb6'; c.fillRect(30, 40, 2, 214);
    c.strokeStyle = '#7d8590'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(33, 44); c.quadraticCurveTo(30, 28, 10, 30); c.stroke();
    const rg = c.createRadialGradient(10, 36, 1, 10, 36, 20); rg.addColorStop(0, 'rgba(255,238,170,.9)'); rg.addColorStop(1, 'rgba(255,238,170,0)'); c.fillStyle = rg; c.beginPath(); c.arc(10, 36, 20, 0, 7); c.fill();
    fillRR(c, 0, 28, 20, 8, 3, '#e8eaee'); fillRR(c, 2, 34, 16, 4, 2, '#ffe28a');
  });
}
function billboardSprite(make, pal, v) {
  const ads = [['CHAI', '\u20B95 ONLY'], ['FRESH', 'JUICE'], ['TARMAC', 'RIOT'], ['RIDE', 'SAFE?'], ['BIG', 'SALE 50%'], ['HORN', 'PLEASE']];
  const cols = ['#e63946', '#2a9d8f', '#f4a261', '#3a86ff', '#8338ec', '#ffbe0b'];
  return mk(make, 192, 200, (c) => {
    groundShadow(c, 96, 196, 70);
    fillRR(c, 44, 110, 10, 88, 2, '#5a4a3a'); fillRR(c, 138, 110, 10, 88, 2, '#5a4a3a');
    fillRR(c, 6, 16, 180, 102, 6, '#2a2a30'); const col = cols[v % 6]; fillRR(c, 12, 22, 168, 90, 4, col);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = 'italic 900 40px ' + FONT; c.fillText(ads[v % 6][0], 96, 64);
    c.font = 'italic 900 28px ' + FONT; c.fillStyle = 'rgba(255,255,255,.92)'; c.fillText(ads[v % 6][1], 96, 98);
  });
}
function buildingSprite(make, v, rnd) {
  const cols = ['#c9a98b', '#b9bdc7', '#d6c7a1', '#9fb4a8', '#c98f85'];
  return mk(make, 192, 256, (c) => {
    const h = 150 + Math.floor(rnd() * 100), col = cols[v % cols.length], x = 20, w = 152, top = 256 - h;
    groundShadow(c, 96, 253, 80);
    const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, shade(col, 0.1)); g.addColorStop(1, shade(col, -0.2));
    c.fillStyle = g; c.fillRect(x, top, w, h); fillRR(c, x - 4, top - 6, w + 8, 10, 2, shade(col, -0.3));
    for (let yy = top + 14; yy < 236; yy += 26) for (let xx = x + 12; xx < x + w - 18; xx += 28) {
      const lit = rnd() < 0.35; fillRR(c, xx, yy, 16, 16, 2, lit ? '#ffd98a' : '#35404d');
      if (rnd() < 0.3) fillRR(c, xx - 2, yy + 14, 20, 5, 1, '#59616d');
    }
    fillRR(c, x + 60, 226, 32, 30, 2, '#2a2f38');
  });
}
function rockSprite(make, snow, v) {
  return mk(make, 128, 96, (c) => {
    groundShadow(c, 64, 92, 52);
    const base = ['#8d9098', '#7e8189', '#9a9da4', '#85888f'][v % 4];
    poly(c, [[6, 90], [16, 44], [42, 14], [74, 8], [104, 30], [122, 90]], base);
    poly(c, [[42, 14], [74, 8], [104, 30], [84, 44], [52, 40]], shade(base, 0.2));
    poly(c, [[84, 44], [104, 30], [122, 90], [90, 90]], shade(base, -0.25));
    if (snow) poly(c, [[44, 15], [74, 8], [96, 24], [78, 30], [62, 24], [52, 32]], '#f4f8ff');
  });
}
function flagsSprite(make) {
  return mk(make, 96, 200, (c) => {
    groundShadow(c, 24, 196, 14);
    c.fillStyle = '#d9d2c6'; c.fillRect(20, 18, 6, 178);
    c.strokeStyle = '#444'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(24, 24); c.quadraticCurveTo(60, 48, 92, 30); c.stroke();
    const cols = ['#2f7bff', '#ffffff', '#e63946', '#2fbf71', '#ffd23f'];
    for (let i = 0; i < 5; i++) { const x = 30 + i * 12, y = 32 + Math.sin(i * 0.8) * 8 + i * 1.5; poly(c, [[x, y], [x + 11, y + 1], [x + 5, y + 20]], cols[i]); }
  });
}
function chortenSprite(make) {
  return mk(make, 96, 140, (c) => {
    groundShadow(c, 48, 136, 38);
    fillRR(c, 14, 112, 68, 22, 2, '#f1efe9'); fillRR(c, 22, 92, 52, 22, 2, '#e6e2d8');
    c.fillStyle = '#f7f5ef'; c.beginPath(); c.arc(48, 88, 28, Math.PI, 0); c.lineTo(76, 92); c.lineTo(20, 92); c.closePath(); c.fill();
    fillRR(c, 42, 40, 12, 28, 2, '#e1ddd2'); poly(c, [[48, 8], [56, 40], [40, 40]], '#e2b33a'); fillRR(c, 42, 74, 12, 18, 6, '#8b2e2e');
  });
}
function poleSprite(make) {
  return mk(make, 56, 200, (c) => {
    groundShadow(c, 28, 196, 12);
    c.fillStyle = '#6e5f50'; c.fillRect(25, 20, 6, 176); c.fillRect(8, 30, 40, 5); c.fillRect(12, 46, 32, 4);
    c.fillStyle = '#d9d9de'; for (const x of [10, 24, 40]) c.fillRect(x, 24, 5, 7);
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, 36); c.quadraticCurveTo(28, 52, 56, 36); c.stroke();
  });
}
function cactusSprite(make, v) {
  return mk(make, 96, 190, (c) => {
    groundShadow(c, 48, 186, 26);
    const g = '#3f8f4a', d = '#2d6e38';
    fillRR(c, 36, 30, 24, 156, 12, g); fillRR(c, 50, 30, 10, 156, 5, d);
    fillRR(c, 10, 82, 14, 52, 7, g); fillRR(c, 10, 120, 40, 14, 7, g);
    fillRR(c, 72, 60, 14, 62, 7, g); fillRR(c, 48, 108, 38, 14, 7, g);
    c.fillStyle = 'rgba(255,255,255,.35)'; for (let y = 50; y < 180; y += 18) c.fillRect(46 + (y % 3), y, 3, 2);
  });
}
function fortSprite(make) {
  return mk(make, 200, 150, (c) => {
    groundShadow(c, 100, 146, 92);
    const sand = '#d9b07a'; fillRR(c, 8, 50, 184, 96, 2, sand); fillRR(c, 8, 50, 184, 10, 0, shade(sand, -0.15));
    for (let x = 8; x < 192; x += 20) fillRR(c, x, 34, 12, 20, 1, sand);
    fillRR(c, 76, 14, 48, 132, 2, shade(sand, 0.08)); for (let x = 76; x < 124; x += 16) fillRR(c, x, 2, 10, 16, 1, sand);
    c.fillStyle = '#4b2f1a'; c.beginPath(); c.moveTo(88, 146); c.lineTo(88, 106); c.arc(100, 106, 12, Math.PI, 0); c.lineTo(112, 146); c.closePath(); c.fill();
    for (const x of [24, 50, 140, 166]) fillRR(c, x, 78, 10, 18, 4, '#5a3b22');
  });
}
function bushSprite(make, dry, v) {
  return mk(make, 128, 84, (c) => {
    groundShadow(c, 64, 80, 52);
    const a = dry ? ['#a8884a', '#8f7339', '#b89a5a'] : ['#2e8b57', '#237a49', '#3da56a'];
    ellipseFill(c, 36, 54, 32, 26, a[1]); ellipseFill(c, 90, 56, 34, 24, a[1]); ellipseFill(c, 64, 42, 40, 32, a[0]); ellipseFill(c, 52, 34, 20, 14, a[2]);
  });
}
function houseSprite(make, v) {
  const walls = ['#f3ead7', '#f8d7da', '#d6ecf2', '#fff2c2'];
  return mk(make, 160, 130, (c) => {
    groundShadow(c, 80, 126, 70);
    fillRR(c, 16, 54, 128, 70, 2, walls[v % 4]); poly(c, [[6, 58], [80, 8], [154, 58]], '#b5482f'); poly(c, [[6, 58], [80, 8], [80, 20], [20, 58]], 'rgba(255,255,255,.12)');
    fillRR(c, 66, 82, 28, 42, 2, '#5a3b22'); fillRR(c, 28, 74, 24, 24, 2, '#6aa6c9'); fillRR(c, 108, 74, 24, 24, 2, '#6aa6c9');
    ellipseFill(c, 14, 118, 12, 10, '#2e8b57'); ellipseFill(c, 148, 118, 12, 10, '#2e8b57');
  });
}
function markerSprite(make) {
  return mk(make, 48, 72, (c) => { groundShadow(c, 24, 68, 14); fillRR(c, 10, 14, 28, 52, 6, '#f4f4f4'); poly(c, [[10, 24], [24, 8], [38, 24]], '#f4f4f4'); fillRR(c, 10, 14, 28, 14, 0, '#f2b705'); c.fillStyle = '#222'; c.font = 'bold 10px ' + FONT; c.textAlign = 'center'; c.fillText('KM', 24, 44); });
}

function buildSprites(make, def, rnd) {
  const pal = def.pal, leaf = def.id === 'kerala' ? '#2f9e57' : '#3fae5a';
  const S = { car: [], rick: null, truck: [], bus: null, scenery: {}, pick: {} };
  const colors = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22', '#34495e'];
  S.carFor = (color) => { if (!S.car[color]) S.car[color] = carSprite(make, color); return S.car[color]; };
  S.rick = rickSprite(make);
  S.bus = busSprite(make);
  S.truckFor = (color, v) => { const k = color + v; if (!S.truck[k]) S.truck[k] = truckSprite(make, color, v); return S.truck[k]; };
  S.cone = coneSprite(make); S.barrel = barrelSprite(make);
  for (const t of ['cash', 'nitro', 'chain', 'bat', 'rod', 'repair']) S.pick[t] = pickupSprite(make, t);
  const sc = S.scenery;
  for (const t of pal.scenery) {
    sc[t] = [];
    for (let v = 0; v < 4; v++) {
      if (t === 'palm') sc[t].push(palmSprite(make, leaf, v));
      else if (t === 'coconut') sc[t].push(palmSprite(make, '#4aa84a', v));
      else if (t === 'lamp') sc[t].push(lampSprite(make));
      else if (t === 'billboard') sc[t].push(billboardSprite(make, pal, v));
      else if (t === 'building') sc[t].push(buildingSprite(make, v, rnd));
      else if (t === 'rock') sc[t].push(rockSprite(make, def.id === 'ladakh', v));
      else if (t === 'flags') sc[t].push(flagsSprite(make));
      else if (t === 'chorten') sc[t].push(chortenSprite(make));
      else if (t === 'pole') sc[t].push(poleSprite(make));
      else if (t === 'cactus') sc[t].push(cactusSprite(make, v));
      else if (t === 'fort') sc[t].push(fortSprite(make));
      else if (t === 'bush') sc[t].push(bushSprite(make, pal.dry, v));
      else if (t === 'house') sc[t].push(houseSprite(make, v));
      else if (t === 'marker') sc[t].push(markerSprite(make));
      if (t === 'lamp' || t === 'flags' || t === 'chorten' || t === 'pole' || t === 'fort' || t === 'marker') { sc[t].length = 1; break; }
    }
  }
  return S;
}
// world width (in road half-widths) of every sprite
const SPRITE_W = { palm: 1.1, coconut: 1.1, lamp: 0.28, billboard: 1.5, building: 2.6, rock: 0.95, flags: 0.55, chorten: 0.75, pole: 0.22, cactus: 0.7, fort: 2.6, bush: 0.95, house: 1.7, marker: 0.2,
  cone: 0.15, barrel: 0.18, pick: 0.26, rick: 0.34, car: 0.38, truck: 0.5, bus: 0.52, rider: 0.23 };

/* ----- parallax backdrops ----- */
function buildBackdrop(make, def, W, H, rnd) {
  const pal = def.pal, LW = Math.max(1800, W * 2), LH = 190;
  const sky = mk(make, W, H, (c) => {
    const hz = H * 0.5;
    const g = c.createLinearGradient(0, 0, 0, hz + 6); g.addColorStop(0, pal.skyTop); g.addColorStop(0.55, pal.skyMid); g.addColorStop(1, pal.skyBot);
    c.fillStyle = g; c.fillRect(0, 0, W, hz + 6);
    c.fillStyle = pal.ground; c.fillRect(0, hz, W, H - hz);
    const sx = pal.sunX * W, sy = pal.sunY * H;
    const glow = c.createRadialGradient(sx, sy, 4, sx, sy, H * 0.42); glow.addColorStop(0, 'rgba(255,240,200,.75)'); glow.addColorStop(0.25, 'rgba(255,200,140,.28)'); glow.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = glow; c.fillRect(0, 0, W, hz + 6);
    c.fillStyle = pal.sun; c.beginPath(); c.arc(sx, sy, H * 0.05, 0, 7); c.fill();
    // soft clouds
    c.fillStyle = 'rgba(255,255,255,.16)';
    for (let i = 0; i < 9; i++) { const cx = rnd() * W, cy = H * (0.08 + rnd() * 0.22); for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(cx + k * 26, cy + (k % 2) * 6, 46, 12, 0, 0, 7); c.fill(); } }
  });
  const wrapDraw = (c, fn) => { fn(c, 0); fn(c, -LW); };
  const far = mk(make, LW, LH, (c) => {
    if (def.bg === 'city') {
      wrapDraw(c, (cc, off) => { let x = 0; const r = makeRng(7); while (x < LW) { const w = 22 + r() * 40, h = 40 + r() * 100; cc.fillStyle = pal.far; cc.fillRect(x + off, LH - h, w, h); if (r() < 0.2) cc.fillRect(x + off + w / 2 - 1, LH - h - 24, 2, 24); cc.fillStyle = 'rgba(255,214,150,.55)'; for (let yy = LH - h + 8; yy < LH - 6; yy += 12) for (let xx = x + 4; xx < x + w - 6; xx += 9) if (r() < 0.3) cc.fillRect(xx + off, yy, 3, 4); x += w + 2 + r() * 10; } });
    } else if (def.bg === 'mountains') {
      wrapDraw(c, (cc, off) => { const r = makeRng(11); let x = -40; while (x < LW + 40) { const w = 120 + r() * 160, h = 70 + r() * 100; cc.fillStyle = pal.far; cc.beginPath(); cc.moveTo(x + off, LH); cc.lineTo(x + w / 2 + off, LH - h); cc.lineTo(x + w + off, LH); cc.closePath(); cc.fill(); cc.fillStyle = '#f2f7ff'; cc.beginPath(); cc.moveTo(x + w / 2 + off, LH - h); cc.lineTo(x + w / 2 - w * 0.12 + off, LH - h + h * 0.28); cc.lineTo(x + w / 2 - w * 0.03 + off, LH - h + h * 0.2); cc.lineTo(x + w / 2 + w * 0.05 + off, LH - h + h * 0.3); cc.lineTo(x + w / 2 + w * 0.12 + off, LH - h + h * 0.26); cc.closePath(); cc.fill(); x += w * 0.7; } });
    } else if (def.bg === 'dunes') {
      wrapDraw(c, (cc, off) => { cc.fillStyle = pal.far; cc.beginPath(); cc.moveTo(off, LH); for (let x = 0; x <= LW; x += 20) cc.lineTo(x + off, LH - 40 - Math.sin(x / 150) * 18 - Math.sin(x / 61) * 8); cc.lineTo(LW + off, LH); cc.closePath(); cc.fill();
        cc.fillStyle = shade(pal.far, -0.2); const fx = LW * 0.62 + off; cc.fillRect(fx, LH - 96, 120, 60); for (let i = 0; i < 6; i++) cc.fillRect(fx + i * 22, LH - 108, 12, 14); cc.fillRect(fx + 44, LH - 130, 30, 40); });
    } else {
      wrapDraw(c, (cc, off) => { cc.fillStyle = pal.far; cc.beginPath(); cc.moveTo(off, LH); for (let x = 0; x <= LW; x += 20) cc.lineTo(x + off, LH - 60 - Math.sin(x / 130) * 26 - Math.sin(x / 47) * 9); cc.lineTo(LW + off, LH); cc.closePath(); cc.fill(); });
    }
  });
  const mid = mk(make, LW, LH, (c) => {
    if (def.bg === 'city') {
      wrapDraw(c, (cc, off) => { const r = makeRng(21); let x = 0; while (x < LW) { const w = 30 + r() * 50, h = 20 + r() * 50; cc.fillStyle = pal.mid; cc.fillRect(x + off, LH - h, w, h); x += w + r() * 6; } });
    } else if (def.bg === 'mountains') {
      wrapDraw(c, (cc, off) => { cc.fillStyle = pal.mid; cc.beginPath(); cc.moveTo(off, LH); for (let x = 0; x <= LW; x += 16) cc.lineTo(x + off, LH - 34 - Math.abs(Math.sin(x / 90)) * 40 - Math.sin(x / 23) * 6); cc.lineTo(LW + off, LH); cc.closePath(); cc.fill(); });
    } else if (def.bg === 'dunes') {
      wrapDraw(c, (cc, off) => { cc.fillStyle = pal.mid; cc.beginPath(); cc.moveTo(off, LH); for (let x = 0; x <= LW; x += 20) cc.lineTo(x + off, LH - 22 - Math.sin(x / 110 + 1) * 16); cc.lineTo(LW + off, LH); cc.closePath(); cc.fill(); });
    } else {
      wrapDraw(c, (cc, off) => { cc.fillStyle = pal.mid; cc.beginPath(); cc.moveTo(off, LH); for (let x = 0; x <= LW; x += 16) cc.lineTo(x + off, LH - 30 - Math.sin(x / 80) * 16); cc.lineTo(LW + off, LH); cc.closePath(); cc.fill();
        const r = makeRng(5); for (let i = 0; i < 40; i++) { const x = r() * LW, y = LH - 32 - Math.sin(x / 80) * 16; cc.strokeStyle = '#1c2a22'; cc.lineWidth = 2; cc.beginPath(); cc.moveTo(x + off, y); cc.lineTo(x + off + 2, y - 16); cc.stroke(); cc.fillStyle = '#1c2a22'; cc.beginPath(); cc.ellipse(x + off + 2, y - 17, 9, 4, 0, 0, 7); cc.fill(); } });
    }
  });
  return { sky: sky, far: far, mid: mid, LW: LW, LH: LH };
}
