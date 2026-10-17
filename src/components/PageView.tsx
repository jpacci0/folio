import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { RenderTask } from 'pdfjs-dist';
import type { Mark, PageModel, Point, Source, Tool } from '../types';
import { normalizeRotation, rotationTransform, strokeMark, toBase, uid } from '../pdf-engine';

export function MarkShape({ mark, width, height }: { mark: Mark; width: number; height: number }) {
  const x = mark.x * width, y = mark.y * height, w = mark.width * width, h = mark.height * height;
  if (mark.kind === 'highlight') return <rect x={x} y={y} width={w} height={h} fill={mark.color} opacity={0.32} />;
  if (mark.kind === 'text') return <text x={x} y={y} fill={mark.color} fontSize={mark.size} fontFamily="Inter, sans-serif">{(mark.text || '').split('\n').map((line, i) => <tspan key={i} x={x} dy={i === 0 ? mark.size : mark.size * 1.3}>{line || ' '}</tspan>)}</text>;
  return <g fill="none" stroke={mark.color} strokeWidth={mark.size} strokeLinecap="round" strokeLinejoin="round">{mark.paths?.map((path, i) => <polyline key={i} points={path.map(p => `${x + p.x * w},${y + p.y * h}`).join(' ')} />)}</g>;
}

type Props = {
  source: Source; page: PageModel; zoom: number; tool: Tool; color: string; size: number;
  text: string; signature: Point[][]; selected: string | null;
  onSelect: (id: string | null) => void; onAdd: (mark: Mark) => void;
  onMove: (id: string, x: number, y: number) => void; onError: (message: string) => void;
};
export function PageView(props: Props) {
  const { source, page, zoom, tool, color, size, selected, onSelect, onAdd, onMove, onError } = props;
  const canvas = useRef<HTMLCanvasElement>(null), textLayer = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 595.28, height: 841.89 });
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Mark | null>(null);
  const gesture = useRef<{ start: Point; points: Point[]; mark?: Mark; last: Point } | null>(null);
  const baseWidth = dimensions.width, baseHeight = dimensions.height;
  const landscape = page.rotation % 180 !== 0;
  const displayWidth = landscape ? baseHeight : baseWidth, displayHeight = landscape ? baseWidth : baseHeight;
  useEffect(() => {
    let disposed = false, render: RenderTask | undefined, layer: TextLayer | undefined;
    setReady(false);
    const run = async () => {
      const pdfPage = await source.pdf.getPage(page.index + 1);
      if (disposed) return;
      const original = pdfPage.getViewport({ scale: 1 });
      setDimensions({ width: original.width, height: original.height });
      const viewport = pdfPage.getViewport({ scale: zoom, rotation: normalizeRotation(pdfPage.rotate + page.rotation) });
      const element = canvas.current!;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.ceil(viewport.width * ratio); element.height = Math.ceil(viewport.height * ratio);
      element.style.width = `${viewport.width}px`; element.style.height = `${viewport.height}px`;
      render = pdfPage.render({ canvas: element, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await render.promise;
      if (disposed) return;
      setReady(true);
      const container = textLayer.current!;
      container.replaceChildren();
      container.style.setProperty('--scale-factor', String(zoom));
      layer = new TextLayer({ textContentSource: await pdfPage.getTextContent(), container, viewport });
      if (!disposed) await layer.render();
    };
    run().catch(error => { if (!disposed && error?.name !== 'RenderingCancelledException') onError('Impossibile visualizzare questa pagina.'); });
    return () => { disposed = true; render?.cancel(); layer?.cancel(); };
  }, [source, page.index, page.rotation, zoom, onError]);
  useEffect(() => { gesture.current = null; setDraft(null); }, [page.id, tool]);
  const point = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return toBase({ x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) }, page.rotation);
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !ready) return;
    e.preventDefault();
    const p = point(e);
    const id = (e.target as SVGElement).closest('[data-mark]')?.getAttribute('data-mark');
    if (tool === 'select') {
      onSelect(id || null);
      const mark = page.marks.find(m => m.id === id);
      if (!mark) return;
      gesture.current = { start: p, points: [], mark, last: p };
    } else if (tool === 'text') {
      if (!props.text.trim()) { onError('Scrivi il testo nel pannello a destra, poi scegli dove inserirlo.'); return; }
      const measure = document.createElement('canvas').getContext('2d')!;
      measure.font = `400 ${size}px Inter`;
      const width = Math.max(...props.text.split('\n').map(line => measure.measureText(line).width)) / baseWidth;
      const height = (props.text.split('\n').length * size * 1.3) / baseHeight;
      if (width > 0.95 || height > 0.95) { onError('Il testo è troppo grande per la pagina: riduci la dimensione o inserisci delle righe.'); return; }
      onAdd({ id: uid(), kind: 'text', x: Math.min(p.x, 1 - width), y: Math.min(p.y, 1 - height), width, height, color, size, text: props.text }); return;
    } else if (tool === 'signature') {
      if (!props.signature.length) { onError('Crea prima la firma nel pannello a destra.'); return; }
      const width = 0.3, height = 0.3 * (baseWidth / baseHeight) * 0.36;
      onAdd({ id: uid(), kind: 'signature', x: Math.min(p.x, 1 - width), y: Math.min(p.y, 1 - height), width, height, color, size: 1.6, paths: props.signature }); return;
    } else { gesture.current = { start: p, points: [p], last: p }; }
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current; if (!g) return;
    const p = point(e); g.last = p;
    if (g.mark) {
      setDraft({ ...g.mark, x: Math.max(0, Math.min(1 - g.mark.width, g.mark.x + p.x - g.start.x)), y: Math.max(0, Math.min(1 - g.mark.height, g.mark.y + p.y - g.start.y)) });
    } else if (tool === 'highlight') {
      setDraft({ id: 'draft', kind: 'highlight', x: Math.min(p.x, g.start.x), y: Math.min(p.y, g.start.y), width: Math.abs(p.x - g.start.x), height: Math.abs(p.y - g.start.y), color, size });
    } else if (tool === 'draw') { g.points.push(p); setDraft(strokeMark(g.points, color, size)); }
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current; if (!g) return;
    if (draft) {
      if (g.mark) onMove(g.mark.id, draft.x, draft.y);
      else if (draft.width > 0.002 && draft.height > 0.001) onAdd({ ...draft, id: uid() });
    }
    gesture.current = null; setDraft(null); e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <div className={`paper tool-${tool}`} style={{ width: displayWidth * zoom, height: displayHeight * zoom }} aria-label="Pagina PDF">
    <canvas ref={canvas} />
    <div ref={textLayer} className={`textLayer ${tool !== 'select' ? 'disabled' : ''}`} />
    <svg className={`annotations ${tool === 'select' ? 'select-mode' : ''}`} viewBox={`0 0 ${displayWidth} ${displayHeight}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { gesture.current = null; setDraft(null); }}>
      <g transform={rotationTransform(page.rotation, baseWidth, baseHeight)}>
        {page.marks.map(mark => <g key={mark.id} data-mark={mark.id} className="mark" style={{ visibility: draft?.id === mark.id ? 'hidden' : undefined }}>
          <MarkShape mark={mark} width={baseWidth} height={baseHeight} />
          <rect className={`mark-hit ${selected === mark.id ? 'is-selected' : ''}`} x={mark.x * baseWidth - 3} y={mark.y * baseHeight - 3} width={mark.width * baseWidth + 6} height={mark.height * baseHeight + 6} fill="transparent" strokeWidth={1 / zoom} />
        </g>)}
        {draft && <MarkShape mark={draft} width={baseWidth} height={baseHeight} />}
      </g>
    </svg>
    {!ready && <div className="page-loading">Caricamento pagina…</div>}
  </div>;
}

export function Thumbnail({ source, page, index, active, onClick }: { source: Source; page: PageModel; index: number; active: boolean; onClick: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), button = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [dims, setDims] = useState({ width: 595, height: 842 });
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    observer.observe(button.current!); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let canceled = false, task: RenderTask | undefined;
    source.pdf.getPage(page.index + 1).then(p => {
      if (canceled) return;
      const base = p.getViewport({ scale: 1 }); setDims({ width: base.width, height: base.height });
      const rotated = p.getViewport({ scale: 1, rotation: normalizeRotation(p.rotate + page.rotation) });
      const viewport = p.getViewport({ scale: Math.min(126 / rotated.width, 166 / rotated.height) * 1.5, rotation: rotated.rotation });
      const c = canvas.current!; c.width = Math.ceil(viewport.width); c.height = Math.ceil(viewport.height);
      task = p.render({ canvas: c, viewport }); return task.promise;
    }).catch(() => { /* The main view reports page errors. */ });
    return () => { canceled = true; task?.cancel(); };
  }, [visible, source, page.index, page.rotation]);
  const turned = page.rotation % 180 !== 0;
  return <button ref={button} className={`thumbnail ${active ? 'active' : ''}`} onClick={onClick} aria-label={`Pagina ${index + 1}`} aria-current={active ? 'page' : undefined}>
    <div className="thumbnail-paper"><canvas ref={canvas} /><svg viewBox={`0 0 ${turned ? dims.height : dims.width} ${turned ? dims.width : dims.height}`}><g transform={rotationTransform(page.rotation, dims.width, dims.height)}>{page.marks.map(mark => <MarkShape key={mark.id} mark={mark} width={dims.width} height={dims.height} />)}</g></svg></div>
    <span>{index + 1}{page.marks.length > 0 && <i />}</span>
  </button>;
}
