import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

function detectFileType(filename, mimeType) {
  const name = (filename || '').toLowerCase();
  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(name)) return 'image';
  if (/\.(txt|md|csv|log)$/.test(name)) return 'text';
  if (/\.(docx|doc|pptx|ppt|xlsx|xls)$/.test(name)) return 'office';
  return 'other';
}

function fileIcon(type) {
  if (type === 'pdf') return '📄';
  if (type === 'image') return '🖼';
  if (type === 'text') return '📝';
  if (type === 'office') return '📊';
  return '📎';
}

function TabPane({ file }) {
  const [txtContent, setTxtContent] = useState('');
  const kind = detectFileType(file.name, file.type);

  useEffect(() => {
    if (kind === 'text') {
      fetch(file.url).then(r => r.text()).then(setTxtContent)
        .catch(() => setTxtContent('Could not load file.'));
    }
  }, [file.url, kind]);

  if (kind === 'pdf') {
    return (
      <iframe
        key={file.url}
        src={file.url}
        title={file.name}
        className="tab-iframe"
        allow="fullscreen"
      />
    );
  }
  if (kind === 'image') {
    return (
      <div className="tab-img-wrap">
        <img src={file.url} alt={file.name} className="tab-img" />
      </div>
    );
  }
  if (kind === 'text') {
    return <pre className="tab-text">{txtContent || 'Loading...'}</pre>;
  }
  if (kind === 'office') {
    return (
      <iframe
        key={file.url}
        src={`https://docs.google.com/viewer?url=${encodeURIComponent(file.url)}&embedded=true`}
        title={file.name}
        className="tab-iframe"
      />
    );
  }
  return (
    <div className="tab-fallback">
      <p>This file cannot be previewed.</p>
      <a href={file.url} target="_blank" rel="noreferrer" className="dl-link">↓ Download to view</a>
    </div>
  );
}

