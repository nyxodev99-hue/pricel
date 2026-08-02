import { getCookie, setCookie } from 'hono/cookie';

const COOKIE_NAME = 'pc_device_id';
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Resolves (and if needed creates) a stable device_id for the caller.
 * Primary signal: httpOnly cookie. Fallback: X-Device-Id header, so that
 * cross-origin fetches from the Vite dev server / a future native app can
 * still work if third-party cookies get blocked. The frontend keeps a
 * copy in localStorage and always sends the header as redundancy - see
 * frontend/src/api.js.
 */
export async function deviceIdMiddleware(c, next) {
  let deviceId = getCookie(c, COOKIE_NAME) || c.req.header('X-Device-Id');

  if (!deviceId) {
    deviceId = crypto.randomUUID();
  }

  setCookie(c, COOKIE_NAME, deviceId, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    maxAge: ONE_YEAR,
    path: '/',
  });

  c.set('deviceId', deviceId);
  await next();
}

/** Very simple per-IP-per-day cap on free-credit signups. */
export async function rateLimitSignup(c, ip, db) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await db.prepare('SELECT count FROM ip_signups WHERE ip = ? AND day = ?').bind(ip, day).first();
  const count = row ? row.count : 0;
  if (count >= 5) return false;
  await db.prepare(
    'INSERT INTO ip_signups (ip, day, count) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET count = count + 1'
  ).bind(ip, day).run();
  return true;
}
