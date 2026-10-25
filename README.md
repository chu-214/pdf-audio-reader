# PDF audio reader

A small personal tool: open a PDF, review what will be read, and listen. No account, backend, or API key.

## Run

Requires Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173`.

For a production build:

```sh
npm run build
npm run preview
```

`dist/` can also be served by any static web host. Use HTTPS outside localhost for browser APIs. The build uses relative asset paths, so hosting under a repository subdirectory works. `npm ci` copies PDF.js font, CMap, and WASM assets into the ignored `public/pdf-assets/` directory before building.

## Workflow

1. **Open or drop a PDF.** Text PDFs use their text layer. Image-only pages and sparse-text pages with images automatically run through OCR. Choose the OCR language in Settings before importing.
2. **Review the scan.** Page layout and document-wide repetition identify page numbers, repeated headers/footers, footer URLs, and decorative characters. Graphics and image logos are not narrated. Small-print footnotes stay included by default.
3. **Listen.** Press play or click a sentence. Playback continues across pages, highlighting the current sentence and saving your position.

The **Page** tab shows the original with clickable include/skip regions. **Skipped** shows the complete text audit, including included regions. Any automatic choice can be overridden. The pencil edits a page's exact narration; reset that edit to apply its region selections again.

Settings contain voice, volume, sleep timer, OCR language, and scan filters. Page bookmarks appear in the page picker. The library remembers documents, original files, edits, and progress in this browser. Export clean text from the document's `…` menu.

## Keyboard

| Key | Action |
| --- | --- |
| Space | Play / pause |
| Left / right arrow | Previous / next sentence |
| `[` / `]` | Decrease / increase speed |
| Cmd/Ctrl + O | Open PDF |
| `?` | Shortcuts and notes |
| Escape | Close the current dialog |

Shortcuts do not intercept typing in form fields. Pausing cancels the current sentence; resuming repeats that sentence for reliable behavior across speech engines.

## Privacy and limits

- PDFs are parsed and stored on your device using IndexedDB. They are not uploaded to a server. There is no analytics or application backend.
- OCR downloads Tesseract assets and the selected language model on first use. The model runs locally. Initial OCR therefore needs internet access.
- Speech uses your browser's installed voices. Choose a voice marked **Device** for local speech; cloud voices can send the narration to the browser's voice provider. Availability and pronunciation depend on the OS/browser.
- Layout filtering is heuristic, not a semantic AI model. Review unusual layouts. Image descriptions, table reconstruction, equation pronunciation, right-to-left ordering, and mixed pages with substantial text plus image-only text are not guaranteed. OCR can make mistakes.
- Live browser speech cannot be downloaded as MP3. Transcript export is supported. Background and lock-screen playback depend on your browser and device; keep the tab open.
- Clearing site data removes the library. Storage is per browser and origin, with no sync. Export important transcripts and retain original PDFs separately.
- Password-protected PDFs prompt for a password, which is not saved. Opening their original view may prompt again.
- Imports are limited to 100 MB. Large image scans can take time and memory. Scans can be cancelled.

## Development

React + TypeScript + Vite, PDF.js, Tesseract.js, IndexedDB (`idb`), and the Web Speech API.

```sh
npm test             # content filtering, reading order, speech state, persistence
npm run check        # tests, type checking, production build
npm run fixtures     # synthetic text and image-only PDFs for browser QA
```

With the dev server running, open `/tmp/fixtures/index.html` after generating fixtures. Its buttons inject synthetic files into the same drop workflow, allowing end-to-end testing without personal documents. `tmp/` is ignored and excluded from the production build.

Source map:

- `src/lib/pdf.ts`: PDF text geometry, OCR fallback, and cancellation.
- `src/lib/content.ts`: reading order, clutter detection, narration assembly.
- `src/lib/speech.ts`: sentence playback, seeking, and cross-page progression.
- `src/lib/storage.ts`: local library and original files.
- `src/components/SourcePreview.tsx`: original-page rendering and region controls.
- `src/App.tsx`: document workflow and minimal UI.
