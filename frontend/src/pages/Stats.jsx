import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!stats) return <div className="page"><p>Chargement…</p></div>;

  return (
    <div className="page stats-page">
      <div className="stats-grid">
        <StatCard label="Pixels placés" value={stats.pixels_placed} />
        <StatCard label="Valeur totale de la toile" value={`${stats.total_canvas_value} crédits`} />
        <StatCard label="Joueurs" value={stats.player_count} />
        <StatCard
          label="Pixel le plus cher"
          value={stats.most_expensive_pixel ? `(${stats.most_expensive_pixel.x}, ${stats.most_expensive_pixel.y}) — ${stats.most_expensive_pixel.price} crédits` : '—'}
        />
      </div>

      <section className="stats-section">
        <h3>Top joueurs</h3>
        <ol className="ranked-list">
          {stats.top_players.map((p) => (
            <li key={p.id}>
              <span>{p.pseudo}</span>
              <span>{p.pixel_count} pixels</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="stats-section">
        <h3>Zones les plus disputées</h3>
        <ul className="ranked-list">
          {stats.contested_zones.map((z) => (
            <li key={`${z.zx}-${z.zy}`}>
              <span>Bloc ({z.zx * 50}–{z.zx * 50 + 49}, {z.zy * 50}–{z.zy * 50 + 49})</span>
              <span>{z.activity} pixels</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stats-section">
        <h3>Derniers pixels modifiés</h3>
        <ul className="ranked-list">
          {stats.recent_pixels.map((p) => (
            <li key={`${p.x}-${p.y}`}>
              <span><span className="swatch-preview" style={{ backgroundColor: p.color }} /> ({p.x}, {p.y})</span>
              <span>{new Date(p.updated_at).toLocaleTimeString('fr-FR')}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
