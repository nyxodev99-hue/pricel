import { Hono } from 'hono';

export const achievementsRoute = new Hono();

achievementsRoute.get('/', async (c) => {
  const rows = await c.env.DB.prepare('SELECT code, name, description, icon, condition_type, condition_value FROM achievements').all();
  return c.json({ achievements: rows.results });
});
