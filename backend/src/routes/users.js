import { Hono } from 'hono';
import { rateLimitSignup } from '../middleware/auth.js';

const ADJECTIVES = ['Brave', 'Calme', 'Vif', 'Curieux', 'Discret', 'Agile', 'Solaire', 'Lunaire'];
const ANIMALS = ['Renard', 'Loutre', 'Faucon', 'Lynx', 'Corbeau', 'Panda', 'Heron', 'Loup'];
const AVATARS = ['🦊', '🦦', '🦅', '🐆', '🐦‍⬛', '🐼', '🦩', '🐺', '🦉', '🐢'];

function randomPseudo() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${a}${b}${Math.floor(Math.random() * 900 + 100)}`;
}

export const usersRoute = new Hono();

// Creates the account on first visit, or returns the existing one.
usersRoute.post('/init', async (c) => {
  const deviceId = c.get('deviceId');
  const db = c.env.DB;

  let user = await db.prepare('SELECT * FROM users WHERE device_id = ?').bind(deviceId).first();

  if (!user) {
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const allowed = await rateLimitSignup(c, ip, db);
    if (!allowed) return c.json({ error: 'Trop de nouveaux comptes depuis cette adresse aujourd\'hui.' }, 429);

    const now = Date.now();
    user = {
      id: crypto.randomUUID(),
      device_id: deviceId,
      pseudo: randomPseudo(),
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      credits: Number(c.env.FREE_CREDITS || 100),
      pixels_placed: 0,
      created_at: now,
      last_seen_at: now,
    };
    await db.prepare(
      'INSERT INTO users (id, device_id, pseudo, avatar, credits, pixels_placed, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, user.device_id, user.pseudo, user.avatar, user.credits, user.pixels_placed, user.created_at, user.last_seen_at).run();
  } else {
    await db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
  }

  return c.json({ user });
});

usersRoute.get('/me', async (c) => {
  const deviceId = c.get('deviceId');
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE device_id = ?').bind(deviceId).first();
  if (!user) return c.json({ error: 'Aucun compte pour cet appareil, appelle /init d\'abord.' }, 404);
  return c.json({ user });
});

usersRoute.patch('/me', async (c) => {
  const deviceId = c.get('deviceId');
  const { pseudo, avatar } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE device_id = ?').bind(deviceId).first();
  if (!user) return c.json({ error: 'Compte introuvable' }, 404);

  const newPseudo = (pseudo || user.pseudo).slice(0, 24);
  const newAvatar = avatar || user.avatar;
  await c.env.DB.prepare('UPDATE users SET pseudo = ?, avatar = ? WHERE id = ?').bind(newPseudo, newAvatar, user.id).run();
  return c.json({ user: { ...user, pseudo: newPseudo, avatar: newAvatar } });
});

usersRoute.get('/me/achievements', async (c) => {
  const deviceId = c.get('deviceId');
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE device_id = ?').bind(deviceId).first();
  if (!user) return c.json({ error: 'Compte introuvable' }, 404);
  const rows = await c.env.DB.prepare(`
    SELECT a.code, a.name, a.description, a.icon, ua.unlocked_at
    FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
    WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC
  `).bind(user.id).all();
  return c.json({ unlocked: rows.results });
});
