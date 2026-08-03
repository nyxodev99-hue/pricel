import { useCallback, useEffect, useRef, useState } from 'react';
import { api, connectRealtime } from './api.js';
import HUD from './components/HUD.jsx';
import Palette from './components/Palette.jsx';
import PixelInspector from './components/PixelInspector.jsx';
import CanvasBoard from './components/Canvas.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Stats from './pages/Stats.jsx';
import Achievements from './pages/Achievements.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [page, setPage] = useState('canvas');
  const [selectedColor, setSelectedColor] = useState('#02BE01');
  const [selectedPixel, setSelectedPixel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [bumpTick, setBumpTick] = useState(0);
  const pixelsRef = useRef(new Map());

  const pushToast = useCallback((text) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // On mount, check for an existing session (httpOnly cookie). If none / it's
  // expired, api.getMe() throws and we show the login/register screen instead
  // of auto-creating an anonymous account.
  useEffect(() => {
    api.getMe()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const disconnect = connectRealtime((msg) => {
      setConnected(true);
      if (msg.type === 'pixel_update') {
        pixelsRef.current.set(`${msg.pixel.x},${msg.pixel.y}`, msg.pixel);
        const canvas = document.querySelector('canvas.canvas-board');
        canvas && canvas.__redraw && canvas.__redraw();
        setSelectedPixel((prev) =>
          prev && prev.x === msg.pixel.x && prev.y === msg.pixel.y
            ? { ...msg.pixel, is_empty: false }
            : prev
        );
      }
      if (msg.type === 'achievements_unlocked' && msg.userId === user?.id) {
        msg.achievements.forEach((a) => pushToast(`🏆 Succès débloqué : ${a.name}`));
      }
      if (msg.type === 'event_fired' && msg.triggered) {
        pushToast(`✨ Événement "${msg.name}" déclenché — ${msg.affected} pixels affectés`);
        setBumpTick((t) => t + 1);
      }
    });
    const interval = setInterval(() => setConnected((c) => c), 5000);
    return () => { disconnect(); clearInterval(interval); };
  }, [pushToast, user]);

  const handlePixelClick = useCallback(async (x, y) => {
    try {
      const pixel = await api.getPixel(x, y);
      setSelectedPixel(pixel);
    } catch (e) {
      pushToast(e.message);
    }
  }, [pushToast]);

  const handlePaint = useCallback(async (x, y, color) => {
    setBusy(true);
    try {
      const result = await api.paintPixel(x, y, color);
      pixelsRef.current.set(`${x},${y}`, result.pixel);
      setSelectedPixel({ ...result.pixel, is_empty: false });
      setUser((u) => (u ? { ...u, credits: result.credits_remaining } : u));
      const canvas = document.querySelector('canvas.canvas-board');
      canvas && canvas.__redraw && canvas.__redraw();
      if (result.unlocked?.length) {
        result.unlocked.forEach((a) => pushToast(`🏆 Succès débloqué : ${a.name}`));
      }
    } catch (e) {
      pushToast(e.message);
    } finally {
      setBusy(false);
    }
  }, [pushToast]);

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch (_) { /* best-effort */ }
    setUser(null);
    setSelectedPixel(null);
    setPage('canvas');
  }, []);

  if (!authChecked) {
    return <div className="app-loading">Chargement…</div>;
  }

  if (!user) {
    return <AuthScreen onSuccess={setUser} />;
  }

  return (
    <div className="app">
      <HUD user={user} connected={connected} page={page} onNavigate={setPage} onLogout={handleLogout} />

      {page === 'canvas' && (
        <div className="canvas-page">
          <CanvasBoard
            selectedColor={selectedColor}
            onPixelClick={handlePixelClick}
            pixelsRef={pixelsRef}
            bumpTick={bumpTick}
          />
          <aside className="sidebar">
            <Palette selected={selectedColor} onSelect={setSelectedColor} />
            <PixelInspector
              pixel={selectedPixel}
              selectedColor={selectedColor}
              onPaint={handlePaint}
              busy={busy}
              currentUserId={user?.id}
            />
          </aside>
        </div>
      )}

      {page === 'stats' && <Stats />}
      {page === 'achievements' && <Achievements />}

      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
      </div>
    </div>
  );
}
