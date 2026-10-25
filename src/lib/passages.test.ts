import { expect, it } from 'vitest';
import { passageAt } from './passages';
import type { Chunk } from '../types';

it('bundles short headings and related sentences without dropping or repeating text', () => {
  const chunks: Chunk[] = Array.from({ length: 20 }, (_, i) => ({ text: `Sentence number ${i} is part of this paragraph.`, blockId: i < 10 ? 'first' : 'second', heading: i === 0 }));
  const passages = [];
  let position = { page: 0, chunk: 0 };
  for (let p = passageAt([chunks], position); p; p = passageAt([chunks], position)) {
    passages.push(p); position = p.next;
  }
  expect(passages.flatMap(p => p.chunks.map(c => c.index))).toEqual(chunks.map((_, i) => i));
  expect(passages.every(p => p.text.length <= 330)).toBe(true);
  expect(passages[0].chunks.length).toBeGreaterThan(1);
});
it('keeps page boundaries and skips pages without narration', () => {
  const chunks = [[{ text: 'First.', blockId: 'a', heading: false }], [], [{ text: 'Last.', blockId: 'b', heading: false }]];
  const first = passageAt(chunks, { page: 0, chunk: 0 })!;
  expect(first.text).toBe('First.');
  expect(passageAt(chunks, first.next)?.start).toEqual({ page: 2, chunk: 0 });
});
