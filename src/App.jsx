import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Dashboard from './Dashboard';
import './App.css';

// Fake decoy screen — looks like a boring system diagnostics page
function DecoyScreen({ onDismiss }) {
  return (
    <div className="decoy-overlay" onClick={onDismiss}>
      <div className="decoy-screen">
        <div className="decoy-header">
          <span>System Diagnostics — Node Configuration Utility v3.1</span>
          <span className="decoy-status">● RUNNING</span>
        </div>
        <div className="decoy-body">
          <div className="decoy-section">
            <p className="decoy-label">PROCESS MONITOR</p>
            <div className="decoy-row"><span>svc_telemetry.exe</span><span className="decoy-val">Active — PID 4821</span></div>
            <div className="decoy-row"><span>node_config_agent.exe</span><span className="decoy-val">Active — PID 5102</span></div>
            <div className="decoy-row"><span>log_sync_daemon.exe</span><span className="decoy-val">Idle — PID 3344</span></div>
            <div className="decoy-row"><span>net_monitor.exe</span><span className="decoy-val">Active — PID 2201</span></div>
          </div>
          <div className="decoy-section">
            <p className="decoy-label">SYSTEM RESOURCE USAGE</p>
            <div className="decoy-row"><span>CPU Load</span><span className="decoy-val">12.4%</span></div>
            <div className="decoy-row"><span>Memory</span><span className="decoy-val">4.2 GB / 16.0 GB</span></div>
            <div className="decoy-row"><span>Disk I/O</span><span className="decoy-val">Read: 2.1 MB/s</span></div>
            <div className="decoy-row"><span>Network</span><span className="decoy-val">TX: 0.4 MB/s — RX: 1.2 MB/s</span></div>
          </div>
          <div className="decoy-section">
            <p className="decoy-label">RECENT SYNC EVENTS</p>
            <div className="decoy-log">[INFO] 2026-08-08 01:14:22 — Config node handshake complete</div>
            <div className="decoy-log">[INFO] 2026-08-08 01:14:20 — Telemetry batch dispatched (312 records)</div>
            <div className="decoy-log">[WARN] 2026-08-08 01:13:58 — Retry attempt 2/3 on upstream endpoint</div>
            <div className="decoy-log">[INFO] 2026-08-08 01:13:45 — Log rotation completed</div>
            <div className="decoy-log">[INFO] 2026-08-08 01:13:30 — Node authentication verified</div>
          </div>
          <div className="decoy-footer">Click anywhere to resume session</div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('std_theme') === 'dark');
  const [showDecoy, setShowDecoy] = useState(false);

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
      {/* Decoy screen — covers everything */}
      {showDecoy && <DecoyScreen onDismiss={() => setShowDecoy(false)} />}

      <header className="app-header">
        <span className="app-title">CONFIG-NODE-BETA / telemetry-sync</span>
        <div className="header-actions">
          {/* Panic / decoy button — discreet, always visible */}
          <button
            className="decoy-btn"
            onClick={() => setShowDecoy(true)}
            title="System Diagnostics"
          >
            ⬡
          </button>
          <button className="icon-btn" title={dark ? 'Light mode' : 'Dark mode'} onClick={() => setDark(d => !d)}>
            {dark ? '☀️' : '🌙'}
          </button>
          <button className="token-btn" onClick={() => { setShowDrawer(true); setDrawerError(''); setDrawerSuccess(false); }}>
            ⚙️ Update Token
          </button>
          <button className="logout-btn" onClick={handleLogout}>⏏ Logout</button>
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
