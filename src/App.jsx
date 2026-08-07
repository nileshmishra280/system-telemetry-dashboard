import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Dashboard from './Dashboard';
import './App.css';

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('std_theme') === 'dark');

  // Token drawer
  const [showDrawer, setShowDrawer] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [confirmToken, setConfirmToken] = useState('');
  const [drawerError, setDrawerError] = useState('');
  const [drawerSuccess, setDrawerSuccess] = useState(false);
  const [drawerSaving, setDrawerSaving] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('std_session') === 'active') setAuthenticated(true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('std_theme', dark ? 'dark' : 'light');
  }, [dark]);

  function handleLogout() {
    sessionStorage.removeItem('std_session');
    setAuthenticated(false);
    setTokenInput('');
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from('auth_config').select('password').eq('id', 1).single();
      if (dbError && dbError.code !== 'PGRST116') throw dbError;
      const stored = data?.password ?? 'sys-token-88';
      if (tokenInput === stored) {
        sessionStorage.setItem('std_session', 'active');
        setAuthenticated(true);
      } else {
        setError('Access Denied: Invalid Token');
      }
    } catch {
      setError('Node Sync Failed: Cannot reach configuration server.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateToken(e) {
    e.preventDefault();
    setDrawerError('');
    setDrawerSuccess(false);
    if (!newToken.trim()) { setDrawerError('Token cannot be empty'); return; }
    if (newToken !== confirmToken) { setDrawerError('Tokens do not match'); return; }
    setDrawerSaving(true);
    try {
      const { error: upsertError } = await supabase
        .from('auth_config').upsert({ id: 1, password: newToken.trim() });
      if (upsertError) throw upsertError;
      setDrawerSuccess(true);
      setNewToken(''); setConfirmToken('');
      setTimeout(() => { setShowDrawer(false); setDrawerSuccess(false); }, 1500);
    } catch {
      setDrawerError('Failed to update token. Try again.');
    } finally {
      setDrawerSaving(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="auth-wall">
        <div className="auth-card">
          <p className="auth-label">SYSTEM-TELEMETRY-DASHBOARD v2.4.1</p>
          <p className="auth-status">Node Status: Restricted.</p>
          <p className="auth-sub">Enter Token Key to Synchronize Logs.</p>
          <form onSubmit={handleLogin} className="auth-form">
            <input
              type="password" className="auth-input" value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="••••••••••••" autoComplete="off" autoFocus
            />
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Verifying...' : 'Synchronize'}
            </button>
          </form>
          {error && <p className="auth-error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <span className="app-title">CONFIG-NODE-BETA / telemetry-sync</span>
        <div className="header-actions">
          <button className="icon-btn" title={dark ? 'Light mode' : 'Dark mode'} onClick={() => setDark(d => !d)}>
            {dark ? '☀️' : '🌙'}
          </button>
          <button className="token-btn" onClick={() => { setShowDrawer(true); setDrawerError(''); setDrawerSuccess(false); }}>
            ⚙️ Update Token
          </button>
          <button className="logout-btn" onClick={handleLogout} title="Logout">
            ⏏ Logout
          </button>
        </div>
      </header>

      {showDrawer && (
        <div className="drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <p className="drawer-title">Update Access Token</p>
            <form onSubmit={handleUpdateToken}>
              <input type="password" className="drawer-input" placeholder="New token"
                value={newToken} onChange={(e) => setNewToken(e.target.value)} autoComplete="new-password" />
              <input type="password" className="drawer-input" placeholder="Confirm token"
                value={confirmToken} onChange={(e) => setConfirmToken(e.target.value)} autoComplete="new-password" />
              {drawerError && <p className="drawer-error">{drawerError}</p>}
              {drawerSuccess && <p className="drawer-success">Token updated.</p>}
              <div className="drawer-actions">
                <button type="submit" className="auth-btn" disabled={drawerSaving}>
                  {drawerSaving ? 'Saving...' : 'Apply'}
                </button>
                <button type="button" className="cancel-btn" onClick={() => setShowDrawer(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Dashboard />
    </div>
  );
}
