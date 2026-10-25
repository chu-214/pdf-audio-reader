// Synthetic documents for manual end-to-end QA. Never uses a personal PDF.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('tmp/fixtures', { recursive: true });
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
for (let n = 1; n <= 2; n++) {
  const page = pdf.addPage([612, 792]);
  page.drawText('FOLIO RESEARCH', { x: 60, y: 760, size: 9, font: bold });
  page.drawText(n === 1 ? 'A clearer way to listen' : 'Your next chapter', { x: 60, y: 690, size: 25, font: bold });
  const lines = n === 1 ? [
    'This is the important body of the document.',
    'It should be read aloud, in its original order.',
    'Revenue increased by 25 percent in 2026.',
    'A useful body link: https://example.org/research',
    '',
    'This paragraph continues with another idea.',
    'You can review, restore, or edit any region.',
  ] : [
    'The reader should continue automatically',
    'from the first page into this second page.',
    '',
    'Try pausing and resuming this sentence.',
    'Your place is saved when you return.',
  ];
  lines.forEach((line, i) => page.drawText(line, { x: 60, y: 620 - i * 22, size: 12, font }));
  page.drawText('1 A useful footnote should remain unless you choose to skip it.', { x: 60, y: 115, size: 8, font });
  page.drawText(`https://example.org/source-${n}`, { x: 60, y: 62, size: 8, font });
  page.drawText(String(n), { x: 300, y: 25, size: 10, font });
  page.drawRectangle({ x: 510, y: 747, width: 25, height: 25, color: rgb(.25, .4, .25) });
}
await writeFile('tmp/fixtures/text-document.pdf', await pdf.save());

const scanned = await PDFDocument.create();
const canvas = createCanvas(1224, 1584);
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1224, 1584); ctx.fillStyle = '#222';
ctx.font = 'bold 48px sans-serif'; ctx.fillText('A scanned page', 120, 230);
ctx.font = '28px sans-serif';
[
  'This page is an image with no text layer.',
  'Optical character recognition finds these words.',
  'The important content should be read aloud.',
  'Page numbers and footer links should be skipped.',
].forEach((line, i) => ctx.fillText(line, 120, 360 + i * 55));
ctx.font = '20px sans-serif'; ctx.fillText('https://example.org/scanned', 120, 1470);
ctx.fillText('1', 600, 1535);
const image = await scanned.embedPng(canvas.toBuffer('image/png'));
scanned.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
await writeFile('tmp/fixtures/scanned-document.pdf', await scanned.save());
await writeFile('tmp/fixtures/index.html', `<!doctype html><html><head><title>PDF reader test fixtures</title><style>body{margin:0;font:12px system-ui}nav{height:40px;display:flex;gap:10px;align-items:center;padding:0 12px;background:#f2f4f6}button{cursor:pointer}iframe{border:0;width:100%;height:calc(100dvh - 40px)}</style></head><body><nav>Synthetic QA fixtures <button data-file="text-document.pdf">Load text PDF</button><button data-file="scanned-document.pdf">Load scanned PDF</button></nav><iframe src="/"></iframe><script>
for(const button of document.querySelectorAll('button')) button.onclick=async()=>{
  const name=button.dataset.file;
  const data=await (await fetch(name)).blob();
  const transfer=new DataTransfer();transfer.items.add(new File([data],name,{type:'application/pdf'}));
  document.querySelector('iframe').contentDocument.querySelector('.app').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
};
</script></body></html>`);
console.log('Created synthetic text and image-only PDFs in tmp/fixtures.');
