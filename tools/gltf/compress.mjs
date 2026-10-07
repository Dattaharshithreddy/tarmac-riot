import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, weld } from '@gltf-transform/functions';
import fs from 'fs';
const [inDir, outDir] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
fs.mkdirSync(outDir, { recursive: true });
let a = 0, b = 0;
for (const f of fs.readdirSync(inDir).filter((x) => x.endsWith('.glb'))) {
  const doc = await io.read(inDir + '/' + f);
  await doc.transform(dedup(), weld(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  const out = await io.writeBinary(doc); fs.writeFileSync(outDir + '/' + f, out);
  const s0 = fs.statSync(inDir + '/' + f).size; a += s0; b += out.length;
  console.log(f.padEnd(20), (s0 / 1024).toFixed(0) + 'K ->', (out.length / 1024).toFixed(0) + 'K');
}
console.log('total', (a / 1024).toFixed(0) + 'K ->', (b / 1024).toFixed(0) + 'K');
