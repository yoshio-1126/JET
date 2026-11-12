import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const projectDirectory = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
let localValues = {};
try {
  localValues = parseEnv(await readFile(new URL('../.dev.vars', import.meta.url), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const username = process.env.BASIC_AUTH_USER || localValues.BASIC_AUTH_USER;
const password = process.env.BASIC_AUTH_PASSWORD || localValues.BASIC_AUTH_PASSWORD;
if (!username || !password) {
  throw new Error('Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD in the ignored .dev.vars file or environment before publishing.');
}

function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], {
      cwd: projectDirectory,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: [input ? 'pipe' : 'inherit', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    if (input) child.stdin.end(input);
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`Wrangler ${args[0]} exited with status ${code}.`)));
  });
}

// Missing production secrets return 503, so the first deployment cannot expose content.
const output = await run(['deploy']);
const matches = [...output.matchAll(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\b/g)];
const url = matches.at(-1)?.[0];
if (!url) throw new Error('Deployment did not return a workers.dev URL. Inspect Wrangler output before continuing.');
await run(['secret', 'bulk'], JSON.stringify({ BASIC_AUTH_USER: username, BASIC_AUTH_PASSWORD: password }));

const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
async function check(path, authenticated) {
  const response = await fetch(new URL(path, url), {
    method: 'HEAD', redirect: 'manual',
    headers: authenticated ? { Authorization: authorization } : {},
    signal: AbortSignal.timeout(15000),
  });
  const expected = authenticated ? 200 : 401;
  if (response.status !== expected) throw new Error(`${path}: expected HTTP ${expected}, got ${response.status}.`);
  if (!authenticated && !/^Basic\s/i.test(response.headers.get('WWW-Authenticate') || '')) {
    throw new Error(`${path}: Basic authentication challenge is missing.`);
  }
}
let lastError;
for (let attempt = 0; attempt < 5; attempt++) {
  try {
    for (const path of ['/', '/app.js', '/assets/interior-work.jpg', '/assets/02interior5.png']) {
      await check(path, false);
      await check(path, true);
    }
    console.log(`Verified: HTML, scripts and images require Basic authentication.\nPublic URL: ${url}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
throw new Error(`The Worker was deployed to ${url}, but verification needs attention: ${lastError.message}`);
