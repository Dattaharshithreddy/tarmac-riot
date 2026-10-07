// Render real in-game frames of Tarmac Riot in Node (headless-gl), using the same code as the app.
require('/home/claude/gltool/three.node.cjs'); const THREE = globalThis.THREE;
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('/home/claude/t3d/node_modules/@napi-rs/canvas');
const GAME = '/home/claude/tarmac-app/game';
const TR = require(GAME + '/dist/game.js');
const W = +(process.env.W || 960), H = +(process.env.H || 540);
const gl = require('/home/claude/t3d/node_modules/gl')(W, H, { preserveDrawingBuffer: true, antialias: true });
const canvas = { width: W, height: H, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => gl };
const r = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
r.setPixelRatio(1); TR.configureGL(r); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.setSize = function (w, h) { /* fixed size */ };
const toTex = (cv) => {
  const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(d.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; return t;
};
const texPlugin = (parser) => ({ name: 'node_textures', loadTexture: async (ti) => {
  const json = parser.json, tdef = json.textures[ti], srcI = tdef.source !== undefined ? tdef.source : (tdef.extensions && tdef.extensions.EXT_texture_webp ? tdef.extensions.EXT_texture_webp.source : 0), img = json.images[srcI];
  const bv = await parser.getDependency('bufferView', img.bufferView);
  const im = await loadImage(Buffer.from(bv));
  const c = createCanvas(im.width, im.height), cx = c.getContext('2d'); cx.drawImage(im, 0, 0);
  const d = cx.getImageData(0, 0, im.width, im.height);
  const tex = new THREE.DataTexture(new Uint8Array(d.data), im.width, im.height, THREE.RGBAFormat);
  tex.flipY = false; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  const s = tdef.sampler !== undefined ? json.samplers[tdef.sampler] : {}; tex.wrapS = s.wrapS || THREE.RepeatWrapping; tex.wrapT = s.wrapT || THREE.RepeatWrapping;
  return tex; } });
const glb = {}; for (const f of fs.readdirSync(GAME + '/assets')) if (f.endsWith('.glb')) glb[f.slice(0, -4)] = fs.readFileSync(GAME + '/assets/' + f).toString('base64');
const quality = process.env.Q === '0' ? 0 : 1;
const env = { makeCanvas: (w, h) => createCanvas(w, h), quality, gl3: r, aniso: 4, tex: toTex, gltfPlugins: [texPlugin], glb: process.env.NOGLB ? null : glb };
function snap(rd, R, file) {
  const ov = createCanvas(W, H), ctx = ov.getContext('2d');
  rd.draw(ctx, R, { hud: true });
  const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const c = createCanvas(W, H), x = c.getContext('2d'), img = x.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  x.putImageData(img, 0, 0); x.drawImage(ov, 0, 0); fs.writeFileSync(file, c.toBuffer('image/png'));
}
const step = (R, input, secs, rd) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { TR.autopilot(R, input); TR.stepRace(R, 1 / 60, input); R.events.length = 0; if (rd && i % 2 === 0) rd.draw(createCanvas(4, 4).getContext('2d'), R, { hud: false }); } };
const scenes = (process.env.SCENES || 'tracks').split(',');
TR.loadAssets(env, (ok) => {
  console.log('assets', ok, Object.keys(TR.ASSETS.gltf).length);
  const outDir = process.env.OUT || '/home/claude/gltool/t/out';
  const input = { left: false, right: false, brake: false, nitro: false, punchL: false, punchR: false };
  for (const sc of scenes) {
    if (sc === 'tracks') for (let ti = 0; ti < TR.TRACKS.length; ti++) {
      const save = TR.DEFAULT_SAVE(); const R = TR.createRace(save, ti, { seed: 7 });
      step(R, input, +(process.env.T || 14));
      const t0 = Date.now(); const rd = TR.createRenderer3D(env, R, W, H); const t1 = Date.now();
      rd.draw(createCanvas(4, 4).getContext('2d'), R, {}); snap(rd, R, outDir + '/track' + ti + '.png');
      console.log('track', ti, 'build ms', t1 - t0, 'render ms', Date.now() - t1); rd.dispose();
    }
    if (sc === 'fight' || sc === 'crash' || sc === 'cops') {
      const save = TR.DEFAULT_SAVE(); const R = TR.createRace(save, +(process.env.TI || 0), { seed: 3 });
      step(R, input, 10); const rd = TR.createRenderer3D(env, R, W, H); const p = R.player;
      const rv = R.rivals.slice().sort((a, b) => Math.abs(a.z - p.z) - Math.abs(b.z - p.z));
      const place = (o, dz, dx) => { o.z = p.z + dz; o.x = p.x + dx; o.speed = p.speed; o.state = 'ride'; o.tx = o.x; };
      // keep rivals beside the player, no autopilot attacks
      const hold = (secs, fn) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { if (fn) fn(); R.time += 1 / 60; rd.draw(createCanvas(4, 4).getContext('2d'), R, { hud: false }); } };
      if (sc === 'fight') {
        place(rv[0], 260, 0.45); place(rv[1], 500, -0.5); rv[1].weapon = { type: 'bat', uses: 9 };
        hold(0.3);
        p.punchT = 0; p.punchSide = 1; rv[1].atkT = 0; rv[1].atkSide = 1;
        const tick = () => { p.punchT += 1 / 60; rv[1].atkT += 1 / 60; };
        hold(0.18, tick); snap(rd, R, outDir + '/fight1.png');
        hold(0.12, tick); snap(rd, R, outDir + '/fight2.png');
        rv[0].hitN = 1; rv[0].hitSide = -1; hold(0.15); snap(rd, R, outDir + '/fight3.png');
      }
      if (sc === 'crash') {
        place(rv[0], 600, 0.3); rv[0].state = 'wipe'; rv[0].wipeT = 0; hold(0.02);
        for (const t of [0.25, 0.5, 0.9, 1.6]) { const n = Math.round((t - rv[0].wipeT) * 60); for (let i = 0; i < n; i++) { rv[0].wipeT += 1 / 60; R.time += 1 / 60; rd.draw(createCanvas(4, 4).getContext('2d'), R, { hud: false }); } snap(rd, R, outDir + '/crash_' + t + '.png'); }
      }
      if (sc === 'cops') {
        R.heat = 100; for (let i = 0; i < 400 && !R.cops.length; i++) { TR.autopilot(R, input); TR.stepRace(R, 1 / 60, input); R.events.length = 0; }
        for (const c of R.cops) place(c, 300, 0.45);
        hold(0.3); snap(rd, R, outDir + '/cops.png'); console.log('cops', R.cops.length);
      }
      rd.dispose();
    }
  }
  process.exit(0);
});
