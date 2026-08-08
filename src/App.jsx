import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Dashboard from './Dashboard';
import './App.css';

// Fake decoy — looks like a real boring internal system tool
// Only dismissible via the invisible dot (bottom-right corner)
function DecoyScreen({ onDismiss }) {
  return (
    <div className="decoy-overlay">
      <div className="decoy-screen">
        <div className="decoy-topbar">
          <span>Node Configuration Utility — Internal Build 3.1.4</span>
          <span className="decoy-pill">ACTIVE SESSION</span>
        </div>
        <div className="decoy-body">
          <div className="decoy-section">
            <p className="decoy-label">PROCESS REGISTRY</p>
            <div className="decoy-row"><span>svc_telemetry_core.exe</span><span className="decoy-val ok">Running — PID 4821</span></div>
            <div className="decoy-row"><span>node_config_agent.exe</span><span className="decoy-val ok">Running — PID 5102</span></div>
            <div className="decoy-row"><span>log_sync_daemon.exe</span><span className="decoy-val dim">Idle — PID 3344</span></div>
            <div className="decoy-row"><span>net_watchdog.exe</span><span className="decoy-val ok">Running — PID 2201</span></div>
            <div className="decoy-row"><span>cfg_validator.exe</span><span className="decoy-val dim">Standby — PID 6610</span></div>
          </div>
          <div className="decoy-section">
            <p className="decoy-label">RESOURCE DIAGNOSTICS</p>
            <div className="decoy-row"><span>CPU Utilization</span><span className="decoy-val">12.4%</span></div>
            <div className="decoy-row"><span>Heap Allocation</span><span className="decoy-val">4.2 GB / 16.0 GB</span></div>
            <div className="decoy-row"><span>Disk I/O Read</span><span className="decoy-val">2.1 MB/s</span></div>
            <div className="decoy-row"><span>Net TX / RX</span><span className="decoy-val">0.4 / 1.2 MB/s</span></div>
            <div className="decoy-row"><span>Uptime</span><span className="decoy-val">14d 07h 22m</span></div>
          </div>
          <div className="decoy-section">
            <p className="decoy-label">SYNC EVENT LOG</p>
            <div className="decoy-log">[INFO] 2026-08-08 01:14:22 — Handshake acknowledged by upstream relay</div>
            <div className="decoy-log">[INFO] 2026-08-08 01:14:20 — Batch dispatch complete (312 records)</div>
            <div className="decoy-log">[WARN] 2026-08-08 01:13:58 — Retry 2/3 on endpoint /api/v2/ingest</div>
            <div className="decoy-log">[INFO] 2026-08-08 01:13:45 — Log rotation: archive_20260808.gz written</div>
            <div className="decoy-log">[INFO] 2026-08-08 01:13:30 — Node auth token refreshed</div>
            <div className="decoy-log">[DEBUG] 2026-08-08 01:13:10 — Config schema validated (v4.2)</div>
          </div>
        </div>
      </div>
      {/* Invisible dismiss dot — bottom right, completely invisible */}
      <button className="decoy-dismiss-dot" onClick={onDismiss} aria-hidden="true" tabIndex={-1} />
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
          <p className="auth-label">INTERNAL — BUILD 3.1.4 — RESTRICTED</p>
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
      {showDecoy && <DecoyScreen onDismiss={() => setShowDecoy(false)} />}

      <header className="app-header">
        <span className="app-title">CONFIG-NODE-BETA / telemetry-sync</span>
        <div className="header-actions">
          <button className="icon-btn" title="Toggle theme" onClick={() => setDark(d => !d)}>
            {dark ? '☀' : '◑'}
          </button>
          <button className="token-btn" onClick={() => { setShowDrawer(true); setDrawerError(''); setDrawerSuccess(false); }}>
            ⚙ Config
          </button>
          <button className="logout-btn" onClick={handleLogout}>⏏</button>
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

      <Dashboard onTriggerDecoy={() => setShowDecoy(true)} />
    </div>
  );
}
