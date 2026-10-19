import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Download, FilePlus2, FileText, FolderOpen, Highlighter, Layers, LockKeyhole, Maximize, Minus, Moon, MousePointer2, PenLine, PenTool, Plus, Printer, Redo2, RotateCw, Search, ShieldCheck, Sparkles, Sun, Trash2, Type, Undo2, Upload, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import interFontUrl from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import { createWelcomePdf, exportPdf, MAX_FILE_SIZE, uid } from './pdf-engine';
import { loadSource, pdfjs } from './pdf-loader';
import { useHistory } from './useHistory';
import { PageView, Thumbnail } from './components/PageView';
import SignatureDialog, { SignaturePreview } from './components/SignatureDialog';
import { loadSignature, saveSignature } from './signature';
import type { Mark, PageModel, Signature, Source, Tool } from './types';

const toolItems: { id: Tool; label: string; icon: LucideIcon; hint: string }[] = [
  { id: 'select', label: 'Seleziona', icon: MousePointer2, hint: 'Seleziona il testo del PDF o trascina una tua annotazione.' },
  { id: 'text', label: 'Testo', icon: Type, hint: 'Scrivi qui sotto, poi fai clic sulla pagina per inserire il testo.' },
  { id: 'highlight', label: 'Evidenzia', icon: Highlighter, hint: 'Trascina sulla pagina per evidenziare una zona.' },
  { id: 'draw', label: 'Disegna', icon: PenLine, hint: 'Disegna liberamente sulla pagina con il mouse o la penna.' },
  { id: 'signature', label: 'Firma', icon: PenTool, hint: 'Crea la firma, poi fai clic sul documento per inserirla.' },
];
const colors = ['#5746d8', '#202b3d', '#2563eb', '#e05d62', '#f2c94c', '#53b997'];
const markNames: Record<Mark['kind'], string> = { text: 'Testo', highlight: 'Evidenziazione', draw: 'Disegno', signature: 'Firma' };
type SearchHit = { page: number; snippet: string };
function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) { return <button className="icon-button" title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>; }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Qualcosa non ha funzionato. Riprova.';

