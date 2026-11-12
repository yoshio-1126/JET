import { readFile, writeFile, mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';

await import('./copy-fonts.mjs');
await import('./import-assets.mjs');
const manifest = JSON.parse(await readFile('scripts/figma-assets.json', 'utf8'));
const scene = JSON.parse(await readFile('public/scene.json', 'utf8'));
const required = new Set([...scene.map((layer) => layer.src), 'assets/group45.svg']);
let missing = false;
for (const path of required) {
  try { if (!(await stat(`public/${path}`)).size) missing = true; } catch { missing = true; }
}
if (missing) await import('./download-assets.mjs');

const files = {};
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) { await collect(path, `${relative}/`); continue; }
    if (relative.startsWith('assets/') && !required.has(relative)) continue;
    let bytes = await readFile(path);
    let contentType = mime[extname(path)];
    if (!bytes.length) throw new Error(`Empty asset: ${path}`);
    if (extname(path) === '.png') {
      // Lossless encoding preserves every original Figma image pixel.
      const metadata = await sharp(bytes).metadata();
      if (!metadata.width || !metadata.height) throw new Error(`Invalid image: ${path}`);
      bytes = await sharp(bytes).webp({ lossless: true, effort: 6 }).toBuffer();
      contentType = 'image/webp';
    }
    if (!bytes.length || !contentType) throw new Error(`Unsupported or empty asset: ${path}`);
    files[`/${relative}`] = [contentType, bytes.toString('base64')];
  }
}
await collect('public');
for (const path of required) if (!files[`/${path}`]) throw new Error(`Missing design asset: ${path}`);

const worker = (await readFile('worker.js', 'utf8')).replace('export default {', 'const protectedWorker = {');
const source = `${worker}\nconst files = ${JSON.stringify(files)};\nexport default { async fetch(request, env) { return protectedWorker.fetch(request, { ...env, ASSETS: { async fetch(request) { const path = new URL(request.url).pathname; const file = files[path === '/' ? '/index.html' : path]; if (!file) return new Response('Not found', {status:404}); const bytes = Uint8Array.from(atob(file[1]), c => c.charCodeAt(0)); return new Response(request.method === 'HEAD' ? null : bytes, {headers:{'Content-Type':file[0]}}); } } }); } };\n`;
const compressedSize = gzipSync(source).length;
if (compressedSize > 10 * 1024 * 1024) throw new Error(`Worker exceeds 10 MiB compressed: ${compressedSize}`);
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await writeFile('dist/server/index.js', source);
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log(`Built authenticated Worker: ${Object.keys(files).length} files, ${(compressedSize / 1024 / 1024).toFixed(2)} MiB compressed.`);
