import { Hono } from 'hono';

function canvasStub(env) {
  const id = env.CANVAS.idFromName('main');
  return env.CANVAS.get(id);
}

export const pixelsRoute = new Hono();

pixelsRoute.get('/viewport', async (c) => {
  const { x1, y1, x2, y2 } = c.req.query();
  const stub = canvasStub(c.env);
  const res = await stub.fetch(`https://do/viewport?x1=${x1}&y1=${y1}&x2=${x2}&y2=${y2}`);
  return new Response(res.body, res);
});

pixelsRoute.get('/:x/:y', async (c) => {
  const { x, y } = c.req.param();
  const stub = canvasStub(c.env);
  const res = await stub.fetch(`https://do/pixel/${x}/${y}`);
  return new Response(res.body, res);
});

pixelsRoute.post('/:x/:y', async (c) => {
  const { x, y } = c.req.param();
  const deviceId = c.get('deviceId');
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE device_id = ?').bind(deviceId).first();
  if (!user) return c.json({ error: 'Appelle /api/users/init d\'abord.' }, 401);

  const { color } = await c.req.json();
  const stub = canvasStub(c.env);
  const res = await stub.fetch(`https://do/pixel/${x}/${y}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id, color }),
  });
  return new Response(res.body, res);
});

// WebSocket upgrade: proxied straight through to the Durable Object, which
// holds the actual hibernatable connections.
pixelsRoute.get('/ws', async (c) => {
  const stub = canvasStub(c.env);
  return stub.fetch('https://do/ws', c.req.raw);
});
