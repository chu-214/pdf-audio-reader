import { expect, it } from 'vitest';
import { abortable } from './async';

it('releases a cancelled scan even when a terminated OCR worker never settles its job', async () => {
  const controller = new AbortController();
  const job = abortable(new Promise<string>(() => {}), controller.signal);
  controller.abort();
  await expect(job).rejects.toMatchObject({ name: 'AbortError' });
});
it('returns normal results and rejects scans cancelled before a worker starts', async () => {
  const controller = new AbortController();
  await expect(abortable(Promise.resolve('recognized'), controller.signal)).resolves.toBe('recognized');
  controller.abort();
  await expect(abortable(Promise.resolve('too late'), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
