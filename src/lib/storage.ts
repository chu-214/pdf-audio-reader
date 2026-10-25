import { openDB, type DBSchema } from 'idb';
import type { DocumentRecord } from '../types';

interface LibraryDB extends DBSchema {
  documents: { key: string; value: DocumentRecord; indexes: { 'by-updated': number } };
  files: { key: string; value: Blob };
}
const db = () => openDB<LibraryDB>('folio-library', 1, {
  upgrade(database) {
    database.createObjectStore('documents', { keyPath: 'id' }).createIndex('by-updated', 'updatedAt');
    database.createObjectStore('files');
  },
});
export async function listDocuments(): Promise<DocumentRecord[]> {
  return (await (await db()).getAllFromIndex('documents', 'by-updated')).reverse();
}
export async function saveDocument(doc: DocumentRecord, file?: Blob): Promise<void> {
  const database = await db();
  const tx = database.transaction(['documents', 'files'], 'readwrite');
  await tx.objectStore('documents').put(doc);
  if (file) await tx.objectStore('files').put(file, doc.id);
  await tx.done;
}
export async function loadFile(id: string): Promise<Blob | undefined> { return (await db()).get('files', id); }
export async function deleteDocument(id: string): Promise<void> {
  const tx = (await db()).transaction(['documents', 'files'], 'readwrite');
  await tx.objectStore('documents').delete(id); await tx.objectStore('files').delete(id); await tx.done;
}
