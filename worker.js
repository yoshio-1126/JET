function challenge() {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="JET Preview", charset="UTF-8"',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export default {
  async fetch(request, env) {
    if (!env.BASIC_AUTH_USER || !env.BASIC_AUTH_PASSWORD) {
      return new Response('Authentication is not configured', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    const authorization = request.headers.get('Authorization') || '';
    if (!/^Basic\s+/i.test(authorization)) return challenge();
    let credentials;
    try { credentials = atob(authorization.replace(/^Basic\s+/i, '')); } catch { return challenge(); }
    const separator = credentials.indexOf(':');
    if (separator < 0) return challenge();
    const encoder = new TextEncoder();
    const hash = (value) => crypto.subtle.digest('SHA-256', encoder.encode(value));
    const [actual, expected] = await Promise.all([
      hash(credentials), hash(`${env.BASIC_AUTH_USER}:${env.BASIC_AUTH_PASSWORD}`),
    ]);
    const a = new Uint8Array(actual);
    const b = new Uint8Array(expected);
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
    if (difference) return challenge();
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    const mutable = /\.(?:html|css|js|json)$/.test(new URL(request.url).pathname) || new URL(request.url).pathname === '/';
    headers.set('Cache-Control', mutable ? 'private, no-cache' : 'private, max-age=3600');
    headers.set('Vary', 'Authorization');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'SAMEORIGIN');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Referrer-Policy', 'same-origin');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
