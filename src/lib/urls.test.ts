import { expect, it } from 'vitest';
import { isUrlOnly, stripUrls } from './urls';
import { isIncluded, pageText, splitSpeech } from './content';
import { DEFAULT_SETTINGS, type ReaderPage } from '../types';

it('removes full, bare, www, FTP, and file URLs everywhere in prose', () => {
  for (const url of ['https://example.org/path?a=1#section', 'http://example.com', 'www.example.com/report', 'example.org/research', 'ftp://example.net/file', 'file:///Users/name/document.pdf']) {
    expect(stripUrls(`Before ${url} after.`)).toBe('Before after.');
    expect(splitSpeech(url)).toEqual([]);
  }
});
it('preserves surrounding punctuation, ordinary prose, and decimal numbers', () => {
  expect(stripUrls('Read this (https://example.com), then continue.')).toBe('Read this, then continue.');
  expect(stripUrls('Revenue rose by 12.5 percent in 2026.')).toBe('Revenue rose by 12.5 percent in 2026.');
  expect(isUrlOnly('...')).toBe(false);
  expect(isUrlOnly('https://example.com.')).toBe(true);
});
it('filters custom narration and prevents manual restoration of URL-only regions', () => {
  const block = { id: 'link', text: 'https://example.com', x: 60, y: 300, width: 200, height: 12, fontSize: 12, heading: false, override: true };
  expect(isIncluded(block, { ...DEFAULT_SETTINGS, footerLinks: false })).toBe(false);
  const page: ReaderPage = { number: 1, width: 612, height: 792, blocks: [block], source: 'text', editedText: 'Read before https://example.com and after.' };
  expect(pageText(page, DEFAULT_SETTINGS)).toBe('Read before and after.');
  expect(block.text).toBe('https://example.com');
});
