import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, Bookmark, Check, ChevronDown, FileText,
  Headphones, Library, LoaderCircle, Minus, MoreHorizontal, Pause,
  PencilLine, Play, Plus, Search, Settings2, SkipBack, SkipForward, Trash2, Upload, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatTime, isIncluded, pageChunks, pageText, wordCount } from './lib/content';
import { deleteDocument, listDocuments, saveDocument } from './lib/storage';
import { scanPdf, type ScanProgress } from './lib/pdf';
import { Narrator, type SpeechStatus } from './lib/speech';
import { LocalVoice } from './lib/voice';
import { isUrlOnly } from './lib/urls';
import { AI_VOICES, DEFAULT_VOICE, validVoice } from './lib/voice-types';
import { DEFAULT_SETTINGS, REASON_LABELS, type DocumentRecord, type ScanSettings } from './types';
import SourcePreview from './components/SourcePreview';

const FILTERS: { key: keyof ScanSettings; title: string }[] = [
  { key: 'pageNumbers', title: 'Page numbers' },
  { key: 'repeatedMargins', title: 'Repeated headers and footers' },
  { key: 'decorative', title: 'Decorative marks' },
  { key: 'footnotes', title: 'Small-print footnotes' },
];
const LANGUAGES = [{ code: 'eng', name: 'English' }, { code: 'spa', name: 'Spanish' }, { code: 'fra', name: 'French' }, { code: 'deu', name: 'German' }, { code: 'ita', name: 'Italian' }, { code: 'por', name: 'Portuguese' }, { code: 'chi_sim', name: 'Chinese (simplified)' }, { code: 'jpn', name: 'Japanese' }, { code: 'kor', name: 'Korean' }];
type View = 'text' | 'source' | 'audit';
function stored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
}
function IconButton({ icon: Icon, label, onClick, disabled, className = '', active = false }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; className?: string; active?: boolean }) {
  return <button type="button" className={`icon-button ${className} ${active ? 'is-active' : ''}`} title={label} aria-label={label} aria-pressed={active || undefined} disabled={disabled} onClick={onClick}><Icon size={19} strokeWidth={1.7} /></button>;
}
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? 'on' : ''}`} onClick={onChange}><span /></button>;
}

const EMPTY_DOCUMENT: DocumentRecord = {
  id: '', title: '', filename: '', size: 0, createdAt: 0, updatedAt: 0,
  pages: [{ number: 1, width: 612, height: 792, source: 'text', blocks: [] }],
  position: { page: 0, chunk: 0 }, settings: { ...DEFAULT_SETTINGS }, bookmarkPages: [],
};
export default function App() {
  const [active, setActive] = useState<DocumentRecord>(EMPTY_DOCUMENT);
  const activeRef = useRef(active); activeRef.current = active;
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [view, setView] = useState<View>('text');
  const [rate, setRate] = useState<number>(() => stored('folio-rate', 1));
  const [volume, setVolume] = useState<number>(() => stored('folio-volume', 1));
  const [voiceURI, setVoiceURI] = useState<string>(() => validVoice(stored('folio-ai-voice', DEFAULT_VOICE)));
  const [voiceMessage, setVoiceMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<ScanProgress>();
  const [uploadName, setUploadName] = useState('');
  const [ocrLanguage, setOcrLanguage] = useState<string>(() => stored('folio-ocr-language', 'eng'));
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sleepUntil, setSleepUntil] = useState<number>();
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [passwordRequest, setPasswordRequest] = useState<{ incorrect: boolean; resolve: (password: string | null) => void }>();
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const narrator = useRef<Narrator | null>(null);
  const scanController = useRef<AbortController | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const liveChunkRef = useRef<HTMLButtonElement>(null);
  const chunkPages = useMemo(() => active.pages.map(p => pageChunks(p, active.settings)), [active.pages, active.settings]);
  const pageIndex = Math.min(active.position.page, active.pages.length - 1);
  const page = active.pages[pageIndex];
  const chunks = chunkPages[pageIndex] ?? [];
  const chunkIndex = active.position.chunk;
  const activeChunk = chunks[chunkIndex];
  const words = useMemo(() => chunkPages.map(cs => cs.reduce((n, c) => n + wordCount(c.text), 0)), [chunkPages]);
  const totalWords = words.reduce((sum, n) => sum + n, 0);
  const readWords = words.slice(0, pageIndex).reduce((sum, n) => sum + n, 0) + chunks.slice(0, chunkIndex).reduce((sum, c) => sum + wordCount(c.text), 0);
  const duration = totalWords / (165 * rate) * 60;
  const elapsed = status === 'finished' ? duration : readWords / (165 * rate) * 60;
  const skippedBlocks = page.blocks.filter(b => !isIncluded(b, active.settings));
  const bookmark = active.bookmarkPages.includes(pageIndex);

  const requestPassword = useCallback((incorrect: boolean) => new Promise<string | null>(resolve => {
    setPassword(''); setPasswordRequest({ incorrect, resolve });
  }), []);

  useEffect(() => {
    let disposed = false;
    void listDocuments().then(docs => {
      if (disposed) return;
      const library = docs.filter(d => d.id !== 'folio-demo');
      setDocuments(library);
      const lastId = stored<string>('folio-document', '');
      setActive(library.find(d => d.id === lastId) ?? library[0] ?? EMPTY_DOCUMENT);
      setReady(true);
    }).catch(() => { if (!disposed) { setError('Browser storage is unavailable. Your reading session will work, but changes may not be saved.'); setReady(true); } });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const player = new Narrator(new LocalVoice(), update => {
      setVoiceMessage(update.message ?? '');
      setStatus(update.status);
      setActive(doc => ({ ...doc, position: update.position }));
      if (update.error) setError(update.error);
    });
    narrator.current = player;
    return () => player.destroy();
  }, []);
  useEffect(() => {
    narrator.current?.configure(chunkPages, activeRef.current.position);
  }, [active.id, chunkPages]);
  useEffect(() => {
    narrator.current?.setOptions({ rate, volume, voiceURI });
    try { localStorage.setItem('folio-rate', JSON.stringify(rate)); localStorage.setItem('folio-volume', JSON.stringify(volume)); localStorage.setItem('folio-ai-voice', JSON.stringify(voiceURI)); } catch { /* Optional settings cache. */ }
  }, [rate, volume, voiceURI]);
  useEffect(() => {
    if (!ready || !active.id) return;
    const timeout = window.setTimeout(() => {
      const doc = { ...active, updatedAt: Date.now() };
      void saveDocument(doc).then(() => {
        setDocuments(previous => [doc, ...previous.filter(d => d.id !== doc.id)]);
      }).catch(() => setError('Could not save this session. Your browser storage may be full. Export your transcript before closing.'));
      try { localStorage.setItem('folio-document', JSON.stringify(doc.id)); } catch { /* IndexedDB is primary storage. */ }
    }, 350);
    return () => clearTimeout(timeout);
  }, [active, ready]);
  useEffect(() => {
    if (status === 'playing') liveChunkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [pageIndex, chunkIndex, status]);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 }); setEditing(false); setSearch('');
  }, [active.id, pageIndex]);
  useEffect(() => {
    if (!sleepUntil) { setSleepRemaining(0); return; }
    const tick = () => {
      const remaining = Math.ceil((sleepUntil - Date.now()) / 1000);
      setSleepRemaining(Math.max(0, remaining));
      if (remaining <= 0) { narrator.current?.pause(); setSleepUntil(undefined); setNotice('Sleep timer finished. Your place is saved.'); }
    };
    tick(); const interval = setInterval(tick, 1000); return () => clearInterval(interval);
  }, [sleepUntil]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    try { localStorage.setItem('folio-ocr-language', JSON.stringify(ocrLanguage)); } catch { /* Optional settings cache. */ }
  }, [ocrLanguage]);
  useEffect(() => {
    const persist = () => {
      const doc = activeRef.current;
      if (doc.id) void saveDocument({ ...doc, updatedAt: Date.now() }).catch(() => {});
    };
    window.addEventListener('pagehide', persist);
    return () => window.removeEventListener('pagehide', persist);
  }, []);
  useEffect(() => {
    if (!(showSettings || showHelp || showLibrary || editing || passwordRequest || progress || deleting)) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, [tabindex="0"]'));
    if (!dialog.contains(document.activeElement)) focusables()[0]?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const elements = focusables(); const first = elements[0]; const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      } else if (event.key === 'Escape') {
        if (passwordRequest) { passwordRequest.resolve(null); setPasswordRequest(undefined); scanController.current?.abort(); }
        else if (progress) scanController.current?.abort();
        else { setShowSettings(false); setShowHelp(false); setShowLibrary(false); setEditing(false); setDeleting(false); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, [showSettings, showHelp, showLibrary, editing, !!passwordRequest, !!progress, deleting]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); if (!scanController.current) inputRef.current?.click(); return; }
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button, [contenteditable="true"], [role="dialog"]')) return;
      if (showHelp || showSettings || showLibrary || editing || passwordRequest || progress || !activeRef.current.id) return;
      if (event.code === 'Space') { event.preventDefault(); narrator.current?.toggle(); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); narrator.current?.step(1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); narrator.current?.step(-1); }
      else if (event.key === '[') setRate(r => Math.max(.5, r - .25));
      else if (event.key === ']') setRate(r => Math.min(3, r + .25));
      else if (event.key === '?') setShowHelp(true);
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [showHelp, showSettings, showLibrary, editing, passwordRequest, progress]);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !active.id) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: active.title, artist: 'PDF reader', album: `Page ${pageIndex + 1}` });
    navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : 'paused';
    const handlers: [MediaSessionAction, () => void][] = [['play', () => narrator.current?.play()], ['pause', () => narrator.current?.pause()], ['previoustrack', () => narrator.current?.step(-1)], ['nexttrack', () => narrator.current?.step(1)]];
    for (const [action, handler] of handlers) { try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Browser supports a subset of media actions. */ } }
    return () => { for (const [action] of handlers) { try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Unsupported action. */ } } };
  }, [active.id, active.title, pageIndex, status]);

  const jumpPage = (index: number) => {
    if (index < 0 || index >= active.pages.length) return;
    narrator.current?.seek({ page: index, chunk: 0 }); setShowPages(false); setSearch('');
  };
  const openDocument = (doc: DocumentRecord) => {
    const current = activeRef.current;
    if (current.id) void saveDocument({ ...current, updatedAt: Date.now() }).catch(() => setError('Could not save the previous document.'));
    narrator.current?.stop(); setActive(doc); setShowLibrary(false); setView('text'); setShowMenu(false); setError('');
  };
  const updatePage = (transform: (page: typeof active.pages[number]) => typeof page) => {
    narrator.current?.pause();
    setActive(doc => ({ ...doc, position: { page: pageIndex, chunk: 0 }, pages: doc.pages.map((p, i) => i === pageIndex ? transform(p) : p) }));
  };
  const toggleBlock = (id: string) => updatePage(p => ({ ...p, blocks: p.blocks.map(b => b.id === id ? { ...b, override: !isIncluded(b, active.settings) } : b) }));
  const updateFilter = (key: keyof ScanSettings) => {
    narrator.current?.pause();
    setActive(doc => ({ ...doc, position: { ...doc.position, chunk: 0 }, settings: { ...doc.settings, [key]: !doc.settings[key] } }));
  };
  const importFile = async (file: File) => {
    if (scanController.current) return;
    setError(''); setShowLibrary(false);
    if (file.size > 100 * 1024 * 1024) { setError('This PDF is larger than 100 MB. Split it into smaller documents to scan comfortably in your browser.'); return; }
    const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
    if (!header.includes('%PDF-')) { setError('That file does not look like a PDF. Choose a file ending in .pdf.'); return; }
    narrator.current?.pause();
    const controller = new AbortController(); scanController.current = controller;
    setUploadName(file.name); setProgress({ page: 0, total: 1, stage: 'Opening your PDF' });
    try {
      const { pages, cover } = await scanPdf(file, { signal: controller.signal, language: ocrLanguage, onProgress: setProgress, onPassword: requestPassword });
      if (controller.signal.aborted) return;
      const doc: DocumentRecord = {
        id: crypto.randomUUID(), title: file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' '), filename: file.name,
        size: file.size, createdAt: Date.now(), updatedAt: Date.now(), pages, cover,
        settings: { ...DEFAULT_SETTINGS, ocrLanguage }, position: { page: 0, chunk: 0 }, bookmarkPages: [],
      };
      await saveDocument(doc, file); setActive(doc); setDocuments(previous => [doc, ...previous]); setView('text');
      setNotice(`${pages.length} pages ready.`);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? `Could not scan this PDF: ${err.message}. If it is scanned, check your connection for the initial OCR language download.` : 'Could not scan this PDF. Please try another file.');
    } finally { scanController.current = undefined; setProgress(undefined); }
  };
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); const files = event.dataTransfer.files; if (files.length > 1) { setError('Please import one PDF at a time.'); return; } if (files[0]) void importFile(files[0]); };
  const toggleBookmark = () => setActive(doc => ({ ...doc, bookmarkPages: bookmark ? doc.bookmarkPages.filter(p => p !== pageIndex) : [...doc.bookmarkPages, pageIndex].sort((a, b) => a - b) }));
  const downloadText = () => {
    const text = `${active.title}\n\n${active.pages.map(p => `— Page ${p.number} —\n\n${pageText(p, active.settings)}`).join('\n\n')}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${active.title}-narration.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setShowMenu(false);
  };
  const removeCurrent = async () => {
    narrator.current?.stop();
    const id = active.id;
    const rest = documents.filter(d => d.id !== id);
    const next = rest[0] ?? EMPTY_DOCUMENT;
    setActive(next); setDocuments(rest); setDeleting(false);
    await deleteDocument(id);
    if (!rest.length) { try { localStorage.removeItem('folio-document'); } catch { /* Optional cache. */ } }
    setNotice('Document removed from this browser.');
  };
  const filteredDocs = documents.filter(d => d.title.toLowerCase().includes(query.toLowerCase()));
  const groupedChunks = chunks.reduce<{ blockId: string; heading: boolean; indices: number[] }[]>((groups, chunk, index) => {
    const previous = groups.at(-1);
    if (previous?.blockId === chunk.blockId) previous.indices.push(index);
    else groups.push({ blockId: chunk.blockId, heading: chunk.heading, indices: [index] });
    return groups;
  }, []);

  return <div className="app" onDragOver={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
    <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Import PDF" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ''; }} />
    <header className="app-header"><span className="app-title"><Headphones size={17} /> PDF reader</span><div className="header-actions"><button className="open-button" disabled={!!progress} onClick={() => inputRef.current?.click()}><Plus size={15} /> Open PDF</button>{documents.length > 0 && <IconButton icon={Library} label="Library" onClick={() => setShowLibrary(true)} />}<IconButton icon={Settings2} label="Settings" onClick={() => setShowSettings(true)} /></div></header>
    <div className="workspace-scroll" ref={mainRef}>
      {error && <div className="error-banner" role="alert"><span>{error}</span><IconButton icon={X} label="Dismiss error" onClick={() => setError('')} /></div>}
      {!active.id ? <main className="empty-state"><button onClick={() => inputRef.current?.click()} className="empty-open"><FileText size={30} strokeWidth={1.2} /><span>Open a PDF</span></button><p>or drop one here</p><small>Processed and saved in this browser.</small></main> : <main className="reader">
        <div className="document-heading"><div><h1>{active.title}</h1><p>{active.pages.length} pages <span>·</span> {Math.ceil(duration / 60)} min estimated</p></div><div className="document-actions"><IconButton icon={Bookmark} label={bookmark ? 'Remove page bookmark' : 'Bookmark this page'} onClick={toggleBookmark} active={bookmark} /><div className="menu-wrap"><IconButton icon={MoreHorizontal} label="Document options" onClick={() => setShowMenu(v => !v)} />{showMenu && <><button className="dismiss-menu" aria-label="Close document menu" onClick={() => setShowMenu(false)} /><div className="dropdown"><button onClick={downloadText}><ArrowDownToLine size={15} /> Export transcript</button><button onClick={() => { setShowMenu(false); setDeleting(true); }}><Trash2 size={15} /> Remove document</button></div></>}</div></div></div>
        <div className="reader-toolbar"><div className="view-tabs" role="tablist" aria-label="Reading view"><button role="tab" aria-selected={view === 'text'} onClick={() => setView('text')}>Text</button><button role="tab" aria-selected={view === 'source'} onClick={() => setView('source')}>Page</button><button role="tab" aria-selected={view === 'audit'} onClick={() => setView('audit')}>Skipped <span>{skippedBlocks.length}</span></button></div><div className="toolbar-right">{view === 'text' && <><IconButton icon={Search} label="Find on this page" onClick={() => setSearch(v => v ? '' : ' ')} /><IconButton icon={PencilLine} label="Edit narration" onClick={() => { narrator.current?.pause(); setDraft(pageText(page, active.settings)); setEditing(true); }} /></>}<div className="page-picker menu-wrap"><button onClick={() => setShowPages(v => !v)} aria-expanded={showPages}>{page.number} / {active.pages.length}<ChevronDown size={13} /></button>{showPages && <><button className="dismiss-menu" aria-label="Close page list" onClick={() => setShowPages(false)} /><div className="dropdown page-list">{active.pages.map((p, index) => <button key={p.number} className={index === pageIndex ? 'selected-page' : ''} onClick={() => jumpPage(index)}><span>Page {p.number}</span><span className="page-title">{p.blocks.find(b => b.heading)?.text}</span>{active.bookmarkPages.includes(index) && <Bookmark size={12} />}</button>)}</div></>}</div></div></div>
        {view === 'text' && <article className="reading-text" aria-label={`Narration for page ${page.number}`}>
          {!!search && <label className="page-search"><Search size={15} /><input autoFocus aria-label="Find words on page" placeholder="Find on this page" value={search.trimStart()} onChange={e => setSearch(e.target.value || ' ')} /><button aria-label="Close search" onClick={() => setSearch('')}><X size={15} /></button></label>}
          {page.warning && <p className="inline-warning">{page.warning}</p>}
          {page.editedText !== undefined && <div className="edited-badge">Edited narration <button onClick={() => updatePage(p => ({ ...p, editedText: undefined }))}>Reset</button></div>}
          <div className="narration">{groupedChunks.map(group => <p className={`narration-paragraph ${group.heading ? 'heading' : ''}`} key={group.blockId}>{group.indices.map(index => {
            const chunk = chunks[index]; const current = index === chunkIndex;
            const found = !!search.trim() && chunk.text.toLowerCase().includes(search.trim().toLowerCase());
            return <button key={index} ref={current ? liveChunkRef : undefined} className={`narration-sentence ${current ? 'current' : ''} ${found ? 'found' : ''}`} onClick={() => narrator.current?.seek({ page: pageIndex, chunk: index }, true)} aria-label={`Read: ${chunk.text}`} aria-current={current ? 'true' : undefined}>{chunk.text}</button>;
          })}</p>)}</div>
          {search.trim() && !chunks.some(c => c.text.toLowerCase().includes(search.trim().toLowerCase())) && <p className="muted small">No matches on this page.</p>}
          {!chunks.length && <div className="no-content"><p>No narration on this page.</p><button className="secondary-button" onClick={() => setView('audit')}>Review skipped content</button></div>}
          <div className="page-footnote">Page {page.number}{page.source === 'ocr' && <span> · OCR</span>}</div>
        </article>}
        {view === 'source' && <SourcePreview documentId={active.id} page={page} settings={active.settings} activeBlock={activeChunk?.blockId} onToggle={toggleBlock} onPassword={requestPassword} />}
        {view === 'audit' && <section className="audit-panel"><div className="audit-heading"><p>Include or skip any region. <button onClick={() => setShowSettings(true)}>Change filters</button></p></div>{page.editedText !== undefined && <p className="inline-warning">Edited narration is active. Reset it in Text to apply these selections.</p>}<div className="audit-blocks">{page.blocks.map(block => { const included = isIncluded(block, active.settings); return <div className={`audit-block ${included ? '' : 'skipped'}`} key={block.id}><div><span className="audit-tag">{included ? 'Included' : block.reason ? REASON_LABELS[block.reason] : 'Skipped'}{block.override !== undefined && ' · Manual'}</span><p>{block.text}</p></div><button className="region-toggle" disabled={isUrlOnly(block.text)} title={isUrlOnly(block.text) ? 'URLs are never narrated' : undefined} onClick={() => toggleBlock(block.id)}>{included ? <Minus size={13} /> : <Plus size={13} />}{isUrlOnly(block.text) ? 'URL' : included ? 'Skip' : 'Include'}</button></div>; })}</div></section>}
        <nav className="page-navigation" aria-label="Pages"><button disabled={pageIndex === 0} onClick={() => jumpPage(pageIndex - 1)}><ArrowLeft size={15} /> Previous</button><span>{page.number} / {active.pages.length}</span><button disabled={pageIndex === active.pages.length - 1} onClick={() => jumpPage(pageIndex + 1)}>Next <ArrowRight size={15} /></button></nav>
      </main>}
    </div>
    {!!active.id && <footer className="player" aria-label="Audio player">{status === 'loading' && <div className="voice-progress" role="status">{voiceMessage || 'Preparing audio'}</div>}<div className="player-inner"><div className="playback-controls"><IconButton icon={SkipBack} label="Previous sentence" onClick={() => narrator.current?.step(-1)} disabled={pageIndex === 0 && chunkIndex === 0} /><button className="play-button" aria-label={status === 'playing' || status === 'loading' ? 'Pause narration' : 'Play narration'} onClick={() => narrator.current?.toggle()}>{status === 'loading' ? <LoaderCircle size={19} className="spin" /> : status === 'playing' ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><IconButton icon={SkipForward} label="Next sentence" onClick={() => narrator.current?.step(1)} /></div><div className="player-progress"><span>{formatTime(elapsed)}</span><input aria-label="Reading progress" type="range" min={0} max={Math.max(1, chunkPages.reduce((n, cs) => n + cs.length, 0) - 1)} value={chunkPages.slice(0, pageIndex).reduce((n, cs) => n + cs.length, 0) + chunkIndex} style={{ '--progress': `${duration ? elapsed / duration * 100 : 0}%` } as React.CSSProperties} onChange={e => { let target = Number(e.target.value); let p = 0; while (p < chunkPages.length - 1 && target >= chunkPages[p].length) { target -= chunkPages[p].length; p++; } narrator.current?.seek({ page: p, chunk: target }); }} /><span title="Estimated duration">{formatTime(duration)}</span></div><select className="speed-select" aria-label="Playback speed" value={rate} onChange={e => setRate(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,1.75,2,2.25,2.5,2.75,3].map(r => <option key={r} value={r}>{r}×</option>)}</select><span className="playback-state" role="status">{sleepUntil ? formatTime(sleepRemaining) + ' timer' : status === 'finished' ? 'Finished' : `Page ${page.number}`}</span></div></footer>}
    {notice && <div className="toast" role="status"><Check size={15} />{notice}</div>}
    {dragging && <div className="drop-overlay"><Upload size={28} /><p>Drop PDF to open</p></div>}
    {progress && <div className="modal-backdrop"><section className="modal scan-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title"><LoaderCircle size={23} className="spin" /><h2 id="scan-title">Scanning PDF</h2><p className="upload-filename">{uploadName}</p><div className="scan-progress-track"><span style={{ width: `${Math.max(3, (progress.page - 1 + (progress.fraction ?? .5)) / progress.total * 100)}%` }} /></div><div className="scan-progress-label"><span>{progress.stage}</span><span>{Math.max(1, progress.page)} / {progress.total}</span></div><button className="secondary-button" onClick={() => { scanController.current?.abort(); setNotice('Scan cancelled.'); }}>Cancel</button></section></div>}
    {showLibrary && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowLibrary(false); }}><section className="modal library-modal" role="dialog" aria-modal="true" aria-labelledby="library-title"><IconButton icon={X} label="Close library" className="close-modal" onClick={() => setShowLibrary(false)} /><h2 id="library-title">Library</h2><label className="page-search"><Search size={15} /><input autoFocus aria-label="Search library" placeholder="Search documents" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="library-list">{filteredDocs.map(doc => <button key={doc.id} className={`document-item ${active.id === doc.id ? 'selected' : ''}`} onClick={() => openDocument(doc)}><FileText size={18} /><span><strong>{doc.title}</strong><small>{doc.pages.length} pages · Page {doc.position.page + 1}{doc.bookmarkPages.length ? ` · ${doc.bookmarkPages.length} bookmarks` : ''}</small></span>{active.id === doc.id && <Check size={15} />}</button>)}{!filteredDocs.length && <p className="muted small">No matching documents.</p>}</div></section></div>}
    {showSettings && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}><section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><IconButton icon={X} label="Close settings" className="close-modal" onClick={() => setShowSettings(false)} /><h2 id="settings-title">Settings</h2><label className="setting-field"><span>Voice</span><select value={voiceURI} onChange={e => setVoiceURI(e.target.value)}>{AI_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select><small>Kokoro AI · English voices, generated on this device. First play downloads the model (about 90–330 MB).</small></label><div className="settings-pair"><label className="setting-field"><span>Volume</span><input type="range" aria-label="Volume" min={0} max={1} step={.05} value={volume} onChange={e => setVolume(Number(e.target.value))} /></label><label className="setting-field"><span>Sleep timer</span><select aria-label="Sleep timer" value={sleepUntil ? 'active' : 'off'} onChange={e => { if (e.target.value === 'off') setSleepUntil(undefined); else if (e.target.value !== 'active') setSleepUntil(Date.now() + Number(e.target.value) * 60_000); }}><option value="off">Off</option>{sleepUntil && <option value="active">{formatTime(sleepRemaining)} left</option>}{[5,15,30,60].map(m => <option key={m} value={m}>{m} minutes</option>)}</select></label></div><label className="setting-field"><span>OCR language for next import</span><select value={ocrLanguage} onChange={e => setOcrLanguage(e.target.value)}>{LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select><small>Scanned pages need a language download on first use.</small></label>{!!active.id && <div className="filter-settings"><h3>Skip when reading</h3>{FILTERS.map(({ key, title }) => <div className="filter-row" key={key}><span>{title}</span><Toggle checked={!!active.settings[key]} onChange={() => updateFilter(key)} label={`Skip ${title.toLowerCase()}`} /></div>)}<small>URLs are never narrated, including links in body text and edits. Filters use layout and repetition; review mistakes in Skipped.</small></div>}<button className="text-link" onClick={() => { setShowSettings(false); setShowHelp(true); }}>Keyboard shortcuts & notes</button></section></div>}
    {showHelp && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowHelp(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><IconButton icon={X} label="Close help" className="close-modal" onClick={() => setShowHelp(false)} /><h2 id="help-title">Shortcuts & notes</h2><div className="shortcut-grid"><span>Play / pause <kbd>space</kbd></span><span>Previous / next sentence <span><kbd>←</kbd> <kbd>→</kbd></span></span><span>Slower / faster <span><kbd>[</kbd> <kbd>]</kbd></span></span><span>Open PDF <kbd>⌘ / ctrl O</kbd></span></div><p>Click any sentence to read from there. Playback continues across pages. Pause resumes at the same audio position. After a reload, playback starts at the saved sentence.</p><p>Originals, edits, and progress are saved in this browser. Clearing site data removes the library.</p><p>Complex tables, equations, and unusual layouts may need manual editing. Mixed image-and-text pages may need review.</p><p>Keep the tab open. Background playback depends on the browser. You can export the clean transcript. Sentence highlighting is approximate within each generated passage.</p></section></div>}
    {editing && <div className="modal-backdrop"><section className="modal edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title"><IconButton icon={X} label="Cancel editing" className="close-modal" onClick={() => setEditing(false)} /><h2 id="edit-title">Edit page {page.number}</h2><textarea autoFocus aria-label="Narration text" value={draft} onChange={e => setDraft(e.target.value)} /><div className="edit-actions"><button className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button className="primary-button" onClick={() => { updatePage(p => ({ ...p, editedText: draft })); setEditing(false); setNotice('Narration saved.'); }}>Save</button></div></section></div>}
    {passwordRequest && <div className="modal-backdrop password-backdrop"><form className="modal" role="dialog" aria-modal="true" aria-labelledby="password-title" onSubmit={e => { e.preventDefault(); passwordRequest.resolve(password); setPasswordRequest(undefined); setPassword(''); }}><h2 id="password-title">PDF password</h2><p>{passwordRequest.incorrect ? 'Incorrect password. Try again.' : 'This document is password-protected. The password is only kept in memory.'}</p><input autoFocus required className="password-input" aria-label="PDF password" type="password" value={password} onChange={e => setPassword(e.target.value)} /><div className="edit-actions"><button type="button" className="secondary-button" onClick={() => { passwordRequest.resolve(null); setPasswordRequest(undefined); scanController.current?.abort(); }}>Cancel</button><button type="submit" className="primary-button">Open</button></div></form></div>}
    {deleting && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Remove document?</h2><p>Remove “{active.title}” and its progress from this browser? Your original file is unaffected.</p><div className="edit-actions"><button className="secondary-button" onClick={() => setDeleting(false)}>Cancel</button><button className="primary-button danger" onClick={() => { void removeCurrent().catch(() => setError('Could not remove the document.')); }}>Remove</button></div></section></div>}
  </div>;
}
