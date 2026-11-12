import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = new URL('../public/fonts/', import.meta.url);
await mkdir(new URL('files/', directory), { recursive: true });
const text = await readFile(new URL('../public/index.html', import.meta.url), 'utf8') + await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const points = new Set([...text].map((character) => character.codePointAt(0)));
const source = 'node_modules/@fontsource-variable/noto-sans-jp';
const css = await readFile(join(source, 'index.css'), 'utf8');
const faces = css.match(/@font-face\s*\{[^}]+\}/g).filter((face) => {
  const ranges = face.match(/unicode-range:\s*([^;]+)/)[1].split(',');
  return ranges.some((range) => {
    const [a, b] = range.trim().replace('U+', '').split('-').map((part) => parseInt(part, 16));
    return [...points].some((point) => point >= a && point <= (b ?? a));
  });
});
for (const face of faces) {
  const filename = face.match(/url\(\.\/files\/([^)]+)\)/)[1];
  await copyFile(join(source, 'files', filename), new URL(`files/${filename}`, directory));
}
await writeFile(new URL('noto-sans-jp.css', directory), faces.join('\n'));
const reddit = 'reddit-sans-latin-500-normal.woff2';
await copyFile(`node_modules/@fontsource/reddit-sans/files/${reddit}`, new URL(`files/${reddit}`, directory));
await writeFile(new URL('reddit-sans.css', directory), `@font-face {font-family:"Reddit Sans";font-style:normal;font-display:swap;font-weight:500;src:url(./files/${reddit}) format("woff2");}\n`);
await copyFile(join(source, 'LICENSE'), new URL('LICENSE-noto-sans-jp.txt', directory));
await copyFile('node_modules/@fontsource/reddit-sans/LICENSE', new URL('LICENSE-reddit-sans.txt', directory));
console.log(`Copied ${faces.length + 1} local font subsets.`);
