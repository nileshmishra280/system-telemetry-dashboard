import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

// No file/PDF/folder terms anywhere visible to casual observer
function detectType(filename, mimeType) {
  const n = (filename || '').toLowerCase();
  if (mimeType === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(n)) return 'img';
  if (/\.(txt|md|csv|log)$/.test(n)) return 'txt';
  if (/\.(docx|doc|pptx|ppt|xlsx|xls)$/.test(n)) return 'doc';
  return 'bin';
}

// Neutral single-char type indicator — not revealing
function typeTag(t) {
  if (t === 'pdf') return 'P';
  if (t === 'img') return 'I';
  if (t === 'txt') return 'T';
  if (t === 'doc') return 'D';
  return 'B';
}

function TabPane({ file }) {
  const [txt, setTxt] = useState('');
  const kind = detectType(file.name, file.type);

  useEffect(() => {
    if (kind === 'txt') {
      fetch(file.url).then(r => r.text()).then(setTxt).catch(() => setTxt('Could not load.'));
    }
  }, [file.url, kind]);

  if (kind === 'pdf') {
    return (
      <div className="pdf-viewer-wrap">
        <div className="pdf-viewer-toolbar">
          <span className="pdf-viewer-name">{file.name}</span>
          <div className="pdf-viewer-actions">
            <a href={file.url} target="_blank" rel="noreferrer" className="pdf-action-btn">↗ View</a>
            <a href={file.url} download={file.name} className="pdf-action-btn">↓ Save</a>
          </div>
        </div>
        <iframe
          key={file.url}
          src={`${file.url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH&zoom=page-width`}
          title={file.name}
          className="pdf-iframe"
          allow="fullscreen"
        />
      </div>
    );
  }
  if (kind === 'img') {
    return <div className="tab-img-wrap"><img src={file.url} alt="" className="tab-img" /></div>;
  }
  if (kind === 'txt') {
    return <pre className="tab-text">{txt || 'Loading...'}</pre>;
  }
  if (kind === 'doc') {
    return (
      <iframe
        key={file.url}
        src={`https://docs.google.com/viewer?url=${encodeURIComponent(file.url)}&embedded=true`}
        title={file.name}
        className="pdf-iframe"
      />
    );
  }
  return (
    <div className="tab-fallback">
      <p>Binary asset — use direct access.</p>
      <a href={file.url} target="_blank" rel="noreferrer" className="dl-link">↓ Direct Access</a>
    </div>
  );
}

