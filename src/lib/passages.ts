import type { Chunk, Position } from '../types';
export type Passage = { text: string; start: Position; next: Position; chunks: { index: number; weight: number }[] };

export function passageAt(pages: Chunk[][], position: Position): Passage | undefined {
  let page = Math.max(0, position.page);
  let chunk = Math.max(0, position.chunk);
  while (page < pages.length && chunk >= pages[page].length) { page++; chunk = 0; }
  if (page >= pages.length) return;
  const start = { page, chunk };
  const parts: string[] = [];
  const included: Passage['chunks'] = [];
  let length = 0;
  // Short headings/utterances share context; longer paragraphs retain their own
  // boundary. The conservative cap leaves room for Kokoro's phoneme token limit.
  while (chunk < pages[page].length) {
    const item = pages[page][chunk];
    const previous = pages[page][chunk - 1];
    if (parts.length && (length + item.text.length > 330 || (length > 140 && item.blockId !== previous?.blockId))) break;
    const separator = parts.length ? item.blockId === previous?.blockId ? ' ' : '\n\n' : '';
    parts.push(separator + item.text);
    included.push({ index: chunk, weight: Math.max(1, item.text.length) });
    length += separator.length + item.text.length; chunk++;
  }
  return { text: parts.join(''), start, next: { page, chunk }, chunks: included };
}
