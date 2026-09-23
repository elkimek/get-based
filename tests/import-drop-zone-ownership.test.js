import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { importDispatch } from '../js/pdf-import-progress.js';
const mocks = vi.hoisted(() => ({ load: vi.fn(), classify: vi.fn(), text: vi.fn(), notify: vi.fn() }));
vi.mock('../js/import-loader.js', () => ({ loadImportUI: mocks.load }));
vi.mock('../js/import-drop-zone-runtime.js', () => ({
  isDropZoneImportRunning: () => importDispatch.busy, showDropZoneImportNotification: mocks.notify,
  detectDropZoneDNAFile: vi.fn(), handleDropZoneDNAFile: vi.fn(), handleDropZoneMtDNAFile: vi.fn(),
  hasDropZoneMtDNAHandler: vi.fn(), importDropZoneJSONFile: vi.fn(), openDropZoneFilePicker: vi.fn(),
}));
import { setupDropZone } from '../js/import-drop-zone.js';
let handlers, node;
const file = { name: 'cycle.csv' };
const buckets = () => ({ jsonFiles: [], pdfFiles: [], imageFiles: [], dnaFiles: [], textFiles: [file], cycleFiles: [], unsupportedCount: 0 });
beforeEach(() => {
  vi.resetAllMocks();
  state.currentProfile = 'origin'; state.importedData = {};
  handlers = {};
  node = { dataset: {}, classList: { add: vi.fn(), remove: vi.fn() }, addEventListener: vi.fn((name, handler) => { handlers[name] = handler; }) };
  vi.stubGlobal('document', { getElementById: () => node });
  mocks.load.mockResolvedValue({ classifyImportFiles: mocks.classify, handleTextFile: mocks.text });
  mocks.classify.mockResolvedValue(buckets());
  setupDropZone();
});
afterEach(() => vi.unstubAllGlobals());
const drop = () => handlers.drop({ preventDefault: vi.fn(), dataTransfer: { files: [file] } });
it.each(['load', 'classify'].flatMap(boundary => ['profile', 'data'].map(kind => [boundary, kind])))('rejects %s completion after %s replacement', async (boundary, kind) => {
  const replace = () => { if (kind === 'profile') state.currentProfile = 'other'; else state.importedData = {}; };
  if (boundary === 'load') mocks.load.mockImplementationOnce(async () => { replace(); return { classifyImportFiles: mocks.classify, handleTextFile: mocks.text }; });
  else mocks.classify.mockImplementationOnce(async () => { replace(); return buckets(); });
  await drop(); expect(mocks.text).not.toHaveBeenCalled();
});
it('continues a current-profile drop exactly once after repeated setup', async () => {
  setupDropZone();
  expect(node.addEventListener).toHaveBeenCalledTimes(4);
  await drop(); expect(mocks.text).toHaveBeenCalledExactlyOnceWith(file);
});
it('does not load for an empty drop', async () => {
  await handlers.drop({ preventDefault: vi.fn(), dataTransfer: { files: [] } });
  expect(mocks.load).not.toHaveBeenCalled();
});

it.each(['load', 'classify', 'text'])('rejects overlapping drops while %s is pending, then accepts a new drop', async boundary => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const result = boundary === 'load' ? { classifyImportFiles: mocks.classify, handleTextFile: mocks.text }
    : boundary === 'classify' ? buckets() : undefined;
  mocks[boundary].mockImplementationOnce(async () => { await gate; return result; });
  const first = drop();
  await vi.waitFor(() => expect(mocks[boundary]).toHaveBeenCalledTimes(1));
  await drop();
  expect(mocks.load).toHaveBeenCalledTimes(1);
  expect(mocks.notify).toHaveBeenCalledWith('Import already in progress', 'info');
  release(); await first;
  expect(mocks.text).toHaveBeenCalledTimes(1);
  await drop();
  expect(mocks.text).toHaveBeenCalledTimes(2);
});

it.each(['classify', 'text'])('releases the drop lock after a %s failure', async boundary => {
  mocks[boundary].mockRejectedValueOnce(new Error('Synthetic import failure'));
  await expect(drop()).rejects.toThrow('Synthetic import failure');
  await drop();
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(mocks.text).toHaveBeenLastCalledWith(file);
});
