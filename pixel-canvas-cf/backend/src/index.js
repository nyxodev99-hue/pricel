import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { deviceIdMiddleware } from './middleware/auth.js';
import { usersRoute } from './routes/users.js';
import { pixelsRoute } from './routes/pixels.js';
import { statsRoute } from './routes/stats.js';
import { achievementsRoute } from './routes/achievements.js';
import { eventsRoute } from './routes/events.js';
import { runEventsAgainstCanvas } from './services/eventEngine.js';

export { CanvasEconomy } from './do/CanvasEconomy.js';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: (origin) => origin, // reflect caller origin; tighten to your frontend domain in production
    credentials: true,
  })
);
app.use('*', deviceIdMiddleware);

app.get('/', (c) => c.json({ ok: true, service: 'pixel-canvas-backend' }));

app.route('/api/users', usersRoute);
app.route('/api/pixels', pixelsRoute);
app.route('/api/stats', statsRoute);
app.route('/api/achievements', achievementsRoute);
app.route('/api/events', eventsRoute);

export default {
  fetch: app.fetch,

  // Workers Cron Trigger (see wrangler.toml [triggers]). Evaluates every
  // active event whose schedule_cron matches "now" against the live canvas.
  async scheduled(controller, env, ctx) {
    const { results } = await env.DB.prepare('SELECT * FROM events WHERE active = 1').all();
    const due = results.filter((e) => e.schedule_cron === controller.cron);
    if (!due.length) return;

    const outcomes = await runEventsAgainstCanvas(env, due);
    const now = Date.now();
    await env.DB.batch(
      due.map((e) => env.DB.prepare('UPDATE events SET last_run_at = ? WHERE id = ?').bind(now, e.id))
    );
    console.log('Events evaluated:', JSON.stringify(outcomes));
  },
};
