export type SkipReason = 'page-number' | 'repeated-margin' | 'footer-link' | 'footnote' | 'decorative';
export type Block = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  heading: boolean;
  reason?: SkipReason;
  override?: boolean;
};
export type ReaderPage = {
  number: number;
  width: number;
  height: number;
  blocks: Block[];
  source: 'text' | 'ocr';
  warning?: string;
  editedText?: string;
};
export type ScanSettings = {
  pageNumbers: boolean;
  repeatedMargins: boolean;
  footerLinks: boolean;
  footnotes: boolean;
  decorative: boolean;
  ocrLanguage: string;
};
export type Position = { page: number; chunk: number };
export type DocumentRecord = {
  id: string;
  title: string;
  filename: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  pages: ReaderPage[];
  position: Position;
  settings: ScanSettings;
  bookmarkPages: number[];
  cover?: string;
};
export type Chunk = { text: string; blockId: string; heading: boolean };
export const DEFAULT_SETTINGS: ScanSettings = {
  pageNumbers: true, repeatedMargins: true, footerLinks: true,
  footnotes: false, decorative: true, ocrLanguage: 'eng',
};
export const REASON_LABELS: Record<SkipReason, string> = {
  'page-number': 'Page number', 'repeated-margin': 'Repeated header or footer',
  'footer-link': 'URL', footnote: 'Small-print footnote', decorative: 'Decorative mark',
};
