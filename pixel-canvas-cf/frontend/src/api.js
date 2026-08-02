// Backend URL: same-origin in dev (proxied by Vite), or an explicit deployed
// Worker URL in production (set VITE_API_URL at build time).
const BASE = import.meta.env.VITE_API_URL || '';

const DEVICE_ID_KEY = 'pc_device_id';

function getStoredDeviceId() {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch (_) {
    return null;
  }
}

function setStoredDeviceId(id) {
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch (_) { /* private browsing / storage disabled */ }
}

// The backend's httpOnly cookie is the primary signal; this header is a
// redundant fallback in case third-party cookies get blocked (e.g. the
// frontend and Worker on different subdomains without SameSite=None
// support, or a future native wrapper with no cookie jar at all).
function authHeaders() {
  const id = getStoredDeviceId();
  return id ? { 'X-Device-Id': id } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  async initUser() {
    const { user } = await request('/api/users/init', { method: 'POST' });
    setStoredDeviceId(user.device_id);
    return user;
  },
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
