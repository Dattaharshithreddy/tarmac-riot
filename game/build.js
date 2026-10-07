const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'src');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
let body = files.map((f) => '/* ===== ' + f + ' ===== */\n' + fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const out = "(function (root) {\n'use strict';\n" + body + "\n})(typeof window !== 'undefined' ? window : globalThis);\n";
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'game.js'), out);
console.log('built dist/game.js', out.length, 'bytes from', files.length, 'files');
const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
// three.js r149 + GLTFLoader + SkeletonUtils (see vendor-entry notes in README)
const threeSrc = fs.readFileSync(path.join(__dirname, 'vendor', 'three.bundle.min.js'), 'utf8');
// Blender-made models, embedded so the game works offline inside the app
const adir = path.join(__dirname, 'assets'), glb = {};
for (const f of fs.readdirSync(adir).filter((f) => f.endsWith('.glb')).sort()) glb[f.replace('.glb', '')] = fs.readFileSync(path.join(adir, f)).toString('base64');
const glbSrc = '\nwindow.__TR_GLB__=' + JSON.stringify(glb) + ';\n';
const html = tpl.replace('/*THREE*/', () => threeSrc + glbSrc).replace('/*GAME*/', () => out);
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
console.log('built dist/index.html', html.length, 'bytes');