// Picker — shown when + is clicked in tab bar
function Picker({ directories, openTab, onClose }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <>
      <div className="picker-backdrop" onClick={onClose} />
      <div className="picker-container">
        <div className="picker-header">Select Node Stream</div>
        <div className="picker-body">
          {directories.length === 0 && <p className="picker-empty">No streams registered.</p>}
          {directories.map(dir => (
            <div key={dir.id}>
              <button
                className={`picker-dir-btn${expanded === dir.id ? ' open' : ''}`}
                onClick={() => setExpanded(expanded === dir.id ? null : dir.id)}
              >
                <span>{expanded === dir.id ? '▾' : '▸'}</span>
                <span className="picker-dir-name">{dir.name}</span>
                <span className="picker-dir-count">{dir.assets?.length ?? dir.files?.length ?? 0}</span>
              </button>
              {expanded === dir.id && (
                <ul className="picker-file-list">
                  {(!(dir.assets ?? dir.files) || (dir.assets ?? dir.files).length === 0) && (
                    <li className="picker-empty-item">No records</li>
                  )}
                  {(dir.assets ?? dir.files ?? []).map((f, i) => {
                    const t = detectType(f.name, f.type);
                    return (
                      <li key={i} className="picker-file-item" onClick={() => { openTab(f); onClose(); }}>
                        <span className={`type-badge type-${t}`}>{typeTag(t)}</span>
                        <span className="picker-file-name">{f.name}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function Dashboard({ onTriggerDecoy }) {
  const [directories, setDirectories] = useState([]);
  const [selectedDir, setSelectedDir] = useState(null);
  const [newDirName, setNewDirName] = useState('');
  const [dirError, setDirError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  const fileInputRef = useRef(null);
  const tabsOpen = openTabs.length > 0;

  useEffect(() => {
    fetchDirs();
    const ch = supabase.channel('dir-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'directories' }, fetchDirs)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchDirs() {
    const { data } = await supabase.from('directories').select('*').order('created_at', { ascending: true });
    if (data) setDirectories(data);
  }

  function openTab(file) {
    const ex = openTabs.find(t => t.file.url === file.url);
    if (ex) { setActiveTabId(ex.id); return; }
    const id = `t${Date.now()}`;
    setOpenTabs(p => [...p, { id, file }]);
    setActiveTabId(id);
  }

  function closeTab(id, e) {
    e?.stopPropagation();
    setOpenTabs(p => {
      const next = p.filter(t => t.id !== id);
      if (activeTabId === id) setActiveTabId(next.length ? next[next.length - 1].id : null);
      return next;
    });
  }

  function closeAllTabs() { setOpenTabs([]); setActiveTabId(null); setShowPicker(false); }

  async function handleCreateDir(e) {
    e.preventDefault();
    setDirError('');
    if (!newDirName.trim()) { setDirError('Stream name required'); return; }
    await supabase.from('directories').insert({ name: newDirName.trim(), files: [] });
    setNewDirName('');
  }

  async function handleDeleteDir(dir, e) {
    e.stopPropagation();
    if (!window.confirm(`Remove stream "${dir.name}"?`)) return;
    const files = dir.assets ?? dir.files ?? [];
    if (files.length) {
      const paths = files.map(f => f.storagePath || extractPath(f.url)).filter(Boolean);
      if (paths.length) await supabase.storage.from('uploads').remove(paths);
    }
    await supabase.from('directories').delete().eq('id', dir.id);
    if (selectedDir?.id === dir.id) setSelectedDir(null);
    const urls = new Set(files.map(f => f.url));
    setOpenTabs(p => p.filter(t => !urls.has(t.file.url)));
  }

  function extractPath(url) {
    try { const p = url.split('/uploads/'); return p[1] ? decodeURIComponent(p[1]) : null; } catch { return null; }
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file || !selectedDir) return;
    setUploadError(''); setUploadProgress(10);
    const fp = `${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from('uploads').upload(fp, file, { upsert: false });
    if (upErr) { setUploadError(`Sync error: ${upErr.message}`); setUploadProgress(null); fileInputRef.current.value = ''; return; }
    setUploadProgress(80);
    const { data: ud } = supabase.storage.from('uploads').getPublicUrl(fp);
    const entry = { name: file.name, url: ud.publicUrl, type: file.type || '', uploadedAt: Date.now(), storagePath: fp };
    const { data: latest } = await supabase.from('directories').select('files').eq('id', selectedDir.id).single();
    await supabase.from('directories').update({ files: [...(latest?.files ?? []), entry] }).eq('id', selectedDir.id);
    setUploadProgress(null); fileInputRef.current.value = '';
  }

  async function handleDeleteFile(entry) {
    if (!window.confirm(`Remove record "${entry.name}"?`)) return;
    const path = entry.storagePath || extractPath(entry.url);
    if (path) await supabase.storage.from('uploads').remove([path]);
    const { data: latest } = await supabase.from('directories').select('files').eq('id', selectedDir.id).single();
    await supabase.from('directories').update({ files: (latest?.files ?? []).filter(f => f.url !== entry.url) }).eq('id', selectedDir.id);
    const tab = openTabs.find(t => t.file.url === entry.url);
    if (tab) closeTab(tab.id);
  }

  const activeDir = selectedDir ? (directories.find(d => d.id === selectedDir.id) ?? selectedDir) : null;
  const activeFiles = activeDir?.assets ?? activeDir?.files ?? [];
  const activeTab = openTabs.find(t => t.id === activeTabId) ?? null;

  return (
    <div className="dashboard">

      {/* ═══════ READER MODE ═══════ */}
      {tabsOpen && (
        <div className="reader-root">
          <div className="tab-bar">
            <button className="tab-back-btn" onClick={closeAllTabs}>← Exit</button>
            <div className="tab-list">
              {openTabs.map(tab => {
                const t = detectType(tab.file.name, tab.file.type);
                return (
                  <div key={tab.id}
                    className={`tab-item${tab.id === activeTabId ? ' active' : ''}`}
                    onClick={() => setActiveTabId(tab.id)}
                    title={tab.file.name}
                  >
                    <span className={`tab-type type-${t}`}>{typeTag(t)}</span>
                    <span className="tab-label">{tab.file.name}</span>
                    <span className="tab-x" onClick={e => closeTab(tab.id, e)}>✕</span>
                  </div>
                );
              })}
            </div>
            <button className="tab-add-btn" onClick={() => setShowPicker(p => !p)}>
              {showPicker ? '✕' : '+'}
            </button>
            {/* Invisible decoy trigger — tiny dot far right of tab bar */}
            <button className="decoy-trigger-btn" onClick={onTriggerDecoy} aria-hidden="true" tabIndex={-1} />
          </div>

          {showPicker && (
            <Picker
              directories={directories}
              openTab={openTab}
              onClose={() => setShowPicker(false)}
            />
          )}

          <div className="reader-body">
            {activeTab
              ? <TabPane key={activeTab.id} file={activeTab.file} />
              : <div className="tab-empty">No stream selected</div>
            }
          </div>
        </div>
      )}

      {/* ═══════ NORMAL MODE ═══════ */}
      {!tabsOpen && (
        <>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)}>
            {sidebarOpen ? '◀' : '▶'}
          </button>

          {sidebarOpen && (
            <aside className="sidebar">
              {/* Invisible decoy trigger — top-right corner of sidebar */}
              <button className="decoy-trigger-btn" onClick={onTriggerDecoy} aria-hidden="true" tabIndex={-1} style={{ position: 'absolute', top: 6, right: 6 }} />
              <p className="sidebar-label">NODE STREAMS</p>
              <form onSubmit={handleCreateDir} className="dir-form">
                <input type="text" className="dir-input" placeholder="Stream identifier"
                  value={newDirName} onChange={e => { setNewDirName(e.target.value); setDirError(''); }} />
                <button type="submit" className="dir-btn">Register</button>
              </form>
              {dirError && <p className="inline-error">{dirError}</p>}
              <ul className="dir-list">
                {directories.map(dir => (
                  <li key={dir.id}
                    className={`dir-item${selectedDir?.id === dir.id ? ' active' : ''}`}
                    onClick={() => { setSelectedDir(dir); setUploadError(''); }}
                  >
                    <span className="dir-icon">◈</span>
                    <span className="dir-name">{dir.name}</span>
                    <span className="dir-count">{(dir.assets ?? dir.files)?.length ?? 0}</span>
                    <button className="dir-delete" onClick={e => handleDeleteDir(dir, e)}>✕</button>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <main className="content">
            {!activeDir ? (
              <div className="content-empty"><p>Select a node stream to inspect records.</p></div>
            ) : (
              <>
                <div className="content-header">
                  <span className="content-title">{activeDir.name}</span>
                  <button className="upload-btn" onClick={() => fileInputRef.current.click()}>
                    ↑ Push Record
                  </button>
                  <input type="file" accept="*/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
                </div>

                {uploadProgress !== null && (
                  <div className="progress-bar-wrap">
                    <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
                    <span className="progress-label">{uploadProgress}%</span>
                  </div>
                )}
                {uploadError && <p className="inline-error">{uploadError}</p>}

                {activeFiles.length === 0 ? (
                  <p className="no-files">No records in this stream.</p>
                ) : (
                  <div className="file-grid">
                    {activeFiles.map((file, i) => {
                      const t = detectType(file.name, file.type);
                      return (
                        <div key={i} className="file-card" onClick={() => openTab(file)}>
                          <span className={`card-type-badge type-${t}`}>{typeTag(t)}</span>
                          <div className="file-card-name" title={file.name}>{file.name}</div>
                          <div className="file-card-actions" onClick={e => e.stopPropagation()}>
                            <button className="action-btn render-btn" onClick={() => openTab(file)}>Inspect</button>
                            <a href={file.url} target="_blank" rel="noreferrer" className="action-btn fetch-btn">Fetch</a>
                            <button className="action-btn delete-btn" onClick={() => handleDeleteFile(file)}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </main>
        </>
      )}
    </div>
  );
}
