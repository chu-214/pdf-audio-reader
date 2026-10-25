import { describe, expect, it } from 'vitest';
import { classifyPages, isIncluded, pageChunks, pageText, readingOrder, splitSpeech } from './content';
import { DEFAULT_SETTINGS, type Block, type ReaderPage } from '../types';

const block = (text: string, x = 60, y = 300, fontSize = 12): Block => ({ id: text, text, x, y, width: 220, height: 14, fontSize, heading: false });
const page = (number: number, blocks: Block[]): ReaderPage => ({ number, width: 612, height: 792, source: 'text', blocks });

describe('content classification', () => {
  it('removes document-wide repeating furniture but preserves repeating body text', () => {
    const pages = classifyPages([1, 2, 3].map(n => page(n, [block('ACME RESEARCH', 60, 22), block('This important repeated body text should always be read.', 60, 200), block(String(n), 300, 757)])));
    expect(pages[0].blocks.map(b => b.reason)).toEqual(['repeated-margin', undefined, 'page-number']);
    expect(pageText(pages[0], DEFAULT_SETTINGS)).toBe('This important repeated body text should always be read.');
  });
  it('keeps meaningful numbers and links in the body, flags footer URLs', () => {
    const [result] = classifyPages([page(1, [block('2026'), block('Visit https://example.org for the complete analysis.'), block('https://example.org/report', 60, 710)])]);
    expect(result.blocks[0].reason).toBeUndefined();
    expect(result.blocks[1].reason).toBeUndefined();
    expect(result.blocks[2].reason).toBe('footer-link');
  });
  it('detects page-number formats only at margins', () => {
    for (const text of ['1', 'Page 3 of 12', '3 / 12', 'iv', '— 42 —']) {
      expect(classifyPages([page(1, [block(text, 290, 754)])])[0].blocks[0].reason).toBe('page-number');
      expect(classifyPages([page(1, [block(text, 290, 300)])])[0].blocks[0].reason).toBeUndefined();
    }
  });
  it('keeps footnotes by default and allows explicit restoration regardless of filters', () => {
    const [result] = classifyPages([page(1, [block('A paragraph of sufficiently long body text.', 60, 200), block('1 Source: useful context.', 60, 650, 8)])]);
    expect(result.blocks[1].reason).toBe('footnote');
    expect(isIncluded(result.blocks[1], DEFAULT_SETTINGS)).toBe(true);
    expect(isIncluded(result.blocks[1], { ...DEFAULT_SETTINGS, footnotes: true })).toBe(false);
    expect(isIncluded({ ...result.blocks[1], override: true }, { ...DEFAULT_SETTINGS, footnotes: true })).toBe(true);
    expect(isIncluded({ ...result.blocks[0], override: false }, DEFAULT_SETTINGS)).toBe(false);
  });
  it('does not classify a one-off header as repeating branding', () => {
    expect(classifyPages([page(1, [block('Introduction', 60, 30)])])[0].blocks[0].reason).toBeUndefined();
  });
});

describe('reading order and narration', () => {
  it('reads columns top-to-bottom beneath a full-width heading', () => {
    const title = { ...block('Title', 60, 40), width: 490, heading: true };
    const input = [block('R2', 330, 150), block('L1', 60, 100), title, block('R1', 330, 100), block('L2', 60, 150)];
    expect(readingOrder(input).map(b => b.text)).toEqual(['Title', 'L1', 'L2', 'R1', 'R2']);
  });
  it('does not merge text across columns', () => {
    const p = page(1, [block('Left column.', 60, 100), block('Right column.', 330, 100)]);
    expect(pageChunks(p, DEFAULT_SETTINGS).map(c => c.text)).toEqual(['Left column.', 'Right column.']);
  });
  it('rejoins line-wrap hyphens and fragmented lines', () => {
    const p = page(1, [block('The inter-', 60, 100), block('national market is growing.', 60, 118)]);
    expect(pageText(p, DEFAULT_SETTINGS)).toBe('The international market is growing.');
  });
  it('uses exact edited narration, including an intentional empty edit', () => {
    const p = { ...page(1, [block('Original text.')]), editedText: 'My edited text.' };
    expect(pageText(p, DEFAULT_SETTINGS)).toBe('My edited text.');
    expect(pageChunks({ ...p, editedText: '' }, DEFAULT_SETTINGS)).toEqual([]);
  });
  it('bounds utterance length without losing words, even for long unbroken text', () => {
    const text = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    const chunks = splitSpeech(text);
    expect(chunks.every(c => c.length <= 230)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
    const unbroken = '字'.repeat(700);
    expect(splitSpeech(unbroken).join('')).toBe(unbroken);
    expect(splitSpeech(unbroken).every(c => c.length <= 230)).toBe(true);
  });
  it('keeps sentence boundaries and handles empty content', () => {
    expect(splitSpeech('One sentence. Another question? Yes!')).toEqual(['One sentence.', 'Another question?', 'Yes!']);
    expect(splitSpeech('  ')).toEqual([]);
  });
  it('does not split decimal numbers, emails, or URLs at periods', () => {
    const text = 'Revenue is 12.5 percent. Visit https://example.org/research or email reader@example.org.';
    expect(splitSpeech(text)).toEqual(['Revenue is 12.5 percent.', 'Visit https://example.org/research or email reader@example.org.']);
  });
});
