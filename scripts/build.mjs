import { readFile, writeFile, mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';

await import('./copy-fonts.mjs');
await import('./import-assets.mjs');
const scene = JSON.parse(await readFile('public/scene.json', 'utf8'));
const imageVersion = JSON.parse(await readFile('image-version.json', 'utf8'));
if (!/^[a-f0-9]{40}$/.test(imageVersion.commit)) throw new Error('Image source must be pinned to a full Git commit');
const html = await readFile('public/index.html', 'utf8');
const pageAssets = [...html.matchAll(/(?:src|href)="(assets\/[^"?]+)(?:\?[^\"]*)?"/g)].map((match) => match[1]);
const required = new Set([...scene.map((layer) => layer.src), ...pageAssets]);
let missing = false;
for (const path of required) {
  try { if (!(await stat(`public/${path}`)).size) missing = true; } catch { missing = true; }
}
if (missing) await import('./download-assets.mjs');

const files = {};
const remoteImages = {};
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
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
      const metadata = await sharp(bytes).metadata();
      if (!metadata.width || !metadata.height) throw new Error(`Invalid image: ${path}`);
      // Keep original pixels. Workers caches the immutable, commit-pinned image.
      remoteImages[`/${relative}`] = `https://raw.githubusercontent.com/yoshio-1126/JET/${imageVersion.commit}/public/${relative}`;
      continue;
    }
    if (!bytes.length || !contentType) throw new Error(`Unsupported or empty asset: ${path}`);
    files[`/${relative}`] = [contentType, bytes.toString('base64')];
  }
}
await collect('public');
for (const path of required) if (!files[`/${path}`] && !remoteImages[`/${path}`]) throw new Error(`Missing design asset: ${path}`);

const worker = (await readFile('worker.js', 'utf8')).replace('export default {', 'const protectedWorker = {');
const source = `${worker}\nconst files = ${JSON.stringify(files)};\nconst remoteImages = ${JSON.stringify(remoteImages)};\nexport default { async fetch(request, env) { return protectedWorker.fetch(request, { ...env, ASSETS: { async fetch(request) { const path = new URL(request.url).pathname; if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}}); if (remoteImages[path]) { const upstream = await fetch(remoteImages[path], {method:request.method,cf:{cacheEverything:true,cacheTtl:31536000}}); if (!upstream.ok) return new Response('Image unavailable', {status:502,headers:{'Cache-Control':'no-store'}}); return new Response(upstream.body,{headers:{'Content-Type':'image/png'}}); } const file = files[path === '/' ? '/index.html' : path]; if (!file) return new Response('Not found', {status:404}); const bytes = Uint8Array.from(atob(file[1]), c => c.charCodeAt(0)); return new Response(request.method === 'HEAD' ? null : bytes, {headers:{'Content-Type':file[0]}}); } } }); } };\n`;
const compressedSize = gzipSync(source).length;
if (compressedSize > 10 * 1024 * 1024) throw new Error(`Worker exceeds 10 MiB compressed: ${compressedSize}`);
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await writeFile('dist/server/index.js', source);
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log(`Built authenticated Worker: ${Object.keys(files).length} bundled files, ${Object.keys(remoteImages).length} original images, ${(compressedSize / 1024 / 1024).toFixed(2)} MiB compressed.`);
