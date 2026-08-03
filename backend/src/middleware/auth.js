import { getCookie } from 'hono/cookie';

export const SESSION_COOKIE = 'pc_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Resolves the current session (if any) into a userId, attached via
 * c.set('userId', ...). Does NOT create anything - registration/login is
 * handled explicitly in routes/auth.js. Anonymous browsing (viewing the
 * canvas, stats, etc.) stays allowed; only painting requires requireAuth.
 */
export async function sessionMiddleware(c, next) {
  const sessionId = getCookie(c, SESSION_COOKIE) || c.req.header('X-Session-Id');
  let userId = null;

  if (sessionId) {
    const session = await c.env.DB.prepare(
      'SELECT user_id, expires_at FROM sessions WHERE id = ?'
    ).bind(sessionId).first();

    if (session && session.expires_at > Date.now()) {
      userId = session.user_id;
    }
  }

  c.set('userId', userId);
  await next();
}

/** Route guard: rejects with 401 if no valid session was resolved above. */
export async function requireAuth(c, next) {
  if (!c.get('userId')) {
    return c.json({ error: 'Connecte-toi ou crée un compte pour continuer.' }, 401);
  }
  await next();
}

/**
 * Per-IP-per-calendar-year cap on account creation. Doesn't guarantee one
 * account per physical device (nothing server-side can, short of phone/ID
 * verification) but blocks casual scripted or repeated signups from the
 * same network within the year.
 */
export async function checkAndBumpIpLimit(db, ip, limit) {
  const period = new Date().getUTCFullYear().toString();
  const row = await db.prepare('SELECT count FROM ip_signups WHERE ip = ? AND period = ?').bind(ip, period).first();
  const count = row ? row.count : 0;
  if (count >= limit) return false;
  await db.prepare(
    'INSERT INTO ip_signups (ip, period, count) VALUES (?, ?, 1) ON CONFLICT(ip, period) DO UPDATE SET count = count + 1'
  ).bind(ip, period).run();
  return true;
}

/**
 * Client-generated token stored in localStorage (see frontend/src/device.js).
 * Unlike the IP cap this never expires: once a token has created an
 * account, it can't create another one, period. It's still not a true
 * "one account per device" guarantee (private browsing, clearing site data,
 * or a different browser all reset it) but combined with the IP cap it
 * raises the bar noticeably above either check alone.
 */
export async function isDeviceTokenAvailable(db, deviceToken) {
  if (!deviceToken) return true; // no token sent (e.g. localStorage blocked) - IP cap still applies
  const row = await db.prepare('SELECT user_id FROM device_signups WHERE device_token = ?').bind(deviceToken).first();
  return !row;
}

export async function recordDeviceSignup(db, deviceToken, userId) {
  if (!deviceToken) return;
  await db.prepare(
    'INSERT INTO device_signups (device_token, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(device_token) DO NOTHING'
  ).bind(deviceToken, userId, Date.now()).run();
}
