import { Hono } from 'hono';
import { runEventsAgainstCanvas } from '../services/eventEngine.js';

export const eventsRoute = new Hono();

eventsRoute.get('/', async (c) => {
  const rows = await c.env.DB.prepare('SELECT code, name, description, schedule_cron, active, last_run_at FROM events').all();
  return c.json({ events: rows.results });
});

// Manual trigger, useful for testing an event without waiting for the cron.
// Gate it behind ADMIN_SECRET in production (set via `wrangler secret put ADMIN_SECRET`).
eventsRoute.post('/:code/trigger', async (c) => {
  if (c.env.ADMIN_SECRET) {
    const provided = c.req.header('X-Admin-Secret');
    if (provided !== c.env.ADMIN_SECRET) return c.json({ error: 'Non autorisé' }, 401);
  }
  const { code } = c.req.param();
  const event = await c.env.DB.prepare('SELECT * FROM events WHERE code = ?').bind(code).first();
  if (!event) return c.json({ error: 'Événement inconnu' }, 404);

  const results = await runEventsAgainstCanvas(c.env, [event]);
  await c.env.DB.prepare('UPDATE events SET last_run_at = ? WHERE id = ?').bind(Date.now(), event.id).run();
  return c.json({ results });
});
