import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDemo } from './demo';
import { deleteDocument, listDocuments, loadFile, saveDocument } from './storage';

describe('persistent local library', () => {
  it('saves the original PDF and edited reading position together, then removes both', async () => {
    const doc = { ...createDemo(), id: 'test-document', position: { page: 2, chunk: 1 } };
    doc.pages[0].editedText = 'Edited narration.';
    const file = new Blob(['%PDF-1.7 test']);
    await saveDocument(doc, file);
    const loaded = (await listDocuments()).find(d => d.id === doc.id);
    expect(loaded?.position).toEqual({ page: 2, chunk: 1 });
    expect(loaded?.pages[0].editedText).toBe('Edited narration.');
    expect(await (await loadFile(doc.id))?.text()).toBe('%PDF-1.7 test');
    await deleteDocument(doc.id);
    expect((await listDocuments()).some(d => d.id === doc.id)).toBe(false);
    expect(await loadFile(doc.id)).toBeUndefined();
  });
});
