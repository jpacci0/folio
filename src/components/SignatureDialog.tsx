import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Eraser, ImagePlus, PenTool, X } from 'lucide-react';
import type { Point, Signature } from '../types';
import { drawnSignature, importSignature } from '../signature';

export function SignaturePreview({ signature, color = '#202b3d' }: { signature: Signature; color?: string }) {
  return <svg className="signature-preview" aria-label="Firma salvata" role="img" viewBox={`0 0 ${signature.aspectRatio * 100} 100`}>
    {signature.kind === 'image' ? <image href={signature.dataUrl} width={signature.aspectRatio * 100} height={100} /> : signature.paths.map((path, i) => <polyline key={i} points={path.map(p => `${p.x * signature.aspectRatio * 100},${p.y * 100}`).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
  </svg>;
}
export default function SignatureDialog({ onClose, onSave }: { onClose: () => void; onSave: (signature: Signature) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null), fileInput = useRef<HTMLInputElement>(null);
  const [paths, setPaths] = useState<Point[][]>([]);
  const [mode, setMode] = useState<'draw' | 'image'>('draw');
  const [imported, setImported] = useState<Signature | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const drawing = useRef(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const point = (e: PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
  const save = async () => {
    setBusy(true); setError('');
    try { const signature = mode === 'draw' ? drawnSignature(paths) : imported; if (signature) await onSave(signature); }
    catch (e) { setError(e instanceof Error ? e.message : 'Salvataggio non riuscito. Riprova.'); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} className="signature-dialog" aria-labelledby="signature-title" onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); }}>
    <div className="dialog-head"><div className="dialog-icon"><PenTool size={24} /></div><button className="icon-button" disabled={busy} onClick={onClose} aria-label="Chiudi"><X size={20} /></button></div>
    <h2 id="signature-title">Un segno tutto tuo.</h2><p>Crea la firma una volta. La ritroverai anche alla prossima apertura.</p>
    <div className="signature-tabs" aria-label="Tipo di firma"><button aria-pressed={mode === 'draw'} disabled={busy} onClick={() => { setMode('draw'); setError(''); }}><PenTool size={16} />Disegna</button><button aria-pressed={mode === 'image'} disabled={busy} onClick={() => { setMode('image'); setError(''); }}><ImagePlus size={16} />Importa immagine</button></div>
    {mode === 'draw' ? <>
      <svg className="signature-pad" aria-label="Disegna la firma" viewBox="0 0 600 216" onPointerDown={e => { if (e.button !== 0 || busy || paths.length >= 128) return; e.preventDefault(); const start = point(e); drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); setPaths(p => [...p, [start]]); }} onPointerMove={e => { if (drawing.current) { const next = point(e); setPaths(p => p.flat().length >= 10000 ? p : [...p.slice(0, -1), [...p.at(-1)!, next]]); } }} onPointerUp={e => { drawing.current = false; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { drawing.current = false; }}>
        <line x1="30" y1="170" x2="570" y2="170" stroke="#d6d7df" strokeDasharray="5 5" />
        {paths.map((path, i) => <polyline key={i} points={path.map(p => `${p.x * 600},${p.y * 216}`).join(' ')} stroke="#302861" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
      <div className="signature-meta"><button className="text-button" disabled={busy} onClick={() => setPaths([])}><Eraser size={15} />Ricomincia</button><span>Mouse, penna o dito.</span></div>
    </> : <div className="signature-import">
      {imported ? <SignaturePreview signature={imported} /> : <ImagePlus size={32} />}
      <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" aria-label="Immagine della firma" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setBusy(true); setError(''); setImported(null); try { setImported(await importSignature(file)); } catch (e) { setError(e instanceof Error ? e.message : 'Immagine non leggibile.'); } finally { setBusy(false); } }} />
      <button className="button" disabled={busy} onClick={() => fileInput.current?.click()}><ImagePlus size={16} />{imported ? 'Cambia immagine' : 'Scegli immagine'}</button>
      <p>PNG o JPG, massimo 5 MB.<br />Un PNG trasparente si integra meglio nel documento.</p>
    </div>}
    <div className="notice">La firma viene salvata solo su questo dispositivo. È una firma grafica, senza certificato digitale.</div>
    {error && <p className="signature-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="button" disabled={busy} onClick={onClose}>Annulla</button><button className="button primary" onClick={() => void save()} disabled={busy || (mode === 'draw' ? !paths.some(p => p.length > 1) : !imported)}>{busy ? 'Preparazione…' : 'Usa questa firma'}</button></div>
  </dialog>;
}