export default function App() {
  const history = useHistory();
  const { pages, commit } = history;
  const [sources, setSources] = useState<Map<string, Source>>(new Map());
  const sourceRef = useRef(sources); sourceRef.current = sources;
  const [fileName, setFileName] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#5746d8');
  const [fontSize, setFontSize] = useState(16);
  const [strokeSize, setStrokeSize] = useState(2);
  const [text, setText] = useState('');
  const [zoom, setZoom] = useState(0.85);
  const [selected, setSelected] = useState<string | null>(null);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [signatureReady, setSignatureReady] = useState(false);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureDialog, setSignatureDialog] = useState(false);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [savedState, setSavedState] = useState('[]');
  const [sidebarTab, setSidebarTab] = useState<'pages' | 'search'>('pages');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [theme, setTheme] = useState('light');
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null), appendMode = useRef(false), workspace = useRef<HTMLDivElement>(null);
  const textCache = useRef(new Map<string, string>());
  const page = pages[Math.min(activeIndex, pages.length - 1)];
  const source = page ? sources.get(page.sourceId) : undefined;
  const readOnly = [...sources.values()].find(s => s.readOnlyReason)?.readOnlyReason;
  const activeMark = page?.marks.find(m => m.id === selected);
  const dirty = JSON.stringify(pages) !== savedState;
  const showError = useCallback((message: string) => setNotice({ text: message, error: true }), []);
  useEffect(() => {
    let canceled = false;
    loadSignature().then(value => { if (!canceled) setSignature(value); }).catch(() => { if (!canceled) showError('Non riesco a leggere la firma salvata. Puoi crearne una nuova.'); }).finally(() => { if (!canceled) setSignatureReady(true); });
    return () => { canceled = true; };
  }, [showError]);
  const forgetSignature = async () => {
    setSignatureSaving(true);
    try { await saveSignature(null); setSignature(null); setNotice({ text: 'Firma salvata eliminata. Le firme già inserite nel PDF restano al loro posto.', error: false }); }
    catch (error) { showError(errorText(error)); }
    finally { setSignatureSaving(false); }
  };
  const notify = (message: string) => setNotice({ text: message, error: false });
  useEffect(() => { if (!notice || notice.error) return; const id = setTimeout(() => setNotice(null), 4500); return () => clearTimeout(id); }, [notice]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    window.folio?.dirty(dirty);
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty && !window.folio) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useEffect(() => { setSelected(null); }, [activeIndex]);
  useEffect(() => { setActiveIndex(i => Math.min(i, Math.max(0, pages.length - 1))); }, [pages.length]);
  const run = async (label: string, work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label);
    try { await work(); } catch (error) { showError(errorText(error)); }
    finally { busyRef.current = false; setBusy(''); }
  };
  const openBytes = async (name: string, bytes: Uint8Array, append: boolean) => {
    if (!append && dirty && !window.confirm('Aprire un altro documento e scartare le modifiche non salvate?')) return;
    const nextSource = await loadSource(name, bytes);
    if (append && nextSource.readOnlyReason) { await nextSource.pdf.destroy(); throw new Error('Questo PDF contiene moduli, campi firma o elementi non modificabili e non può essere unito. Aprilo da solo per leggerlo.'); }
    const newPages: PageModel[] = Array.from({ length: nextSource.pdf.numPages }, (_, index) => ({ id: uid(), sourceId: nextSource.id, index, rotation: 0, marks: [] }));
    if (append && pages.length) {
      setSources(previous => new Map([...previous, [nextSource.id, nextSource]]));
      commit(previous => [...previous, ...newPages]); setActiveIndex(pages.length);
      notify(`${newPages.length} pagine aggiunte`);
    } else {
      const old = sourceRef.current;
      setSources(new Map([[nextSource.id, nextSource]]));
      history.reset(newPages); setSavedState(JSON.stringify(newPages));
      setFileName(name); setActiveIndex(0); setSelected(null); setTool('select'); setQuery(''); setHits([]); textCache.current.clear();
      // Existing render effects are canceled before the old documents are destroyed.
      setTimeout(() => { for (const item of old.values()) void item.pdf.destroy(); }, 250);
    }
  };
  const fileOpen = (append = false) => {
    if (busyRef.current || (append && readOnly)) return;
    if (window.folio) void run('Apertura documento…', async () => {
      const file = await window.folio!.open(); if (file) await openBytes(file.name, new Uint8Array(file.bytes), append);
    });
    else { appendMode.current = append; input.current?.click(); }
  };
  const localFile = (file: File, append: boolean) => run('Apertura documento…', async () => {
    if (file.size > MAX_FILE_SIZE) throw new Error('Il limite per ogni PDF è 150 MB.');
    await openBytes(file.name, new Uint8Array(await file.arrayBuffer()), append);
  });
  const demo = () => run('Preparazione documento…', async () => openBytes('Benvenuto in JFolio.pdf', await createWelcomePdf(), false));
  const editPage = (fn: (p: PageModel) => PageModel) => commit(previous => previous.map(p => p.id === page.id ? fn(p) : p));
  const addMark = (mark: Mark) => { editPage(p => ({ ...p, marks: [...p.marks, mark] })); setSelected(mark.id); setTool('select'); };
  const updateMark = (updates: Partial<Mark>) => {
    if (!activeMark) return;
    const next = { ...activeMark, ...updates };
    if (next.kind === 'text' && ('text' in updates || 'size' in updates)) {
      const measure = document.createElement('canvas').getContext('2d')!;
      measure.font = `400 ${next.size}px Inter`;
      const oldMeasure = document.createElement('canvas').getContext('2d')!;
      oldMeasure.font = `400 ${activeMark.size}px Inter`;
      const oldWidth = Math.max(1, ...String(activeMark.text).split('\n').map(line => oldMeasure.measureText(line).width));
      const newWidth = Math.max(1, ...String(next.text).split('\n').map(line => measure.measureText(line).width));
      next.width = Math.min(0.95, activeMark.width * newWidth / oldWidth);
      next.height = activeMark.height * (String(next.text).split('\n').length * next.size) / (String(activeMark.text).split('\n').length * activeMark.size);
      if (next.height > 0.95 || activeMark.width * newWidth / oldWidth > 0.95) { showError('Il testo è troppo grande: riduci la dimensione o inserisci delle righe.'); return; }
      next.x = Math.min(next.x, 1 - next.width); next.y = Math.min(next.y, 1 - next.height);
    }
    editPage(p => ({ ...p, marks: p.marks.map(m => m.id === selected ? next : m) }));
  };
  const removeMark = () => { if (!selected) return; editPage(p => ({ ...p, marks: p.marks.filter(m => m.id !== selected) })); setSelected(null); };
  const changeTool = (next: Tool) => { setTool(next); setSelected(null); if (next === 'highlight') setColor('#f2c94c'); else if (next === 'signature') setColor('#202b3d'); };
  const movePage = (delta: number) => {
    const nextIndex = activeIndex + delta; if (nextIndex < 0 || nextIndex >= pages.length) return;
    const copy = [...pages]; [copy[activeIndex], copy[nextIndex]] = [copy[nextIndex], copy[activeIndex]]; commit(copy); setActiveIndex(nextIndex);
  };
  const duplicatePage = () => { const copy = [...pages]; copy.splice(activeIndex + 1, 0, { ...page, id: uid(), marks: page.marks.map(m => ({ ...m, id: uid() })) }); commit(copy); setActiveIndex(activeIndex + 1); };
  const deletePage = () => { if (pages.length < 2) return; commit(pages.filter(p => p.id !== page.id)); setSelected(null); };
  const fit = async () => {
    if (!source || !page || !workspace.current) return;
    const pdfPage = await source.pdf.getPage(page.index + 1);
    const v = pdfPage.getViewport({ scale: 1, rotation: pdfPage.rotate + page.rotation });
    setZoom(Math.max(0.25, Math.min(2.5, (workspace.current.clientWidth - 80) / v.width, (workspace.current.clientHeight - 75) / v.height)));
  };
  const getBytes = async () => {
    const response = await fetch(interFontUrl); if (!response.ok) throw new Error('Il font locale non è disponibile.');
    return exportPdf(pages, sources, new Uint8Array(await response.arrayBuffer()));
  };
  const download = (bytes: Uint8Array, name: string) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const save = () => run('Preparazione della copia…', async () => {
    if (!pages.length || readOnly) return;
    const bytes = await getBytes();
    const name = fileName.replace(/\.pdf$/i, '') + '-modificato.pdf';
    if (window.folio) { if (!(await window.folio.save(name, bytes))) return; notify('Copia salvata'); }
    else { download(bytes, name); notify('Copia PDF pronta: controlla i download del browser'); }
    setSavedState(JSON.stringify(pages));
  });
  const print = () => run('Preparazione delle pagine per la stampa…', async () => {
    if (!pages.length) return;
    const root = document.getElementById('print-root')!; root.replaceChildren();
    let printDoc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> | undefined;
    try {
      const assetBase = new URL('./pdf-assets/', document.baseURI).href;
      printDoc = await pdfjs.getDocument({ data: readOnly ? source!.bytes.slice() : await getBytes(), useSystemFonts: true, cMapUrl: assetBase + 'cmaps/', cMapPacked: true, standardFontDataUrl: assetBase + 'standard_fonts/', wasmUrl: assetBase + 'wasm/' }).promise;
      for (let i = 1; i <= printDoc.numPages; i++) {
        setBusy(`Preparazione stampa · ${i} / ${printDoc.numPages}`);
        const p = await printDoc.getPage(i), v = p.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(v.width); canvas.height = Math.ceil(v.height);
        await p.render({ canvas, viewport: v }).promise;
        const img = new Image(); img.src = canvas.toDataURL('image/png'); img.alt = `Pagina ${i}`;
        await img.decode(); const sheet = document.createElement('section'); sheet.className = 'print-sheet'; sheet.append(img); root.append(sheet);
        canvas.width = 0; canvas.height = 0;
      }
      if (window.folio) { const result = await window.folio.print(); if (!result.success && result.reason && !/cancel/i.test(result.reason)) throw new Error(`Stampa non riuscita: ${result.reason}`); }
      else window.print();
    } finally { await printDoc?.destroy(); root.replaceChildren(); }
  });
  useEffect(() => {
    let canceled = false;
    if (!query.trim()) { setHits([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      const search = async () => {
        const results: SearchHit[] = [];
        for (let i = 0; i < pages.length; i++) {
          if (canceled) return;
          const p = pages[i], key = `${p.sourceId}:${p.index}`;
          if (!textCache.current.has(key)) {
            const content = await (await sources.get(p.sourceId)!.pdf.getPage(p.index + 1)).getTextContent();
            textCache.current.set(key, content.items.map(item => 'str' in item ? item.str : '').join(' '));
          }
          const full = textCache.current.get(key)! + ' ' + p.marks.map(m => m.text || '').join(' ');
          const at = full.toLocaleLowerCase().indexOf(query.toLocaleLowerCase().trim());
          if (at >= 0) results.push({ page: i, snippet: `${at > 40 ? '…' : ''}${full.slice(Math.max(0, at - 40), at + 100)}…` });
        }
        if (!canceled) { setHits(results); setSearching(false); }
      };
      search().catch(() => { if (!canceled) { setSearching(false); showError('La ricerca non è disponibile per alcune pagine.'); } });
    }, 250);
    return () => { canceled = true; clearTimeout(timer); };
  }, [query, pages, sources, showError]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (signatureDialog || busyRef.current) return;
      const target = event.target as HTMLElement;
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 's') { event.preventDefault(); if (pages.length && !readOnly) void save(); }
        if (event.key.toLowerCase() === 'o') { event.preventDefault(); fileOpen(); }
        if (event.key.toLowerCase() === 'p') { event.preventDefault(); if (pages.length) void print(); }
        if (event.key.toLowerCase() === 'f') { event.preventDefault(); setSidebarTab('search'); document.getElementById('search-pdf')?.focus(); }
        if (event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); event.shiftKey ? history.redo() : history.undo(); setSelected(null); }
        if (event.key.toLowerCase() === 'y' && !editing) { event.preventDefault(); history.redo(); setSelected(null); }
      } else if (!editing) {
        if (event.key === 'Delete' && selected) { event.preventDefault(); removeMark(); }
        if (event.key === 'Escape') { setTool('select'); setSelected(null); }
      }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  const enabled = pages.length > 0 && !readOnly;
  const currentTool = toolItems.find(t => t.id === tool)!;
  const totalMarks = pages.reduce((count, p) => count + p.marks.length, 0);
  return <div className={`app ${dragOver ? 'drag-over' : ''}`} onDragOver={e => { e.preventDefault(); if (signatureDialog) return; if (e.dataTransfer.types.includes('Files')) setDragOver(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }} onDrop={e => { e.preventDefault(); setDragOver(false); if (signatureDialog) return; if (e.dataTransfer.files.length > 1) { showError('Apri un PDF alla volta. Per unirne altri usa “Aggiungi PDF”.'); return; } const file = e.dataTransfer.files[0]; if (file) void localFile(file, false); }}>
    <input ref={input} hidden type="file" accept="application/pdf,.pdf" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void localFile(file, appendMode.current); }} />
    <header className="app-header">
      <div className="brand"><img className="brand-logo" src="./favicon.svg" alt="" /><strong>JFolio<span>.</span></strong><span className="beta">PREVIEW</span></div>
      <div className="header-center"><span className="status-dot" />Il tuo spazio, in locale</div>
      <div className="header-actions"><IconButton label={theme === 'light' ? 'Tema scuro' : 'Tema chiaro'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</IconButton><span className="header-divider" /><span className="local-badge"><LockKeyhole size={14} />Solo sul tuo PC</span></div>
    </header>
    <div className="app-body">
      <aside className="sidebar">
        <button className="open-button" onClick={() => fileOpen()}><FolderOpen size={18} />Apri un PDF<span>Ctrl O</span></button>
        <div className="sidebar-tabs"><button className={sidebarTab === 'pages' ? 'active' : ''} onClick={() => setSidebarTab('pages')}><Layers size={15} />Pagine{pages.length > 0 && <span>{pages.length}</span>}</button><button className={sidebarTab === 'search' ? 'active' : ''} onClick={() => setSidebarTab('search')} aria-label="Cerca nel PDF"><Search size={17} /></button></div>
        <div className="sidebar-content">
          {sidebarTab === 'pages' ? pages.length ? <div className="thumbnail-list">{pages.map((p, i) => <Thumbnail key={p.id} source={sources.get(p.sourceId)!} page={p} index={i} active={i === activeIndex} onClick={() => setActiveIndex(i)} />)}</div> : <div className="sidebar-empty"><FileText size={32} strokeWidth={1.2} /><p>Ogni idea comincia<br />da una pagina.</p><span>I tuoi documenti appariranno qui.</span></div> : <div className="search-panel"><label htmlFor="search-pdf">Cerca nel documento</label><div className="search-input"><Search size={15} /><input id="search-pdf" type="search" placeholder="Una parola, una frase…" value={query} onChange={e => setQuery(e.target.value)} /></div><span className="search-count">{searching ? 'Ricerca…' : query ? `${hits.length} pagine trovate` : 'Il testo delle scansioni richiede OCR.'}</span>{hits.map(hit => <button key={hit.page} className="search-hit" onClick={() => setActiveIndex(hit.page)}><strong>Pagina {hit.page + 1}</strong><span>{hit.snippet}</span></button>)}</div>}
        </div>
        {enabled && <button className="append-button" onClick={() => fileOpen(true)}><FilePlus2 size={16} />Aggiungi PDF</button>}
        <div className="privacy-card"><ShieldCheck size={20} /><div><strong>Un po’ più tuo.</strong><p>Nessun upload.<br />Nessun account richiesto.</p></div></div>
      </aside>
      <main className="main">
        <div className="document-header"><div className="document-title"><span className="file-icon"><FileText size={20} /></span><div><h1 title={fileName}>{fileName || 'Il tuo prossimo documento'}</h1><p>{pages.length ? `${pages.length} pagine · ${readOnly ? 'Sola lettura' : dirty ? 'Modifiche non salvate' : 'Pronto per lavorare'}` : 'Un posto semplice per fare di più con i tuoi PDF.'}</p></div>{dirty && <i className="unsaved-dot" title="Modifiche non salvate" />}</div><div className="document-actions"><button aria-label="Stampa" className="button print-button" disabled={!pages.length} onClick={() => void print()}><Printer size={16} /><span>Stampa</span></button><button className="button primary" disabled={!enabled} onClick={() => void save()}><Download size={16} />Salva copia</button></div></div>
        <div className="toolbar"><div className="tool-list">{toolItems.map(item => <button key={item.id} aria-label={item.label} className={`tool-button ${tool === item.id ? 'active' : ''}`} disabled={!pages.length || (!!readOnly && item.id !== 'select')} onClick={() => changeTool(item.id)} title={item.hint}><item.icon size={17} /><span>{item.label}</span></button>)}</div><div className="history-buttons"><IconButton label="Annulla (Ctrl Z)" onClick={() => { history.undo(); setSelected(null); }} disabled={!history.canUndo}><Undo2 size={17} /></IconButton><IconButton label="Ripristina (Ctrl Shift Z)" onClick={() => { history.redo(); setSelected(null); }} disabled={!history.canRedo}><Redo2 size={17} /></IconButton></div></div>
        {readOnly && <div className="readonly-banner"><LockKeyhole size={16} />{readOnly}</div>}
        <div className="workspace" ref={workspace} onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          {page && source ? <div className="page-wrap"><PageView source={source} page={page} zoom={zoom} tool={tool} color={color} size={tool === 'draw' ? strokeSize : fontSize} text={text} signature={signature} selected={selected} onSelect={setSelected} onAdd={addMark} onMove={(id, x, y) => editPage(p => ({ ...p, marks: p.marks.map(m => m.id === id ? { ...m, x, y } : m) }))} onError={showError} /><div className="page-caption">{activeIndex + 1} / {pages.length}</div></div> : <div className="welcome">
            <span className="eyebrow"><Sparkles size={14} />MENO ATTRITO. PIÙ IDEE.</span>
            <h2>I tuoi PDF.<br /><em>Una nuova prospettiva.</em></h2>
            <p>Leggi, annota e firma in uno spazio pensato per te.<br />Semplice da usare. Bello da abitare.</p>
            <button className="dropzone" onClick={() => fileOpen()}><span className="upload-illustration"><FileText size={45} strokeWidth={1.3} /><i><Plus size={17} /></i></span><strong>Trascina qui il tuo PDF</strong><span>oppure scegli un file dal computer</span><b><FolderOpen size={16} />Sfoglia i documenti<ArrowUpRight size={16} /></b><small>PDF fino a 150 MB · elaborazione locale</small></button>
            <button className="demo-button" onClick={() => void demo()}>Vuoi dare un’occhiata? <strong>Prova un documento <ArrowUpRight size={14} /></strong></button>
            <div className="feature-row"><span><Highlighter size={17} />Evidenzia le idee</span><span><PenTool size={17} />Lascia il tuo segno</span><span><Layers size={17} />Metti tutto in ordine</span></div>
          </div>}
        </div>
        <footer className="viewer-footer"><div className="page-navigation"><IconButton label="Pagina precedente" disabled={activeIndex === 0 || !pages.length} onClick={() => setActiveIndex(i => i - 1)}><ChevronLeft size={16} /></IconButton><span>Pagina <strong>{pages.length ? activeIndex + 1 : '—'}</strong> di {pages.length || '—'}</span><IconButton label="Pagina successiva" disabled={!pages.length || activeIndex >= pages.length - 1} onClick={() => setActiveIndex(i => i + 1)}><ChevronRight size={16} /></IconButton></div><span className="footer-middle">{pages.length ? `${totalMarks} annotazioni` : 'Fatto per concentrarti.'}</span><div className="zoom-controls"><IconButton label="Riduci zoom" disabled={!pages.length || zoom <= 0.25} onClick={() => setZoom(z => Math.max(0.25, z - 0.1))}><Minus size={15} /></IconButton><span>{Math.round(zoom * 100)}%</span><IconButton label="Aumenta zoom" disabled={!pages.length || zoom >= 2.5} onClick={() => setZoom(z => Math.min(2.5, z + 0.1))}><Plus size={15} /></IconButton><i /><IconButton label="Adatta alla finestra" disabled={!pages.length} onClick={() => void fit().catch(e => showError(errorText(e)))}><Maximize size={15} /></IconButton></div></footer>
      </main>
      <aside className="inspector"><div className="inspector-heading"><span>IL TUO KIT CREATIVO</span><span className="tiny-dot" /></div>
        {!pages.length ? <><div className="inspector-intro"><span className="sparkle-box"><PenTool size={24} /></span><h3>Piccoli strumenti.<br />Grandi possibilità.</h3><p>Tutto quello che serve, esattamente dove lo cerchi.</p></div><div className="kit-features">{[{ icon: Type, title: 'Una parola in più', description: 'Aggiungi testo e appunti.' }, { icon: Highlighter, title: 'Quello che conta', description: 'Metti in luce i passaggi chiave.' }, { icon: PenTool, title: 'Il tuo tratto', description: 'Disegna e aggiungi una firma.' }, { icon: Layers, title: 'Il giusto ordine', description: 'Unisci e organizza le pagine.' }].map(item => <div key={item.title}><item.icon size={18} /><section><strong>{item.title}</strong><p>{item.description}</p></section></div>)}</div><div className="inspector-note"><span>LO SAPEVI?</span><p>Puoi lavorare offline.<br />Le tue idee non hanno bisogno<br />di una connessione.</p></div></> : <>
          <div className="tool-settings"><h3>{activeMark ? markNames[activeMark.kind] : currentTool.label}</h3><p>{activeMark ? 'Trascina l’elemento sulla pagina per spostarlo.' : currentTool.hint}</p>
            {!readOnly && (tool !== 'select' || activeMark) && <>{!(activeMark?.imageDataUrl || (tool === 'signature' && signature?.kind === 'image')) && <><label>Colore</label><div className="color-swatches">{colors.map(c => <button key={c} aria-label={`Colore ${c}`} className={(activeMark?.color || color) === c ? 'selected' : ''} style={{ backgroundColor: c }} onClick={() => { setColor(c); if (activeMark) updateMark({ color: c }); }}>{(activeMark?.color || color) === c && <Check size={13} />}</button>)}</div></>}
              {(tool === 'text' || activeMark?.kind === 'text') && <><label htmlFor="annotation-text">Il tuo testo</label>{activeMark ? <textarea id="annotation-text" key={activeMark.id + '-edit'} defaultValue={activeMark.text} maxLength={2000} onBlur={e => { const value = e.target.value; if (value !== activeMark.text) updateMark({ text: value }); }} /> : <textarea id="annotation-text" placeholder="Scrivi qualcosa…" value={text} onChange={e => setText(e.target.value)} maxLength={2000} />}<label htmlFor="font-size">Dimensione testo</label><select id="font-size" value={activeMark?.size || fontSize} onChange={e => { const value = Number(e.target.value); setFontSize(value); if (activeMark) updateMark({ size: value }); }}>{[10, 12, 14, 16, 18, 20, 24, 32, 40].map(size => <option key={size} value={size}>{size} pt</option>)}</select></>}
              {tool === 'draw' && <><label htmlFor="stroke-size">Spessore · {strokeSize} pt</label><input id="stroke-size" type="range" min="1" max="8" step="0.5" value={strokeSize} onChange={e => setStrokeSize(Number(e.target.value))} /></>}
              {(tool === 'signature' || activeMark?.kind === 'signature') && <><button className="button signature-button" disabled={!signatureReady || signatureSaving} onClick={() => setSignatureDialog(true)}><PenTool size={16} />{!signatureReady ? 'Caricamento firma…' : signature ? 'Cambia firma' : 'Crea la tua firma'}</button>{signature && <><SignaturePreview signature={signature} color={color} /><div className="small-note">Salvata sul dispositivo. Fai clic sulla pagina per inserirla.</div><button className="text-button forget-signature" disabled={signatureSaving} onClick={() => void forgetSignature()}><Trash2 size={14} />Elimina firma salvata</button></>}<div className="small-note">Firma grafica, senza certificato digitale.</div></>}
              {activeMark && activeMark.kind !== 'text' && <><label htmlFor="mark-width">Larghezza · {Math.round(activeMark.width * 100)}%</label><input id="mark-width" type="range" min="5" max="75" step="1" value={Math.round(activeMark.width * 100)} onChange={e => { const width = Math.min(Number(e.target.value) / 100, .9 * activeMark.width / activeMark.height); const height = activeMark.height * width / activeMark.width; updateMark({ width, height, x: Math.min(activeMark.x, 1 - width), y: Math.min(activeMark.y, 1 - height) }); }} /></>}
              {activeMark && <button className="button danger-light" onClick={removeMark}><Trash2 size={15} />Rimuovi annotazione</button>}
            </>}
          </div>
          {enabled && <div className="page-tools"><label>PAGINA {activeIndex + 1}</label><div className="page-tool-grid"><button onClick={() => editPage(p => ({ ...p, rotation: (p.rotation + 90) % 360 }))}><RotateCw size={18} />Ruota</button><button onClick={duplicatePage}><Copy size={18} />Duplica</button><button disabled={activeIndex === 0} onClick={() => movePage(-1)}><ArrowUp size={18} />Prima</button><button disabled={activeIndex === pages.length - 1} onClick={() => movePage(1)}><ArrowDown size={18} />Dopo</button></div><button className="text-button delete-page" onClick={deletePage} disabled={pages.length < 2}><Trash2 size={14} />Elimina pagina</button></div>}
          <div className="marks-list"><label>ANNOTAZIONI <span>{page?.marks.length || 0}</span></label>{page?.marks.length ? page.marks.map((mark, i) => <button key={mark.id} className={selected === mark.id ? 'active' : ''} onClick={() => { setSelected(mark.id); setTool('select'); }}><span className="mark-color" style={{ background: mark.color }} /><span>{mark.text?.slice(0, 26) || `${markNames[mark.kind]} ${i + 1}`}</span><ChevronRight size={13} /></button>) : <p>Le tue annotazioni di questa pagina appariranno qui.</p>}</div>
          <div className="inspector-bottom"><LockKeyhole size={13} />Salva una copia quando hai finito<br />per conservare il file originale.</div>
        </>}
      </aside>
    </div>
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.error ? '!' : <Check size={17} />}</span><p>{notice.text}</p><button onClick={() => setNotice(null)} aria-label="Chiudi messaggio"><X size={16} /></button></div>}
    {busy && <div className="busy-overlay" role="status" aria-live="polite"><div className="busy-card"><span className="spinner" />{busy}</div></div>}
    {dragOver && <div className="drop-overlay"><Upload size={40} /><h2>Un nuovo spazio per il tuo PDF.</h2><p>Rilascia il documento qui per aprirlo.</p></div>}
    {signatureDialog && <SignatureDialog onClose={() => setSignatureDialog(false)} onSave={async value => { await saveSignature(value); setSignature(value); setSignatureDialog(false); setTool('signature'); setSelected(null); notify('Firma salvata sul dispositivo. Fai clic sulla pagina per inserirla.'); }} />}
  </div>;
}
