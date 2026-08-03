import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { isValidEmail, randomAvatar, randomPseudo } from '../lib/identity.js';
import { SESSION_COOKIE, SESSION_TTL_MS, checkAndBumpIpLimit } from '../middleware/auth.js';

export const authRoute = new Hono();

async function createSession(c, userId) {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(sessionId, userId, now, now + SESSION_TTL_MS).run();

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  });
}

function publicUser(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

authRoute.post('/register', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  const { password, pseudo } = body;

  if (!isValidEmail(email)) return c.json({ error: 'Adresse email invalide.' }, 400);
  if (!password || password.length < 8) {
    return c.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return c.json({ error: 'Un compte existe déjà avec cet email.' }, 409);

  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const limit = Number(c.env.MAX_SIGNUPS_PER_IP_PER_YEAR || 1);
  const allowed = await checkAndBumpIpLimit(db, ip, limit);
  if (!allowed) {
    return c.json({ error: 'Un compte a déjà été créé depuis cette connexion cette année.' }, 429);
  }

  const now = Date.now();
  const user = {
    id: crypto.randomUUID(),
    email,
    password_hash: await hashPassword(password),
    pseudo: (pseudo || randomPseudo()).slice(0, 24),
    avatar: randomAvatar(),
    credits: Number(c.env.FREE_CREDITS || 100),
    pixels_placed: 0,
    created_at: now,
    last_seen_at: now,
  };

  await db.prepare(
    `INSERT INTO users (id, email, password_hash, pseudo, avatar, credits, pixels_placed, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id, user.email, user.password_hash, user.pseudo, user.avatar,
    user.credits, user.pixels_placed, user.created_at, user.last_seen_at
  ).run();

  await createSession(c, user.id);
  return c.json({ user: publicUser(user) });
});

authRoute.post('/login', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  const { password } = body;

  if (!email || !password) return c.json({ error: 'Email et mot de passe requis.' }, 400);

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user || !user.password_hash) return c.json({ error: 'Identifiants invalides.' }, 401);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return c.json({ error: 'Identifiants invalides.' }, 401);

  await db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
  await createSession(c, user.id);
  return c.json({ user: publicUser(user) });
});

authRoute.post('/logout', async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});
