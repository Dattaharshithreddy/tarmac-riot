// Compress Blender exports for the game: weld/dedup, quantize geometry, WebP textures (max 1024 px).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { dedup, prune, weld, textureCompress, meshopt } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
const [inDir, outDir, only] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.mkdirSync(outDir, { recursive: true });
let a = 0, b = 0;
for (const f of fs.readdirSync(inDir).filter((x) => x.endsWith('.glb') && (!only || only.split(',').includes(x.replace('.glb', ''))))) {
  const doc = await io.read(inDir + '/' + f);
  const lo = /_lo|auto|bus|truck|sedan|hatch|suv|taxi/.test(f);
  await doc.transform(dedup(), weld(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: lo ? [512, 512] : [1024, 1024] }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = await io.writeBinary(doc); fs.writeFileSync(outDir + '/' + f, out);
  const s0 = fs.statSync(inDir + '/' + f).size; a += s0; b += out.length;
  console.log(f.padEnd(20), (s0 / 1024).toFixed(0) + 'K ->', (out.length / 1024).toFixed(0) + 'K');
}
console.log('total', (a / 1024).toFixed(0) + 'K ->', (b / 1024).toFixed(0) + 'K');
