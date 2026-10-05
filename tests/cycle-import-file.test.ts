// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CycleZipEntry } from '../js/cycle-import-file.js';

const zipWindow = window as Window & { JSZip?: { loadAsync(file: File): Promise<{ files: Record<string, CycleZipEntry> }> } };
const originalZip = Object.getOwnPropertyDescriptor(window, 'JSZip');
const file = (name: string, type = '') => Object.assign(new File([], name, { type }), { text: vi.fn(async () => 'date,flow\n2026-01-01,heavy') });

async function freshModule() {
  vi.resetModules();
  delete zipWindow.JSZip;
  return import('../js/cycle-import-file.js');
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalZip) Object.defineProperty(window, 'JSZip', originalZip);
  else delete zipWindow.JSZip;
});

describe('cycle file and archive handling', () => {
  it('shares an in-flight ZIP script load, propagates failure, and retries successfully', async () => {
    const { buildCycleFileContext } = await freshModule();
    const scripts: HTMLScriptElement[] = [];
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      scripts.push(node as HTMLScriptElement);
      return node;
    });
    const first = buildCycleFileContext(file('first.zip'));
    const concurrent = buildCycleFileContext(file('second.zip'));
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.getAttribute('src')).toBe('/vendor/jszip.min.js');
    scripts[0]!.dispatchEvent(new Event('error'));
    const failed = await Promise.allSettled([first, concurrent]);
    expect(failed.map(result => result.status)).toEqual(['rejected', 'rejected']);
    const reasons = failed.map(result => result.status === 'rejected' ? result.reason as Error : null);
    expect(reasons[0]).toBe(reasons[1]);
    expect(reasons[0]!.message).toBe('Failed to load /vendor/jszip.min.js');

    const retry = buildCycleFileContext(file('retry.zip'));
    expect(scripts).toHaveLength(2);
    zipWindow.JSZip = { loadAsync: vi.fn(async () => ({ files: {} })) };
    scripts[1]!.dispatchEvent(new Event('load'));
    await expect(retry).resolves.toMatchObject({ kind: 'zip', entries: [] });
    expect(zipWindow.JSZip.loadAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps directory entries out of source detection and preserves archive order', async () => {
    const { buildCycleFileContext, appleHealthArchiveEntry, clueArchiveEntries, naturalCyclesArchiveEntries } = await freshModule();
    const entry = (name: string, dir = false): CycleZipEntry => ({ name, dir, async: vi.fn() });
    const apple = entry('APPLE_HEALTH_EXPORT/EXPORT.XML');
    const clue = entry('backup/ClueBackup.cluedata');
    const csv = entry('tracking_data.csv');
    zipWindow.JSZip = { loadAsync: async () => ({ files: { folder: entry('folder.json', true), apple, clue, csv } }) };
    const context = await buildCycleFileContext(file('archive.zip'));
    expect(context.entries).toEqual([apple, clue, csv]);
    expect(appleHealthArchiveEntry(context)).toBe(apple);
    expect(clueArchiveEntries(context)).toEqual([clue]);
    expect(naturalCyclesArchiveEntries(context)).toEqual([csv]);
  });

  it('translates encrypted archive errors and propagates other archive failures unchanged', async () => {
    const { buildCycleFileContext } = await freshModule();
    const encrypted = new Error('Encrypted ZIP requires a password');
    const readFailure = new Error('Corrupt central directory');
    const loadAsync = vi.fn().mockRejectedValueOnce(encrypted).mockRejectedValueOnce(readFailure);
    zipWindow.JSZip = { loadAsync };
    await expect(buildCycleFileContext(file('encrypted.zip'))).rejects.toThrow('This cycle ZIP is password-protected. Extract it first, then import the Clue JSON file inside.');
    await expect(buildCycleFileContext(file('broken.zip'))).rejects.toBe(readFailure);
  });

  it('leaves XML unread for the streaming parser and reads text exports once', async () => {
    const { buildCycleFileContext, cycleFileKind } = await freshModule();
    const xml = file('EXPORT.XML');
    await expect(buildCycleFileContext(xml)).resolves.toMatchObject({ kind: 'xml', text: null });
    expect(xml.text).not.toHaveBeenCalled();
    const csv = file('export.csv');
    await expect(buildCycleFileContext(csv)).resolves.toMatchObject({ kind: 'csv', text: 'date,flow\n2026-01-01,heavy' });
    expect(csv.text).toHaveBeenCalledTimes(1);
    expect(cycleFileKind({ name: 'backup.cluedata' })).toBe('json');
    expect(cycleFileKind({ name: 'export', type: 'application/zip' })).toBe('zip');
    expect(cycleFileKind(null)).toBe('text');
  });
});
