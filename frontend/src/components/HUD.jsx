import LogoMark from './LogoMark.jsx';

export default function HUD({ user, connected, onNavigate, page, onLogout }) {
  return (
    <header className="hud">
      <div className="hud-brand">
        <LogoMark />
        <span>Pricel</span>
        <span className={`hud-status ${connected ? 'hud-status--on' : 'hud-status--off'}`}>
          {connected ? '● en direct' : '○ reconnexion…'}
        </span>
      </div>

      <nav className="hud-nav">
        <button className={page === 'canvas' ? 'active' : ''} onClick={() => onNavigate('canvas')}>Toile</button>
        <button className={page === 'stats' ? 'active' : ''} onClick={() => onNavigate('stats')}>Statistiques</button>
        <button className={page === 'achievements' ? 'active' : ''} onClick={() => onNavigate('achievements')}>Succès</button>
      </nav>

      {user && (
        <div className="hud-user">
          <span className="hud-avatar">{user.avatar}</span>
          <span className="hud-pseudo">{user.pseudo}</span>
          <span className="hud-credits">{user.credits} crédits</span>
          <button className="hud-logout" onClick={onLogout} title="Se déconnecter">⏻</button>
        </div>
      )}
    </header>
  );
}
