import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Achievements() {
  const [all, setAll] = useState([]);
  const [unlocked, setUnlocked] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getAllAchievements(), api.getMyAchievements()])
      .then(([a, u]) => { setAll(a.achievements); setUnlocked(u.unlocked); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="page"><p className="error">{error}</p></div>;

  const unlockedCodes = new Set(unlocked.map((u) => u.code));

  return (
    <div className="page">
      <div className="achievements-grid">
        {all.map((a) => {
          const done = unlockedCodes.has(a.code);
          return (
            <div key={a.code} className={`achievement-card ${done ? 'achievement-card--unlocked' : ''}`}>
              <div className="achievement-icon">{a.icon}</div>
              <div>
                <div className="achievement-name">{a.name}</div>
                <div className="achievement-desc">{a.description}</div>
              </div>
              {done && <span className="achievement-check">✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
