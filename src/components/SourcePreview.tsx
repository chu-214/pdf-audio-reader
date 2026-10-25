import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdf } from '../lib/pdf';
import { loadFile } from '../lib/storage';
import { isIncluded } from '../lib/content';
import { isUrlOnly } from '../lib/urls';
import { REASON_LABELS, type ReaderPage, type ScanSettings } from '../types';

type Props = {
  documentId: string; page: ReaderPage; settings: ScanSettings; activeBlock?: string;
  onToggle: (id: string) => void;
  onPassword: (incorrect: boolean) => Promise<string | null>;
};
export default function SourcePreview({ documentId, page, settings, activeBlock, onToggle, onPassword }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let disposed = false;
    let opened: PDFDocumentProxy | undefined;
    setPdf(undefined); setError(''); setBusy(documentId !== 'folio-demo');
    if (documentId === 'folio-demo') return;
    void loadFile(documentId).then(async file => {
      if (!file || disposed) { if (!disposed) { setError('Original file is unavailable in this browser. Import the PDF again.'); setBusy(false); } return; }
      opened = await openPdf(file, onPassword);
      if (disposed) { await opened.loadingTask.destroy(); return; }
      setPdf(opened);
    }).catch(err => { if (!disposed) { setError(err instanceof Error ? err.message : 'Could not open this PDF.'); setBusy(false); } });
    return () => { disposed = true; void opened?.loadingTask.destroy(); };
  }, [documentId, onPassword]);
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let disposed = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setBusy(true); setError('');
    void pdf.getPage(page.number).then(source => {
      if (disposed || !canvasRef.current) return;
      const view = source.getViewport({ scale: Math.min(2, 1600 / page.width) });
      const canvas = canvasRef.current;
      canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
      task = source.render({ canvas, viewport: view });
      return task.promise;
    }).then(() => { if (!disposed) setBusy(false); }).catch(err => {
      if (!disposed && err?.name !== 'RenderingCancelledException') { setError('Could not render the original page. The narration is still available.'); setBusy(false); }
    });
    return () => { disposed = true; task?.cancel(); };
  }, [pdf, page.number, page.width]);
  return <div className="source-view">
    <div className="source-tools"><span><i className="legend-dot" /> Included <i className="legend-dot skipped-dot" /> Skipped · click a region to change it</span><div><button aria-label="Zoom out" disabled={zoom <= .75} onClick={() => setZoom(v => v - .25)}><ZoomOut size={16} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(v => v + .25)}><ZoomIn size={16} /></button></div></div>
    {error ? <p className="inline-warning">{error}</p> : <div className="source-scroll"><div className="source-paper" style={{ width: `${zoom * 100}%`, aspectRatio: `${page.width} / ${page.height}` }}>
      {documentId === 'folio-demo' ? <div className="demo-paper">{page.blocks.map(b => <span key={b.id} style={{ position: 'absolute', left: `${b.x / page.width * 100}%`, top: `${b.y / page.height * 100}%`, width: `${b.width / page.width * 100}%`, fontSize: `${b.fontSize / page.width * 36}cqw`, fontWeight: b.heading ? 700 : 400 }}>{b.text}</span>)}</div> : <canvas ref={canvasRef} />}
      {!busy && page.blocks.map(b => {
        const included = isIncluded(b, settings);
        return <button key={b.id} disabled={isUrlOnly(b.text)} title={isUrlOnly(b.text) ? 'URLs are never narrated' : `${included ? 'Included' : b.reason ? REASON_LABELS[b.reason] : 'Manually skipped'}: ${b.text}. Click to ${included ? 'skip' : 'include'}.`} aria-label={`${included ? 'Skip' : 'Include'}: ${b.text}`} className={`source-region ${included ? 'included' : 'excluded'} ${activeBlock === b.id ? 'speaking' : ''}`} onClick={() => onToggle(b.id)} style={{ left: `${b.x / page.width * 100}%`, top: `${b.y / page.height * 100}%`, width: `${b.width / page.width * 100}%`, height: `${Math.max(b.height, 10) / page.height * 100}%` }} />;
      })}
      {busy && <div className="source-loading"><LoaderCircle className="spin" size={24} /> Rendering page</div>}
    </div></div>}
    {page.editedText !== undefined && <p className="muted small">This page has custom narration. Reset the edit to use region selections.</p>}
  </div>;
}
