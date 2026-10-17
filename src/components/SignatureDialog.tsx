import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Eraser, PenTool, X } from 'lucide-react';
import type { Point } from '../types';
export default function SignatureDialog({ onClose, onSave }: { onClose: () => void; onSave: (paths: Point[][]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [paths, setPaths] = useState<Point[][]>([]);
  const drawing = useRef(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const point = (e: PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
  const save = () => {
    const strokes = paths.filter(p => p.length > 1);
    const all = strokes.flat(); if (!all.length) return;
    const minX = Math.min(...all.map(p => p.x)), minY = Math.min(...all.map(p => p.y));
    const maxX = Math.max(...all.map(p => p.x)), maxY = Math.max(...all.map(p => p.y));
    const width = Math.max(maxX - minX, 0.02), height = Math.max(maxY - minY, 0.02);
    // Fit to the signature rectangle without stretching the handwriting.
    const scale = Math.min(0.94 / width, 0.94 / height);
    onSave(strokes.map(path => path.map(p => ({ x: (p.x - minX) * scale + (1 - width * scale) / 2, y: (p.y - minY) * scale + (1 - height * scale) / 2 }))));
  };
  return <dialog ref={dialog} onCancel={onClose} className="signature-dialog" aria-labelledby="signature-title">
    <div className="dialog-head"><div className="dialog-icon"><PenTool size={24} /></div><button className="icon-button" onClick={onClose} aria-label="Chiudi"><X size={20} /></button></div>
    <h2 id="signature-title">Un segno tutto tuo.</h2><p>Disegna la tua firma con il mouse, la penna o il dito.</p>
    <svg className="signature-pad" viewBox="0 0 600 216" onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); const start = point(e); drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); setPaths(p => [...p, [start]]); }} onPointerMove={e => { if (drawing.current) { const next = point(e); setPaths(p => [...p.slice(0, -1), [...p.at(-1)!, next]]); } }} onPointerUp={e => { drawing.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { drawing.current = false; }}>
      <line x1="30" y1="170" x2="570" y2="170" stroke="#d6d7df" strokeDasharray="5 5" />
      {paths.map((path, i) => <polyline key={i} points={path.map(p => `${p.x * 600},${p.y * 216}`).join(' ')} stroke="#302861" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
    <div className="signature-meta"><button className="text-button" onClick={() => setPaths([])}><Eraser size={15} />Ricomincia</button><span>La firma resta solo in questa sessione.</span></div>
    <div className="notice">È una firma grafica. Non applica né verifica un certificato di firma digitale.</div>
    <div className="dialog-actions"><button className="button" onClick={onClose}>Annulla</button><button className="button primary" onClick={save} disabled={!paths.some(p => p.length > 1)}>Usa questa firma</button></div>
  </dialog>;
}
