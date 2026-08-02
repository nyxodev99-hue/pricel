/**
 * Sends the given D1 event rows to the CanvasEconomy Durable Object, which
 * owns the pixel grid and therefore does the actual trigger-evaluation /
 * effect-application (see CanvasEconomy#runEvent). This file just wires the
 * Worker <-> DO call so it can be reused by both the manual "/trigger"
 * route and the scheduled() cron handler.
 */
export async function runEventsAgainstCanvas(env, events) {
  const id = env.CANVAS.idFromName('main');
  const stub = env.CANVAS.get(id);
  const res = await stub.fetch('https://do/internal/run-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  const { results } = await res.json();
  return results;
}
