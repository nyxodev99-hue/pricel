import { useState } from 'react';
import { api } from '../api.js';

export default function AuthScreen({ onSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user } =
        mode === 'login'
          ? await api.login(email.trim(), password)
          : await api.register(email.trim(), password, pseudo.trim() || undefined);
      onSuccess(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="hud-logo">▦</span>
          <span>Toile Collaborative</span>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Se connecter
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Créer un compte
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
          </label>

          {mode === 'register' && (
            <label>
              Pseudo <span className="auth-optional">(optionnel)</span>
              <input
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                maxLength={24}
                placeholder="généré automatiquement si vide"
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-paint" disabled={busy}>
            {busy ? 'Un instant…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        {mode === 'register' && (
          <p className="auth-hint">Le mot de passe doit faire au moins 8 caractères.</p>
        )}
      </div>
    </div>
  );
}
