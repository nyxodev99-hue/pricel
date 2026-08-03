// Backend URL: same-origin in dev (proxied by Vite), or an explicit deployed
// Worker URL in production (set VITE_API_URL at build time).
const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  register: (email, password, pseudo) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, pseudo }) }),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  getMe: () => request('/api/users/me'),
  updateMe: (patch) => request('/api/users/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  getMyAchievements: () => request('/api/users/me/achievements'),
  getAllAchievements: () => request('/api/achievements'),
  getViewport: (x1, y1, x2, y2) => request(`/api/pixels/viewport?x1=${x1}&y1=${y1}&x2=${x2}&y2=${y2}`),
  getPixel: (x, y) => request(`/api/pixels/${x}/${y}`),
  paintPixel: (x, y, color) => request(`/api/pixels/${x}/${y}`, { method: 'POST', body: JSON.stringify({ color }) }),
  getStats: () => request('/api/stats'),
  getEvents: () => request('/api/events'),
};

export function connectRealtime(onMessage) {
  const wsUrl = BASE
    ? BASE.replace(/^http/, 'ws') + '/api/pixels/ws'
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/pixels/ws`;

  let ws;
  let retryDelay = 1000;
  let closedByUser = false;

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.onmessage = (evt) => {
      try { onMessage(JSON.parse(evt.data)); } catch (_) { /* ignore malformed frame */ }
    };
    ws.onopen = () => { retryDelay = 1000; };
    ws.onclose = () => {
      if (closedByUser) return;
      setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15000);
    };
    ws.onerror = () => ws.close();
  }
  connect();

  return () => { closedByUser = true; ws && ws.close(); };
}
