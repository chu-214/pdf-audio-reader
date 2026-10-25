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
2. **Review the scan.** Page layout and document-wide repetition identify page numbers, repeated headers/footers, and decorative characters. URLs are always removed from narration, wherever they appear. Graphics and image logos are not narrated. Small-print footnotes stay included by default.
3. **Listen.** Press play or click a sentence. Kokoro generates neural speech locally, prepares upcoming passages ahead of playback, and continues across pages. The default is **Heart**; Settings also offers Bella, Michael, and Emma.

The **Page** tab shows the original with clickable include/skip regions. **Skipped** shows the complete text audit, including included regions. Automatic layout choices can be overridden; URL-only regions stay excluded. The pencil edits a page's narration; reset that edit to apply its region selections again. URLs in body text, OCR text, and custom edits are stripped before playback. They remain visible in the original PDF.

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

Shortcuts do not intercept typing in form fields. Pause/resume preserves the exact audio position within a session. After a page reload, playback resumes from the saved sentence. Sentence highlighting within a generated passage is approximate because Kokoro does not provide alignment timestamps.

## AI voice

Speech uses [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), an Apache-2.0 open-weight model, through [kokoro-js](https://github.com/hexgrad/kokoro/tree/main/kokoro.js). The first Play downloads model weights from Hugging Face into the browser cache: approximately 330 MB for GPU acceleration or 90 MB for the quantized CPU fallback, plus the selected voice. Future use reuses cached files when browser storage permits. PDF text is never sent to a speech service.

The model runs in a Web Worker. Related sentences and short headings are grouped into bounded passages to improve prosody; two upcoming passages are prefetched. Speed changes use pitch-preserving audio playback, without regenerating the voice. English voices are supported by this integration; the OCR language selector does not change the narration language. Generation speed depends on hardware, and slower devices may pause to buffer.

After updating an existing checkout, run `npm ci`, restart `npm run dev`, and refresh the page.

## Privacy and limits

- PDFs are parsed and stored on your device using IndexedDB. They are not uploaded to a server. There is no analytics or application backend.
- OCR downloads Tesseract assets and the selected language model on first use. The model runs locally. Initial OCR therefore needs internet access.
- Neural speech runs on this device. The first voice/model download needs internet access; there is no API key, paid inference endpoint, or browser/system speech fallback.
- Layout filtering is heuristic, not a semantic AI model. Review unusual layouts. Image descriptions, table reconstruction, equation pronunciation, right-to-left ordering, and mixed pages with substantial text plus image-only text are not guaranteed. OCR can make mistakes.
- Audio-file export is not included. Transcript export is supported. Background and lock-screen playback depend on your browser and device; keep the tab open.
- Clearing site data removes the library. Storage is per browser and origin, with no sync. Export important transcripts and retain original PDFs separately.
- Password-protected PDFs prompt for a password, which is not saved. Opening their original view may prompt again.
- Imports are limited to 100 MB. Large image scans can take time and memory. Scans can be cancelled.

## Development

React + TypeScript + Vite, PDF.js, Tesseract.js, IndexedDB (`idb`), Kokoro/Transformers.js/ONNX Runtime, and native audio playback. `npm ci`, `npm run dev`, and `npm run build` prepare generated runtime assets and compile the voice worker into the ignored `public/voice-assets/` directory. Kokoro's official browser bundle is served locally. Generated asset directories are recreated to remove obsolete or sync-conflict files. A dependency override keeps the Node-only `sharp` image dependency on a patched release; speech does not use its image functions.

```sh
npm test             # content filtering, reading order, speech state, persistence
npm run check        # tests, type checking, production build
npm run fixtures     # synthetic text and image-only PDFs for browser QA
npm run check:voice  # real CPU inference; downloads weights and writes a WAV in tmp/
```

With the dev server running, open `/tmp/fixtures/index.html` after generating fixtures. Its buttons inject synthetic files into the same drop workflow, allowing end-to-end testing without personal documents. `tmp/` is ignored and excluded from the production build.

Source map:

- `src/lib/pdf.ts`: PDF text geometry, OCR fallback, and cancellation.
- `src/lib/content.ts`: reading order, clutter detection, narration assembly.
- `src/lib/speech.ts`: neural audio playback, buffering, seeking, and cross-page progression.
- `src/lib/passages.ts`: sentence grouping for speech context and prosody.
- `src/lib/urls.ts`: URL removal shared by narration assembly and voice generation.
- `src/lib/voice.ts`: worker requests, cancellation, and PCM audio encoding.
- `src/workers/voice.worker.ts`: local Kokoro model loading and inference.
- `src/lib/storage.ts`: local library and original files.
- `src/components/SourcePreview.tsx`: original-page rendering and region controls.
- `src/App.tsx`: document workflow and minimal UI.
