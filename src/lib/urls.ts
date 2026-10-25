import { LinkifyIt } from 'linkify-it';
import tlds from 'tlds';

const links = new LinkifyIt().tlds(tlds).set({ fuzzyIP: true, fuzzyLink: true });

/** Remove addresses from speech everywhere, including body prose and custom
 * narration. Link detection preserves sentence punctuation around each URL. */
export function stripUrls(text: string): string {
  const matches = links.match(text);
  let cleaned = text;
  if (matches) {
    let end = 0;
    const pieces = [];
    for (const match of matches) { pieces.push(text.slice(end, match.index)); end = match.lastIndex; }
    pieces.push(text.slice(end)); cleaned = pieces.join('');
  }
  // Also remove explicit schemes when the address is malformed by OCR or uses
  // a non-web protocol that the link detector deliberately does not recognize.
  const result = cleaned.replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s<>"“”]+/gi, '')
    .replace(/\(\s*\)|\[\s*\]/g, '').replace(/[ \t]+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
  if (result !== text.trim() && !result.replace(/[\p{P}\s]/gu, '')) return '';
  return result;
}

export function isUrlOnly(text: string): boolean {
  const stripped = stripUrls(text);
  return stripped !== text.trim() && !stripped.replace(/[\s.,;:()[\]{}\-–—•]+/g, '');
}
