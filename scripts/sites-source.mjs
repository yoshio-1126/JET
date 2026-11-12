import { spawn } from 'node:child_process';
import readline from 'node:readline';

process.stdout.write('Ready for Site source credential on stdin.\n');
// Turn off terminal echo before credentials arrive. Nothing sensitive is persisted.
if (process.stdin.isTTY) await new Promise((resolve) => { const c = spawn('stty', ['-echo'], { stdio: 'inherit' }); c.on('close', resolve); });
const line = await new Promise((resolve) => readline.createInterface({ input: process.stdin }).once('line', resolve));
const credential = JSON.parse(line);
const env = { ...process.env };
if (credential.token) {
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'http.extraHeader';
  env.GIT_CONFIG_VALUE_0 = `Authorization: Bearer ${credential.token}`;
}
async function git(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', (chunk) => output += chunk);
    child.stderr.on('data', (chunk) => error += chunk);
    child.on('close', (code) => code ? reject(new Error(error)) : resolve(output.trim()));
  });
}
try {
  const sha = await git(['rev-parse', 'HEAD']);
  await git(['push', credential.remote_url, `HEAD:refs/heads/${credential.branch}`]);
  const remote = await git(['ls-remote', credential.remote_url, `refs/heads/${credential.branch}`]);
  if (!remote.startsWith(sha)) throw new Error('Pushed source verification failed');
  console.log(JSON.stringify({ commit_sha: sha, pushed: true }));
} finally {
  if (process.stdin.isTTY) await new Promise((resolve) => { const c = spawn('stty', ['echo'], { stdio: 'inherit' }); c.on('close', resolve); });
  process.exit();
}
