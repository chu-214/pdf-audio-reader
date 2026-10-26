# PDF audio reader

A local PDF reader with OCR and text-to-speech using [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M).

## Run

Requires Node.js 22.13 or later.

```sh
npm ci
npm run dev
```

Open the address printed in the terminal, usually `http://127.0.0.1:5173`.

## Use

1. Open or drop a PDF.
2. Review the extracted text. Use **Page** or **Skipped** to correct what is included, or the pencil to edit the narration.
3. Press Play. Click a sentence to start there.

URLs are never read aloud. Repeated headers, page numbers, and decorative marks are filtered out. Voice, speed, OCR language, and other controls are available in the player and Settings.

## Notes

- PDFs, edits, and reading progress stay in this browser. Clearing site data removes them. No account or API key is needed.
- Speech runs locally with English voices. First use downloads a model of about 90–330 MB; OCR also downloads language data when needed.
- Imports are limited to 100 MB. OCR and layout filtering can make mistakes, particularly with tables, equations, or unusual page layouts.
- Keep the tab open for playback. Sentence highlighting is approximate. Text export is supported; audio export is not.

## Development

```sh
npm test
npm run build
```

The build writes to `dist/`. Run `npm run preview` to serve it locally.
