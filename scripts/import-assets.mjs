import { readFile, readdir, copyFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

// Accept Figma export filenames as well as the implementation's short filenames.
const normalize = (name) => name.normalize('NFKC').toLowerCase().replace(/[\s_\-]/g, '');
const scene = JSON.parse(await readFile('public/scene.json', 'utf8'));
async function scan(directory) {
  const found = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    const path = join(directory, item.name);
    if (item.isDirectory()) found.push(...await scan(path));
    else found.push(path);
  }
  return found;
}
const files = await scan('public/assets');
const aliases = new Map();
for (const layer of scene) {
  if (!aliases.has(layer.src)) aliases.set(layer.src, new Set());
  aliases.get(layer.src).add(normalize(layer.name));
  aliases.get(layer.src).add(normalize(layer.name.replace(/ \d+$/, '')));
}
for (const [target, names] of aliases) {
  try { if ((await stat(`public/${target}`)).size) continue; } catch {}
  const match = files.find((path) => extname(path).toLowerCase() === extname(target) && names.has(normalize(basename(path, extname(path)))));
  if (match) {
    await copyFile(match, `public/${target}`);
    console.log(`Imported ${target}`);
  }
}
