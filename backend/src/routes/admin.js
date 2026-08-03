import { Hono } from 'hono';

export const adminRoute = new Hono();

// Every route in here requires X-Admin-Secret to match the ADMIN_SECRET
// Worker secret. Set it with: wrangler secret put ADMIN_SECRET
// If ADMIN_SECRET isn't configured at all, these routes refuse everything
// rather than silently allowing access.
adminRoute.use('*', async (c, next) => {
  const expected = c.env.ADMIN_SECRET;
  const provided = c.req.header('X-Admin-Secret');
  if (!expected || provided !== expected) {
    return c.json({ error: 'Non autorisé' }, 401);
  }
  await next();
});

adminRoute.post('/reset-canvas', async (c) => {
  const id = c.env.CANVAS.idFromName('main');
  const stub = c.env.CANVAS.get(id);
  await stub.fetch('https://do/internal/reset', { method: 'POST' });
  return c.json({ ok: true });
});
