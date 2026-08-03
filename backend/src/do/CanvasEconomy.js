import { DurableObject } from 'cloudflare:workers';
import { isValidColor } from '../lib/palette.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pixels (
  x          INTEGER NOT NULL,
  y          INTEGER NOT NULL,
  color      TEXT NOT NULL,
  price      INTEGER NOT NULL DEFAULT 1,
  owner_id   TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (x, y)
);
CREATE INDEX IF NOT EXISTS idx_pixels_owner ON pixels(owner_id);
`;

const DEFAULT_PRICE = 1;

/**
 * CanvasEconomy is a SINGLE global Durable Object instance (id "main").
 * It owns:
 *   1. The sparse pixel grid (only ever-touched pixels have a row).
 *   2. All economic transactions on pixels (buy / conquer / recolor),
 *      including the D1 credit debit/credit for the buyer and the refund
 *      for a dispossessed owner - all inside one serialized fetch(), which
 *      is what gives us safe "transactions" without a distributed DB.
 *   3. The live WebSocket hub (hibernatable API, so idle connections don't
 *      cost wall-clock duration).
 */
export class CanvasEconomy extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(SCHEMA);
    });
  }

  // -- WebSocket hub (Hibernation API) ------------------------------------

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected websocket', { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/viewport' && request.method === 'GET') {
      const x1 = Number(url.searchParams.get('x1'));
      const y1 = Number(url.searchParams.get('y1'));
      const x2 = Number(url.searchParams.get('x2'));
      const y2 = Number(url.searchParams.get('y2'));
      return Response.json(this.getViewport(x1, y1, x2, y2));
    }

    if (url.pathname.startsWith('/pixel/') && request.method === 'GET') {
      const [, , xs, ys] = url.pathname.split('/');
      return Response.json(this.getPixel(Number(xs), Number(ys)));
    }

    if (url.pathname.startsWith('/pixel/') && request.method === 'POST') {
      const [, , xs, ys] = url.pathname.split('/');
      const body = await request.json();
      try {
        const result = await this.buyOrPaintPixel(Number(xs), Number(ys), body.userId, body.color);
        return Response.json(result);
      } catch (err) {
        return Response.json({ error: err.message }, { status: 400 });
      }
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      return Response.json(this.getCanvasStats());
    }

    if (url.pathname === '/internal/reset' && request.method === 'POST') {
      this.resetCanvas();
      return Response.json({ ok: true });
    }

    if (url.pathname === '/internal/run-events' && request.method === 'POST') {
      const { events } = await request.json();
      const results = [];
      for (const evt of events) results.push(await this.runEvent(evt));
      return Response.json({ results });
    }

    return new Response('Not found', { status: 404 });
  }

  webSocketMessage(ws, message) {
    // Clients only receive broadcasts; we don't expect inbound chat messages.
    // Kept for future use (e.g. cursor-position sharing) - currently a no-op.
  }

  webSocketClose(ws, code, reason, wasClean) {
    try { ws.close(code, reason); } catch (_) { /* already closing */ }
  }

  broadcast(payload) {
    const msg = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch (_) { /* dead socket, ignore */ }
    }
  }

  // -- Read helpers --------------------------------------------------------

  getPixel(x, y) {
    const row = this.ctx.storage.sql
      .exec('SELECT x, y, color, price, owner_id, updated_at FROM pixels WHERE x = ? AND y = ?', x, y)
      .toArray()[0];
    if (row) return { ...row, is_empty: false };
    return { x, y, color: null, price: DEFAULT_PRICE, owner_id: null, updated_at: null, is_empty: true };
  }

  getViewport(x1, y1, x2, y2) {
    const rows = this.ctx.storage.sql
      .exec(
        'SELECT x, y, color, price, owner_id, updated_at FROM pixels WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?',
        Math.min(x1, x2), Math.max(x1, x2), Math.min(y1, y2), Math.max(y1, y2)
      )
      .toArray();
    // Only touched pixels are returned; the frontend renders anything
    // missing as the default empty pixel (white, price 1).
    return { pixels: rows };
  }

  getCanvasStats() {
    const totals = this.ctx.storage.sql
      .exec('SELECT COUNT(*) as placed, COALESCE(SUM(price), 0) as total_value FROM pixels')
      .toArray()[0];
    const mostExpensive = this.ctx.storage.sql
      .exec('SELECT x, y, color, price, owner_id FROM pixels ORDER BY price DESC LIMIT 1')
      .toArray()[0] || null;
    const topOwners = this.ctx.storage.sql
      .exec('SELECT owner_id, COUNT(*) as pixel_count FROM pixels WHERE owner_id IS NOT NULL GROUP BY owner_id ORDER BY pixel_count DESC LIMIT 10')
      .toArray();
    const recent = this.ctx.storage.sql
      .exec('SELECT x, y, color, price, owner_id, updated_at FROM pixels ORDER BY updated_at DESC LIMIT 20')
      .toArray();
    // "Contested zones": 50x50 blocks with the most rows (most churn is a
    // reasonable proxy for "disputed" in this no-history v1).
    const zones = this.ctx.storage.sql
      .exec(`
        SELECT (x / 50) as zx, (y / 50) as zy, COUNT(*) as activity
        FROM pixels GROUP BY zx, zy ORDER BY activity DESC LIMIT 10
      `)
      .toArray();
    return {
      pixels_placed: totals.placed,
      total_canvas_value: totals.total_value,
      most_expensive_pixel: mostExpensive,
      top_owners: topOwners,
      recent_pixels: recent,
      contested_zones: zones,
    };
  }

  // Wipes every placed pixel back to the empty state. Does NOT touch user
  // credits or accounts in D1 - it's a canvas-only reset, so pixels_placed
  // history and achievements stay intact. Called from the admin route in
  // routes/admin.js, which is the thing gating this behind ADMIN_SECRET.
  resetCanvas() {
    this.ctx.storage.sql.exec('DELETE FROM pixels');
    this.broadcast({ type: 'canvas_reset' });
  }

  // -- Core economy ---------------------------------------------------------

  async buyOrPaintPixel(x, y, userId, color) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 1000 || y >= 1000) {
      throw new Error('Coordonnées invalides');
    }
    if (!isValidColor(color)) throw new Error('Couleur invalide (palette limitée)');
    if (!userId) throw new Error('Utilisateur inconnu');

    const existing = this.ctx.storage.sql
      .exec('SELECT x, y, color, price, owner_id FROM pixels WHERE x = ? AND y = ?', x, y)
      .toArray()[0];

    const now = Date.now();
    let cost = 0;
    let newPrice;
    let previousOwnerId = null;

    if (!existing) {
      // Empty pixel.
      cost = DEFAULT_PRICE;
      newPrice = DEFAULT_PRICE;
    } else if (existing.owner_id === userId) {
      // Recolor own pixel: free, price unchanged.
      cost = 0;
      newPrice = existing.price;
    } else {
      // Conquest.
      cost = existing.price + 1;
      newPrice = cost;
      previousOwnerId = existing.owner_id;
    }

    // Read buyer's credits from D1.
    const buyer = await this.env.DB
      .prepare('SELECT id, credits, pixels_placed FROM users WHERE id = ?')
      .bind(userId)
      .first();
    if (!buyer) throw new Error('Utilisateur introuvable');
    if (cost > 0 && buyer.credits < cost) throw new Error('Crédits insuffisants');

    // Apply credit changes in D1.
    const statements = [];
    if (cost > 0) {
      statements.push(
        this.env.DB.prepare('UPDATE users SET credits = credits - ?, pixels_placed = pixels_placed + 1, last_seen_at = ? WHERE id = ?')
          .bind(cost, now, userId)
      );
    } else {
      statements.push(
        this.env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, userId)
      );
    }
    if (previousOwnerId) {
      // Refund the dispossessed owner the price they originally paid.
      statements.push(
        this.env.DB.prepare('UPDATE users SET credits = credits + ? WHERE id = ?')
          .bind(existing.price, previousOwnerId)
      );
    }
    if (statements.length) await this.env.DB.batch(statements);

    // Write the pixel.
    this.ctx.storage.sql.exec(
      `INSERT INTO pixels (x, y, color, price, owner_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(x, y) DO UPDATE SET color = excluded.color, price = excluded.price,
         owner_id = excluded.owner_id, updated_at = excluded.updated_at`,
      x, y, color, newPrice, userId, now
    );

    // Achievement checks (pixels_placed, pixels_owned, conquest_price_gte).
    const ownedCount = this.ctx.storage.sql
      .exec('SELECT COUNT(*) as c FROM pixels WHERE owner_id = ?', userId)
      .toArray()[0].c;
    const unlocked = await this.checkAchievements(userId, {
      pixelsPlaced: buyer.pixels_placed + (cost > 0 ? 1 : 0),
      pixelsOwned: ownedCount,
      conquestPrice: previousOwnerId ? existing.price : 0,
    });

    const pixel = { x, y, color, price: newPrice, owner_id: userId, updated_at: now };
    this.broadcast({ type: 'pixel_update', pixel });
    if (unlocked.length) this.broadcast({ type: 'achievements_unlocked', userId, achievements: unlocked });

    return { pixel, cost, refunded_to: previousOwnerId, credits_remaining: buyer.credits - cost, unlocked };
  }

  async checkAchievements(userId, { pixelsPlaced, pixelsOwned, conquestPrice }) {
    const defs = await this.env.DB.prepare('SELECT * FROM achievements').all();
    const already = await this.env.DB
      .prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?')
      .bind(userId).all();
    const have = new Set(already.results.map((r) => r.achievement_id));
    const toUnlock = [];

    for (const a of defs.results) {
      if (have.has(a.id)) continue;
      let earned = false;
      if (a.condition_type === 'pixels_placed' && pixelsPlaced >= a.condition_value) earned = true;
      if (a.condition_type === 'pixels_owned' && pixelsOwned >= a.condition_value) earned = true;
      if (a.condition_type === 'conquest_price_gte' && conquestPrice >= a.condition_value) earned = true;
      if (earned) toUnlock.push(a);
    }

    if (toUnlock.length) {
      const now = Date.now();
      const stmts = toUnlock.map((a) =>
        this.env.DB.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)')
          .bind(userId, a.id, now)
      );
      await this.env.DB.batch(stmts);
    }
    return toUnlock.map((a) => ({ code: a.code, name: a.name, icon: a.icon }));
  }

  // -- Generic event engine --------------------------------------------------
  // config = { trigger: { type, params }, effect: { type, params } }

  async runEvent(eventRow) {
    const config = JSON.parse(eventRow.config);
    const triggered = this.evaluateTrigger(config.trigger);
    let affected = 0;
    if (triggered) affected = this.applyEffect(config.effect);
    if (affected > 0 || triggered) {
      this.broadcast({ type: 'event_fired', code: eventRow.code, name: eventRow.name, triggered, affected });
    }
    return { code: eventRow.code, triggered, affected };
  }

  evaluateTrigger(trigger) {
    if (trigger.type === 'corners_color') {
      const color = trigger.params.color.toUpperCase();
      const corners = [[0, 0], [999, 0], [0, 999], [999, 999]];
      return corners.every(([x, y]) => {
        const row = this.ctx.storage.sql.exec('SELECT color FROM pixels WHERE x = ? AND y = ?', x, y).toArray()[0];
        return row && row.color.toUpperCase() === color;
      });
    }
    // Extend here with new trigger types (e.g. 'total_value_above',
    // 'unique_players_above', 'zone_fully_owned_by_team'...).
    return false;
  }

  applyEffect(effect) {
    if (effect.type === 'price_multiply_all') {
      const { factor, floor = 1 } = effect.params;
      const rows = this.ctx.storage.sql.exec('SELECT x, y, price FROM pixels').toArray();
      let affected = 0;
      for (const r of rows) {
        const newPrice = Math.max(floor, Math.floor(r.price * factor));
        if (newPrice !== r.price) {
          this.ctx.storage.sql.exec('UPDATE pixels SET price = ? WHERE x = ? AND y = ?', newPrice, r.x, r.y);
          affected++;
        }
      }
      return affected;
    }
    // Extend here with new effect types (e.g. 'grant_credits_to_all',
    // 'freeze_zone', 'double_conquest_cost_for_24h'...).
    return 0;
  }
}
