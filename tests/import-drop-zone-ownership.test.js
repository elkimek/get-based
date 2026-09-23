import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
const mocks = vi.hoisted(() => ({ load: vi.fn(), classify: vi.fn(), text: vi.fn(), notify: vi.fn() }));
vi.mock('../js/import-loader.js', () => ({ loadImportUI: mocks.load }));
vi.mock('../js/import-drop-zone-runtime.js', () => ({
  isDropZoneImportRunning: () => false, showDropZoneImportNotification: mocks.notify,
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
