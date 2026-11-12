import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const credential = (value) => `Basic ${btoa(value)}`;
function environment(overrides = {}) {
  let requests = 0;
  return {
    BASIC_AUTH_USER: 'MON', BASIC_AUTH_PASSWORD: 'JET',
    ASSETS: { fetch: async () => { requests++; return new Response('protected asset'); } },
    get requests() { return requests; }, ...overrides,
  };
}

test('HTML, images and scripts all require Basic authentication before asset access', async () => {
  const env = environment();
  for (const path of ['/', '/assets/02interior5.png', '/app.js', '/scene.json']) {
    for (const auth of [undefined, 'Bearer abc', 'Basic !!!!', credential('MON:wrong'), credential('mon:JET'), credential('MONJET')]) {
      const response = await worker.fetch(new Request(`https://jet.example${path}`, { headers: auth ? { Authorization: auth } : {} }), env);
      assert.equal(response.status, 401);
      assert.match(response.headers.get('WWW-Authenticate'), /^Basic /);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
  assert.equal(env.requests, 0);
});

test('valid credentials serve the requested asset with private caching', async () => {
  const env = environment();
  const response = await worker.fetch(new Request('https://jet.example/assets/02interior5.png', { headers: { Authorization: credential('MON:JET') } }), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'protected asset');
  assert.equal(env.requests, 1);
  assert.equal(response.headers.get('Vary'), 'Authorization');
  assert.match(response.headers.get('Cache-Control'), /^private/);
});

test('missing secrets fail closed', async () => {
  const env = environment({ BASIC_AUTH_PASSWORD: undefined });
  const response = await worker.fetch(new Request('https://jet.example/'), env);
  assert.equal(response.status, 503);
  assert.equal(env.requests, 0);
});
