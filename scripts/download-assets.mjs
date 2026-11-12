import { readFile, mkdir, stat } from 'node:fs/promises';
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
    });
    console.log(`Downloaded ${path}`);
  }
}));
