import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-import-drop-zone-runtime.js - Import drop-zone browser adapter behavior.

import './_node-shim.js';
import {
  configureImportDropZoneRuntimeDeps,
  detectDropZoneDNAFile,
  handleDropZoneDNAFile,
  handleDropZoneMtDNAFile,
  hasDropZoneMtDNAHandler,
  importDropZoneJSONFile,
  isDropZoneImportRunning,
  openDropZoneFilePicker,
  showDropZoneImportNotification,
} from '../js/import-drop-zone-runtime.js';
import { configureDnaModuleBridge } from '../js/dna-runtime-bridge.js';

const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

console.log('=== Import Drop Zone Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'document',
  'showNotification',
];
const restoreRuntime = captureRuntimeGlobals(runtimeKeys);
const originalImportRuntimeDeps = configureImportDropZoneRuntimeDeps();
const previousDnaBridge = configureDnaModuleBridge({
  detectDNAFile: null,
  handleMtDNAFile: null,
  handleDNAFile: null,
});

try {
  const calls: unknown[][] = [];
  const jsonFile = new File(['{}'], 'profile.json', { type: 'application/json' });
  const dnaFile = new File(['dna'], 'genome.txt', { type: 'text/plain' });
  const picker = { click: () => calls.push(['picker']) };

  configureImportDropZoneRuntimeDeps({
    importDataJSON: file => calls.push(['json', file.name]),
    isImportRunning: () => true,
    showNotification: (message, type) => calls.push(['notify', type, message]),
  });
  configureDnaModuleBridge({
    detectDNAFile: (header: string) => header.includes('MT') ? 'mtdna' : 'autosomal',
    handleMtDNAFile: (file: File) => calls.push(['mtdna', file.name]),
    handleDNAFile: (file: File) => calls.push(['dna', file.name]),
  });
  setRuntimeValue('document', { getElementById: (id: string) => id === 'pdf-input' ? picker : null });

  openDropZoneFilePicker();
  showDropZoneImportNotification('Import already in progress', 'info');
  importDropZoneJSONFile(jsonFile);
  await handleDropZoneMtDNAFile(dnaFile);
  await handleDropZoneDNAFile(dnaFile);

  assert('isDropZoneImportRunning delegates busy state', isDropZoneImportRunning() === true);
  assert('openDropZoneFilePicker clicks the PDF input', calls.some(call => call[0] === 'picker'));
  assert('showDropZoneImportNotification delegates message and type',
    calls.some(call => call[0] === 'notify' && call[1] === 'info' && call[2] === 'Import already in progress'));
  assert('importDropZoneJSONFile delegates JSON import',
    calls.some(call => call[0] === 'json' && call[1] === 'profile.json'));
  assert('detectDropZoneDNAFile delegates DNA detection',
    detectDropZoneDNAFile('MT raw data') === 'mtdna');
  assert('hasDropZoneMtDNAHandler reports handler presence', hasDropZoneMtDNAHandler() === true);
  assert('handleDropZoneMtDNAFile delegates mtDNA import',
    calls.some(call => call[0] === 'mtdna' && call[1] === 'genome.txt'));
  assert('handleDropZoneDNAFile delegates DNA import',
    calls.some(call => call[0] === 'dna' && call[1] === 'genome.txt'));

  configureDnaModuleBridge({ handleDNAFile: null });
  try {
    await handleDropZoneDNAFile(dnaFile);
    assert('required DNA import handler fails loudly when missing', false, 'no error thrown');
  } catch (error) {
    assert('required DNA import handler fails loudly when missing',
      String((error as { message?: unknown } | null | undefined)?.message || error).includes('handleDNAFile'));
  }

  delete (globalThis as Partial<typeof globalThis>).window;
  showDropZoneImportNotification('hidden', 'info');
  openDropZoneFilePicker();
  assert('browser hooks no-op while the DNA bridge remains available without window',
    isDropZoneImportRunning() === false && detectDropZoneDNAFile('MT raw data') === 'mtdna');
} finally {
  configureDnaModuleBridge({
    detectDNAFile: null,
    handleMtDNAFile: null,
    handleDNAFile: null,
    ...previousDnaBridge,
  });
  configureImportDropZoneRuntimeDeps(originalImportRuntimeDeps);
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete (globalThis as Partial<typeof globalThis>).window;
  await import('../js/import-drop-zone.js?no-window-probe' as string);
  assert('import drop-zone module imports without a browser window', true);
} catch (error) {
  assert('import drop-zone module imports without a browser window', false, (error as { message?: unknown } | null | undefined)?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete (globalThis as Partial<typeof globalThis>).window;
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
