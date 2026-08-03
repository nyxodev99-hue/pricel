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
 * Strict-ish per-IP-per-day cap on account creation. Doesn't guarantee one
 * account per physical device (nothing server-side can, short of phone/ID
 * verification) but blocks casual scripted or repeated signups from the
 * same network in a day.
 */
export async function checkAndBumpIpLimit(db, ip, limit) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await db.prepare('SELECT count FROM ip_signups WHERE ip = ? AND day = ?').bind(ip, day).first();
  const count = row ? row.count : 0;
  if (count >= limit) return false;
  await db.prepare(
    'INSERT INTO ip_signups (ip, day, count) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET count = count + 1'
  ).bind(ip, day).run();
  return true;
}
