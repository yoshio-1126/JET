import { readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const manifest = JSON.parse(await readFile(new URL('./figma-assets.json', import.meta.url), 'utf8'));
await mkdir('public/assets', { recursive: true });
const queue = Object.values(manifest);
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const { path, source } = queue.shift();
    try { if ((await stat(`public/${path}`)).size > 0) continue; } catch {}
    await new Promise((resolve, reject) => {
      const child = spawn('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '60', '--output', `public/${path}`, source], { stdio: ['ignore', 'ignore', 'pipe'] });
      let error = '';
      child.stderr.on('data', (chunk) => { error += chunk; });
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path}: ${error}`)));
      child.on('error', reject);
    }).catch(async (error) => {
      if (error.code !== 'ENOENT') throw error;
      // The hosted builder has Node but no curl executable.
      let response = await fetch(source, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      let bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length && /\.(png|svg)$/.test(source)) {
        response = await fetch(source.replace(/\.(png|svg)$/, ''), { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        bytes = new Uint8Array(await response.arrayBuffer());
      }
      if (!bytes.length) throw new Error(`${path}: empty HTTP ${response.status} response; type=${response.headers.get('content-type')}; length=${response.headers.get('content-length')}`);
      await writeFile(`public/${path}`, bytes);
    });
    console.log(`Downloaded ${path} (${(await stat(`public/${path}`)).size} bytes)`);
  }
}));
