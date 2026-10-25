import { DEFAULT_SETTINGS, type Block, type Chunk, type ReaderPage, type ScanSettings, type SkipReason } from '../types';

const keys: Record<SkipReason, keyof ScanSettings> = {
  'page-number': 'pageNumbers', 'repeated-margin': 'repeatedMargins',
  'footer-link': 'footerLinks', footnote: 'footnotes', decorative: 'decorative',
};
export function isIncluded(block: Block, settings: ScanSettings = DEFAULT_SETTINGS): boolean {
  if (block.override !== undefined) return block.override;
  return !block.reason || !settings[keys[block.reason]];
}
export function normalize(text: string): string {
  return text.replace(/\u00ad/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[ \t]+/g, ' ').trim();
}
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 12;
}
function marginKey(text: string): string {
  return normalize(text).toLocaleLowerCase().replace(/\d+/g, '#');
}

/** Detect repeated furniture across the document, only within the outer 10% of pages.
 *  No body text is removed just because it contains a link or a number. */
export function classifyPages(pages: ReaderPage[]): ReaderPage[] {
  const seen = new Map<string, Set<number>>();
  for (const page of pages) {
    for (const b of page.blocks) {
      if (b.y < page.height * .10 || b.y + b.height > page.height * .90) {
        const key = marginKey(b.text);
        const group = seen.get(key) ?? new Set<number>();
        group.add(page.number); seen.set(key, group);
      }
    }
  }
  return pages.map(page => {
    const bodySize = median(page.blocks.filter(b => b.text.length > 30).map(b => b.fontSize));
    return { ...page, blocks: page.blocks.map(block => {
      const b = { ...block, reason: undefined as SkipReason | undefined };
      const margin = b.y < page.height * .10 || b.y + b.height > page.height * .90;
      const bottom = b.y > page.height * .84;
      const text = normalize(b.text);
      if (margin && /^(?:[-–—·|]\s*)?(?:(?:page|p\.)\s*)?(?:\d{1,5}(?:\s*(?:of|\/)\s*\d{1,5})?|[ivxlcdm]{1,8})(?:\s*[-–—·|])?$/i.test(text)) {
        b.reason = 'page-number';
      } else if (bottom && /(?:https?:\/\/|www\.|doi\.org\/|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b)/i.test(text) && text.length < 240) {
        b.reason = 'footer-link';
      } else if (margin && (seen.get(marginKey(text))?.size ?? 0) >= Math.max(2, Math.ceil(pages.length * .4))) {
        b.reason = 'repeated-margin';
      } else if (b.y > page.height * .76 && b.fontSize < bodySize * .76) {
        b.reason = 'footnote';
      } else if (/^[\s©®™|•·◆◇■□★☆✦✧]+$/.test(text)) {
        b.reason = 'decorative';
      }
      return b;
    }) };
  });
}

/** Recursively partition at real whitespace gutters (XY cut).
 * Full-width headings split horizontal bands before columns are read top-to-bottom. */
export function readingOrder(blocks: Block[], depth = 0): Block[] {
  if (blocks.length < 2 || depth > 12) return [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const gap = (axis: 'x' | 'y') => {
    const size = axis === 'x' ? 'width' : 'height';
    const sorted = [...blocks].sort((a, b) => a[axis] - b[axis]);
    let end = sorted[0][axis] + sorted[0][size];
    let best = { width: 0, cut: 0 };
    for (let i = 1; i < sorted.length; i++) {
      const width = sorted[i][axis] - end;
      if (width > best.width) best = { width, cut: end + width / 2 };
      end = Math.max(end, sorted[i][axis] + sorted[i][size]);
    }
    return best;
  };
  const font = median(blocks.map(b => b.fontSize));
  const xGap = gap('x');
  if (xGap.width > font * 1.4) {
    return [blocks.filter(b => b.x < xGap.cut), blocks.filter(b => b.x >= xGap.cut)]
      .flatMap(group => readingOrder(group, depth + 1));
  }
  const yGap = gap('y');
  if (yGap.width > font * .45) {
    return [blocks.filter(b => b.y < yGap.cut), blocks.filter(b => b.y >= yGap.cut)]
      .flatMap(group => readingOrder(group, depth + 1));
  }
  return [...blocks].sort((a, b) => Math.abs(a.y - b.y) < font * .4 ? a.x - b.x : a.y - b.y);
}

/** Keep utterances short: long utterances can stall Chromium speech engines. */
export function splitSpeech(text: string, max = 230): string[] {
  const normalized = normalize(text);
  const pieces = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(normalized), part => part.segment)
    : normalized.split(/(?<=[.!?。！？])\s+(?=[A-Z0-9])/u);
  const result: string[] = [];
  let current = '';
  const flush = () => { if (current.trim()) result.push(current.trim()); current = ''; };
  for (const piece of pieces) {
    for (const word of piece.trim().split(/\s+/)) {
      if (word.length > max) {
        flush();
        for (let i = 0; i < word.length; i += max) result.push(word.slice(i, i + max));
      } else {
        if ((current + ' ' + word).trim().length > max) flush();
        current += (current ? ' ' : '') + word;
      }
    }
    // Sentence boundaries are natural points to pause, seek, and persist progress.
    flush();
  }
  flush(); return result;
}

export function pageChunks(page: ReaderPage, settings: ScanSettings): Chunk[] {
  if (page.editedText !== undefined) return splitSpeech(page.editedText).map(text => ({ text, blockId: 'edited', heading: false }));
  const blocks = page.blocks.filter(b => isIncluded(b, settings));
  const paragraphs: { text: string; blockId: string; heading: boolean }[] = [];
  for (const b of blocks) {
    const previous = paragraphs.at(-1);
    const previousBlock = blocks[blocks.indexOf(b) - 1];
    const sameColumn = previousBlock && Math.abs(previousBlock.x - b.x) < Math.max(b.fontSize * 2, 20);
    const adjacent = previousBlock && b.y - previousBlock.y - previousBlock.height < b.fontSize * 1.1 && b.y >= previousBlock.y;
    if (previous && !b.heading && !previous.heading && sameColumn && adjacent && previous.text.length < 1600) {
      previous.text = /[a-z]-$/i.test(previous.text) && /^[a-z]/.test(b.text)
        ? previous.text.slice(0, -1) + b.text : previous.text + ' ' + b.text;
    } else paragraphs.push({ text: b.text, blockId: b.id, heading: b.heading });
  }
  return paragraphs.flatMap(p => splitSpeech(p.text).map(text => ({ ...p, text })));
}
export function pageText(page: ReaderPage, settings: ScanSettings): string {
  return pageChunks(page, settings).map(c => c.text).join('\n\n');
}
export function wordCount(text: string): number { return text.trim() ? text.trim().split(/\s+/).length : 0; }
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
