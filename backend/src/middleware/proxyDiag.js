/**
 * proxyDiag.js — TEMPORARY staging-only diagnostic (2026-10-20). REMOVE.
 *
 * Question: how many proxies forward a request to this server, and does
 * the edge keep, append to or replace an X-Forwarded-For the client sent?
 * (Needed to choose Express "trust proxy" safely; nothing is changed here.)
 *
 * Mounted only when APP_ENV=staging (index.js), and acts only on
 * GET /health carrying "x-qraivy-proxy-diag: 1". Logs one line of counts
 * and address CLASSES (public / cgnat / private / marker ...) -- never an
 * address, a header value, a token, a cookie or a customer identifier.
 * The /health response is unchanged.
 */
const net = require('net');

// TEST-NET-3 address the diagnostic client sends as a fake client address.
const MARKER = '203.0.113.77';

function kind(raw) {
  let a = String(raw || '').trim();
  if (!a) return 'none';
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === MARKER) return 'marker';
  const v = net.isIP(a);
  if (v === 4) {
    const [x, y] = a.split('.').map(Number);
    if (x === 127) return 'loopback';
    if (x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168)) return 'private';
    if (x === 100 && y >= 64 && y <= 127) return 'cgnat';
    if (x === 169 && y === 254) return 'linklocal';
    return 'public';
  }
  if (v === 6) {
    const l = a.toLowerCase();
    if (l === '::1') return 'loopback';
    if (/^f[cd]/.test(l)) return 'ula';
    if (/^fe[89ab]/.test(l)) return 'linklocal';
    return 'public6';
  }
  return 'invalid';
}

function proxyDiag(req, res, next) {
  if (req.method !== 'GET' || req.path !== '/health' || req.headers['x-qraivy-proxy-diag'] !== '1') return next();
  const entries = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const first = entries[0], last = entries[entries.length - 1];
  const alt = {};
  for (const h of ['x-real-ip', 'x-envoy-external-address', 'x-vercel-forwarded-for', 'true-client-ip', 'cf-connecting-ip']) {
    const v = req.headers[h];
    if (v === undefined) continue;
    const firstOfV = String(v).split(',')[0].trim();
    alt[h] = { kind: kind(firstOfV), sameAsFirstXff: firstOfV === first, sameAsLastXff: firstOfV === last };
  }
  console.log('[proxy-diag]', JSON.stringify({
    label: String(req.headers['x-qraivy-proxy-diag-label'] || '').replace(/[^a-z0-9-]/gi, '').slice(0, 32),
    socket: kind(req.socket && req.socket.remoteAddress),
    reqIp: kind(req.ip),
    xffCount: entries.length,
    xffKinds: entries.map(kind),
    markerAt: entries.indexOf(MARKER),
    alt,
    present: ['forwarded', 'via', 'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-port', 'x-vercel-id', 'x-vercel-deployment-url', 'x-railway-edge', 'x-railway-request-id']
      .filter((h) => req.headers[h] !== undefined),
  }));
  return next();
}

module.exports = { proxyDiag, kind, MARKER };
