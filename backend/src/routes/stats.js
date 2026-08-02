import { Hono } from 'hono';

export const statsRoute = new Hono();

statsRoute.get('/', async (c) => {
  const id = c.env.CANVAS.idFromName('main');
  const stub = c.env.CANVAS.get(id);
  const canvasStats = await (await stub.fetch('https://do/stats')).json();

  const { count: playerCount } = await c.env.DB
    .prepare('SELECT COUNT(*) as count FROM users').first();

  // Resolve pseudos/avatars for the top-owner ids returned by the DO.
  const ownerIds = canvasStats.top_owners.map((o) => o.owner_id);
  let topPlayers = [];
  if (ownerIds.length) {
    const placeholders = ownerIds.map(() => '?').join(',');
    const users = await c.env.DB
      .prepare(`SELECT id, pseudo, avatar FROM users WHERE id IN (${placeholders})`)
      .bind(...ownerIds).all();
    const byId = Object.fromEntries(users.results.map((u) => [u.id, u]));
    topPlayers = canvasStats.top_owners.map((o) => ({
      ...byId[o.owner_id],
      pixel_count: o.pixel_count,
    }));
  }

  return c.json({
    pixels_placed: canvasStats.pixels_placed,
    total_canvas_value: canvasStats.total_canvas_value,
    most_expensive_pixel: canvasStats.most_expensive_pixel,
    player_count: playerCount,
    top_players: topPlayers,
    contested_zones: canvasStats.contested_zones,
    recent_pixels: canvasStats.recent_pixels,
  });
});
