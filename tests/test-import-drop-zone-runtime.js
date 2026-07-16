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

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Import Drop Zone Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'document',
  'showNotification',
];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalImportRuntimeDeps = configureImportDropZoneRuntimeDeps();
const previousDnaBridge = configureDnaModuleBridge({
  detectDNAFile: null,
  handleMtDNAFile: null,
  handleDNAFile: null,
});

function setRuntimeValue(key, value) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  });
}

function restoreRuntime() {
  for (const key of runtimeKeys) {
    const descriptor = savedDescriptors.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

try {
  const calls = [];
  const jsonFile = new File(['{}'], 'profile.json', { type: 'application/json' });
  const dnaFile = new File(['dna'], 'genome.txt', { type: 'text/plain' });
  const picker = { click: () => calls.push(['picker']) };

  configureImportDropZoneRuntimeDeps({
    importDataJSON: file => calls.push(['json', file.name]),
    isImportRunning: () => true,
    showNotification: (message, type) => calls.push(['notify', type, message]),
  });
  configureDnaModuleBridge({
    detectDNAFile: header => header.includes('MT') ? 'mtdna' : 'autosomal',
    handleMtDNAFile: file => calls.push(['mtdna', file.name]),
    handleDNAFile: file => calls.push(['dna', file.name]),
  });
  setRuntimeValue('document', { getElementById: id => id === 'pdf-input' ? picker : null });

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
      String(error?.message || error).includes('handleDNAFile'));
  }

  delete globalThis.window;
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
  delete globalThis.window;
  await import('../js/import-drop-zone.js?no-window-probe');
  assert('import drop-zone module imports without a browser window', true);
} catch (error) {
  assert('import drop-zone module imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
