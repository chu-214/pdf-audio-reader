import { getDocument, GlobalWorkerOptions, OPS, Util, type PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { classifyPages, median, normalize, readingOrder } from './content';
import { abortable } from './async';
import type { Block, ReaderPage } from '../types';

GlobalWorkerOptions.workerSrc = pdfWorker;
export type ScanProgress = { page: number; total: number; stage: string; fraction?: number };
type ScanOptions = {
  signal: AbortSignal;
  language: string;
  onProgress: (progress: ScanProgress) => void;
  onPassword: (incorrect: boolean) => Promise<string | null>;
};
function checkAbort(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Scan cancelled', 'AbortError'); }

export async function openPdf(file: Blob, onPassword?: ScanOptions['onPassword'], signal?: AbortSignal): Promise<PDFDocumentProxy> {
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${import.meta.env.BASE_URL}pdf-assets/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdf-assets/wasm/`,
  });
  if (onPassword) task.onPassword = (update: (password: string) => void, reason: number) => {
    void onPassword(reason === 2).then(password => {
      if (password === null) void task.destroy();
      else update(password);
    });
  };
  const abort = () => { void task.destroy(); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try { return await task.promise; }
  finally { signal?.removeEventListener('abort', abort); }
}

export async function scanPdf(file: File, options: ScanOptions): Promise<{ pages: ReaderPage[]; cover: string }> {
  checkAbort(options.signal);
  const pdf = await openPdf(file, options.onPassword, options.signal);
  let ocr: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | undefined;
  let terminated = false;
  const stop = () => {
    void pdf.loadingTask.destroy();
    if (ocr) { terminated = true; void ocr.terminate(); }
  };
  options.signal.addEventListener('abort', stop, { once: true });
  let currentNumber = 1;
  let cover = '';
  const pages: ReaderPage[] = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      currentNumber = number;
      checkAbort(options.signal);
      options.onProgress({ page: number, total: pdf.numPages, stage: 'Reading page layout' });
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const text = await page.getTextContent();
      const pieces: Block[] = [];
      for (const item of text.items) {
        if (!('str' in item) || !normalize(item.str)) continue;
        const t = Util.transform(viewport.transform, item.transform);
        const fontSize = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || 12;
        const style = text.styles[item.fontName];
        const ascent = style?.ascent ?? (style?.descent ? 1 + style.descent : .8);
        pieces.push({
          id: '', text: normalize(item.str), x: t[4], y: t[5] - fontSize * ascent,
          width: item.width, height: fontSize, fontSize, heading: false,
        });
      }
      // PDF text is often fragmented into individual words; rebuild lines without joining columns.
      const rows: Block[][] = [];
      for (const piece of pieces.sort((a, b) => a.y - b.y || a.x - b.x)) {
        const row = rows.findLast(r => Math.abs(r[0].y - piece.y) < Math.min(r[0].fontSize, piece.fontSize) * .45);
        if (row) row.push(piece); else rows.push([piece]);
      }
      let blocks: Block[] = rows.flatMap(row => {
        const lines: Block[] = [];
        for (const part of row.sort((a, b) => a.x - b.x)) {
          const prev = lines.at(-1);
          if (prev && part.x - prev.x - prev.width < Math.max(part.fontSize, prev.fontSize) * 1.8) {
            const spacing = part.x - prev.x - prev.width > part.fontSize * .12 ? ' ' : '';
            prev.text += spacing + part.text;
            prev.width = Math.max(prev.width, part.x + part.width - prev.x);
            prev.height = Math.max(prev.height, part.height);
            prev.fontSize = Math.max(prev.fontSize, part.fontSize);
          } else lines.push({ ...part });
        }
        return lines;
      });
      let source: ReaderPage['source'] = 'text';
      let warning: string | undefined;
      const charCount = blocks.reduce((sum, b) => sum + b.text.length, 0);
      const imageCanvas = async (maxWidth: number) => {
        const scale = Math.min(maxWidth / viewport.width, Math.sqrt(6_000_000 / (viewport.width * viewport.height)), 3);
        const view = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
        await page.render({ canvas, viewport: view }).promise;
        return { canvas, scale };
      };
      if (number === 1) {
        const { canvas } = await imageCanvas(380);
        cover = canvas.toDataURL('image/jpeg', .72);
      }
      // Some image scans have a small searchable footer; still OCR their image body.
      const ops = charCount < 500 ? await page.getOperatorList() : undefined;
      const hasImages = ops?.fnArray.some(op => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject);
      if (charCount < 35 || (charCount < 500 && hasImages)) {
        source = 'ocr';
        options.onProgress({ page: number, total: pdf.numPages, stage: 'Recognizing scanned text' });
        if (!ocr) {
          const { createWorker } = await import('tesseract.js');
          const initializing = createWorker(options.language, 1, {
            logger: message => {
              if (!options.signal.aborted) options.onProgress({ page: currentNumber, total: pdf.numPages, stage: message.status === 'recognizing text' ? 'Recognizing scanned text' : 'Preparing OCR', fraction: message.progress });
            },
            errorHandler: () => { /* recognize() rejects; handled by the scan error boundary */ },
          }).then(worker => {
            if (options.signal.aborted) { void worker.terminate(); throw new DOMException('Scan cancelled', 'AbortError'); }
            return worker;
          });
          ocr = await abortable(initializing, options.signal);
        }
        checkAbort(options.signal);
        const { canvas, scale } = await imageCanvas(2200);
        const result = await abortable(ocr.recognize(canvas, {}, { blocks: true }), options.signal);
        checkAbort(options.signal);
        const recognized: Block[] = [];
        for (const group of result.data.blocks ?? []) for (const paragraph of group.paragraphs) for (const line of paragraph.lines) {
          if (!normalize(line.text)) continue;
          recognized.push({
            id: '', text: normalize(line.text), x: line.bbox.x0 / scale, y: line.bbox.y0 / scale,
            width: (line.bbox.x1 - line.bbox.x0) / scale,
            height: (line.bbox.y1 - line.bbox.y0) / scale,
            fontSize: (line.bbox.y1 - line.bbox.y0) / scale, heading: false,
          });
        }
        // Keep an existing text layer if an OCR pass finds less usable text.
        if (recognized.reduce((sum, b) => sum + b.text.length, 0) > charCount) blocks = recognized;
        else if (charCount > 0) source = 'text';
        if (result.data.confidence < 65) warning = 'OCR confidence is low. Check the narration against the original page.';
      }
      const body = median(blocks.filter(b => b.text.length > 25).map(b => b.fontSize));
      blocks = readingOrder(blocks).map((b, index) => ({ ...b, id: `p${number}-b${index}`, heading: b.fontSize > body * 1.22 && b.text.length < 180 }));
      if (!blocks.length) warning = 'No readable text found. This page may contain only artwork, or need a different OCR language.';
      pages.push({ number, width: viewport.width, height: viewport.height, blocks, source, warning });
      page.cleanup();
      // Let the UI paint between pages on large PDFs.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    return { pages: classifyPages(pages), cover };
  } finally {
    options.signal.removeEventListener('abort', stop);
    if (!terminated) await ocr?.terminate();
    await pdf.loadingTask.destroy();
  }
}