export default function Dashboard() {
  const [directories, setDirectories] = useState([]);
  const [selectedDir, setSelectedDir] = useState(null);
  const [newDirName, setNewDirName] = useState('');
  const [dirError, setDirError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Tab state
  const [openTabs, setOpenTabs] = useState([]);   // [{id, file}]
  const [activeTabId, setActiveTabId] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  // Picker state — which dir is expanded inside picker
  const [pickerExpanded, setPickerExpanded] = useState(null);

  const fileInputRef = useRef(null);
  const tabsOpen = openTabs.length > 0;

  useEffect(() => {
    fetchDirectories();
    const ch = supabase
      .channel('dir-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'directories' }, fetchDirectories)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchDirectories() {
    const { data } = await supabase
      .from('directories').select('*').order('created_at', { ascending: true });
    if (data) setDirectories(data);
  }

  // ── Tab management ──────────────────────────────
  function openTab(file) {
    const existing = openTabs.find(t => t.file.url === file.url);
    if (existing) {
      setActiveTabId(existing.id);
      setShowPicker(false);
      return;
    }
    const id = `t${Date.now()}`;
    setOpenTabs(prev => [...prev, { id, file }]);
    setActiveTabId(id);
    setShowPicker(false);
  }

  function closeTab(tabId, e) {
    e?.stopPropagation();
    setOpenTabs(prev => {
      const next = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next.length ? next[next.length - 1].id : null);
      }
      return next;
    });
  }

  function closeAllTabs() {
    setOpenTabs([]);
    setActiveTabId(null);
    setShowPicker(false);
  }

  // ── Directory management ─────────────────────────
  async function handleCreateDir(e) {
    e.preventDefault();
    setDirError('');
    if (!newDirName.trim()) { setDirError('Module name cannot be empty'); return; }
    const { error } = await supabase.from('directories').insert({ name: newDirName.trim(), files: [] });
    if (error) setDirError('Failed to create module.');
    else setNewDirName('');
  }

  async function handleDeleteDir(dir, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${dir.name}" and all its files?`)) return;
    if (dir.files?.length) {
      const paths = dir.files.map(f => f.storagePath || extractPath(f.url)).filter(Boolean);
      if (paths.length) await supabase.storage.from('uploads').remove(paths);
    }
    await supabase.from('directories').delete().eq('id', dir.id);
    if (selectedDir?.id === dir.id) setSelectedDir(null);
    const urls = new Set((dir.files || []).map(f => f.url));
    setOpenTabs(prev => prev.filter(t => !urls.has(t.file.url)));
  }

  function extractPath(url) {
    try { const p = url.split('/uploads/'); return p[1] ? decodeURIComponent(p[1]) : null; }
    catch { return null; }
  }

  // ── File upload ──────────────────────────────────
  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file || !selectedDir) return;
    setUploadError('');
    setUploadProgress(10);
    const filePath = `${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from('uploads').upload(filePath, file, { upsert: false });
    if (upErr) { setUploadError(`Upload failed: ${upErr.message}`); setUploadProgress(null); fileInputRef.current.value = ''; return; }
    setUploadProgress(80);
    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filePath);
    const entry = { name: file.name, url: urlData.publicUrl, type: file.type || '', uploadedAt: Date.now(), storagePath: filePath };
    const { data: latest } = await supabase.from('directories').select('files').eq('id', selectedDir.id).single();
    await supabase.from('directories').update({ files: [...(latest?.files ?? []), entry] }).eq('id', selectedDir.id);
    setUploadProgress(null);
    fileInputRef.current.value = '';
  }

  async function handleDeleteFile(entry) {
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    const path = entry.storagePath || extractPath(entry.url);
    if (path) await supabase.storage.from('uploads').remove([path]);
    const { data: latest } = await supabase.from('directories').select('files').eq('id', selectedDir.id).single();
    await supabase.from('directories').update({ files: (latest?.files ?? []).filter(f => f.url !== entry.url) }).eq('id', selectedDir.id);
    const tab = openTabs.find(t => t.file.url === entry.url);
    if (tab) closeTab(tab.id);
  }

  const activeDir = selectedDir ? (directories.find(d => d.id === selectedDir.id) ?? selectedDir) : null;
  const activeTab = openTabs.find(t => t.id === activeTabId) ?? null;

  // ── Render ───────────────────────────────────────
  return (
    <div className="dashboard">

      {/* ═══════ READER MODE ═══════ */}
      {tabsOpen && (
        <div className="reader-root">

          {/* Tab bar */}
          <div className="tab-bar">
            <button className="tab-back-btn" onClick={closeAllTabs}>← Back</button>

            {/* Scrollable tab list */}
            <div className="tab-list">
              {openTabs.map(tab => {
                const kind = detectFileType(tab.file.name, tab.file.type);
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    className={`tab-item${isActive ? ' active' : ''}`}
                    onClick={() => setActiveTabId(tab.id)}
                    title={tab.file.name}
                  >
                    <span className="tab-icon">{fileIcon(kind)}</span>
                    <span className="tab-label">{tab.file.name}</span>
                    <span className="tab-x" onClick={e => closeTab(tab.id, e)}>✕</span>
                  </div>
                );
              })}
            </div>

            {/* + Open button */}
            <button
              className="tab-add-btn"
              onClick={() => { setShowPicker(p => !p); setPickerExpanded(null); }}
            >
              {showPicker ? '✕ Close' : '＋ Open'}
            </button>
          </div>

          {/* File picker dropdown — rendered OUTSIDE tab-bar so z-index works */}
          {showPicker && (
            <div className="picker-container">
              <div className="picker-header">
                <span>Open file in new tab</span>
              </div>
              <div className="picker-body">
                {directories.length === 0 && <p className="picker-empty">No modules yet.</p>}
                {directories.map(dir => (
                  <div key={dir.id}>
                    <button
                      className={`picker-dir-btn${pickerExpanded === dir.id ? ' open' : ''}`}
                      onClick={() => setPickerExpanded(pickerExpanded === dir.id ? null : dir.id)}
                    >
                      <span>{pickerExpanded === dir.id ? '▾' : '▸'}</span>
                      <span className="picker-dir-name">{dir.name}</span>
                      <span className="picker-dir-count">{dir.files?.length ?? 0}</span>
                    </button>
                    {pickerExpanded === dir.id && (
                      <ul className="picker-file-list">
                        {(!dir.files || dir.files.length === 0) && (
                          <li className="picker-empty-item">No files</li>
                        )}
                        {(dir.files || []).map((file, i) => {
                          const kind = detectFileType(file.name, file.type);
                          const alreadyOpen = openTabs.some(t => t.file.url === file.url);
                          return (
                            <li
                              key={i}
                              className={`picker-file-item${alreadyOpen ? ' already-open' : ''}`}
                              onClick={() => openTab(file)}
                            >
                              <span>{fileIcon(kind)}</span>
                              <span className="picker-file-name">{file.name}</span>
                              {alreadyOpen && <span className="picker-open-badge">open</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PDF / file content area */}
          <div className="reader-body">
            {activeTab
              ? <TabPane key={activeTab.id} file={activeTab.file} />
              : <div className="tab-empty">No file selected</div>
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
              <p className="sidebar-label">MODULES</p>
              <form onSubmit={handleCreateDir} className="dir-form">
                <input type="text" className="dir-input" placeholder="New directory name"
                  value={newDirName} onChange={e => { setNewDirName(e.target.value); setDirError(''); }} />
                <button type="submit" className="dir-btn">Create Module</button>
              </form>
              {dirError && <p className="inline-error">{dirError}</p>}
              <ul className="dir-list">
                {directories.map(dir => (
                  <li key={dir.id}
                    className={`dir-item${selectedDir?.id === dir.id ? ' active' : ''}`}
                    onClick={() => { setSelectedDir(dir); setUploadError(''); }}
                  >
                    <span className="dir-icon">▸</span>
                    <span className="dir-name">{dir.name}</span>
                    <span className="dir-count">{dir.files?.length ?? 0}</span>
                    <button className="dir-delete" onClick={e => handleDeleteDir(dir, e)}>✕</button>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <main className="content">
            {!activeDir ? (
              <div className="content-empty"><p>Select a module to view assets.</p></div>
            ) : (
              <>
                <div className="content-header">
                  <span className="content-title">{activeDir.name}</span>
                  <button className="upload-btn" onClick={() => fileInputRef.current.click()}>
                    📤 Upload Asset / Log
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

                {!activeDir.files || activeDir.files.length === 0 ? (
                  <p className="no-files">No assets in this module.</p>
                ) : (
                  <div className="file-grid">
                    {activeDir.files.map((file, i) => {
                      const kind = detectFileType(file.name, file.type);
                      return (
                        <div key={i} className="file-card" onClick={() => openTab(file)}>
                          <div className="file-card-icon">{fileIcon(kind)}</div>
                          <div className="file-card-name" title={file.name}>{file.name}</div>
                          <span className={`type-badge type-${kind}`}>{kind.toUpperCase()}</span>
                          <div className="file-card-actions" onClick={e => e.stopPropagation()}>
                            <button className="action-btn render-btn" onClick={() => openTab(file)}>⬜ Open</button>
                            <a href={file.url} target="_blank" rel="noreferrer" className="action-btn fetch-btn">↓ Raw</a>
                            <button className="action-btn delete-btn" onClick={() => handleDeleteFile(file)}>🗑</button>
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
