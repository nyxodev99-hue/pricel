import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';

export const usersRoute = new Hono();

// Returns the logged-in user's profile. Requires a valid session - there is
// no more anonymous auto-creation; accounts are made via /api/auth/register.
usersRoute.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare(
    'SELECT id, email, pseudo, avatar, credits, pixels_placed, created_at, last_seen_at FROM users WHERE id = ?'
  ).bind(userId).first();
  if (!user) return c.json({ error: 'Compte introuvable.' }, 404);
  return c.json({ user });
});

usersRoute.patch('/me', requireAuth, async (c) => {
  const userId = c.get('userId');
  const { pseudo, avatar } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) return c.json({ error: 'Compte introuvable.' }, 404);

  const newPseudo = (pseudo || user.pseudo).slice(0, 24);
  const newAvatar = avatar || user.avatar;
  await c.env.DB.prepare('UPDATE users SET pseudo = ?, avatar = ? WHERE id = ?').bind(newPseudo, newAvatar, userId).run();
  return c.json({ user: { ...user, password_hash: undefined, pseudo: newPseudo, avatar: newAvatar } });
});

usersRoute.get('/me/achievements', requireAuth, async (c) => {
  const userId = c.get('userId');
  const rows = await c.env.DB.prepare(`
    SELECT a.code, a.name, a.description, a.icon, ua.unlocked_at
    FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
    WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC
  `).bind(userId).all();
  return c.json({ unlocked: rows.results });
});
