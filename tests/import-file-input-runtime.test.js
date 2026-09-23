import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const importModule = {
    classifyImportFiles: vi.fn(),
    handleCycleImportFile: vi.fn(),
    handleTextFile: vi.fn(),
    handleImageFile: vi.fn(),
    handlePDFFile: vi.fn(),
    handleBatchPDFs: vi.fn(),
  };
  return {
    importModule,
    loadImportUI: vi.fn(),
    detectDropZoneDNAFile: vi.fn(),
    handleDropZoneDNAFile: vi.fn(),
    handleDropZoneMtDNAFile: vi.fn(),
    hasDropZoneMtDNAHandler: vi.fn(),
    importDropZoneJSONFile: vi.fn(),
    isDropZoneImportRunning: vi.fn(),
    showDropZoneImportNotification: vi.fn(),
  };
});

vi.mock('../js/import-loader.js', () => ({
  loadImportUI: mocks.loadImportUI,
}));

vi.mock('../js/import-drop-zone-runtime.js', () => ({
  detectDropZoneDNAFile: mocks.detectDropZoneDNAFile,
  handleDropZoneDNAFile: mocks.handleDropZoneDNAFile,
  handleDropZoneMtDNAFile: mocks.handleDropZoneMtDNAFile,
  hasDropZoneMtDNAHandler: mocks.hasDropZoneMtDNAHandler,
  importDropZoneJSONFile: mocks.importDropZoneJSONFile,
  isDropZoneImportRunning: mocks.isDropZoneImportRunning,
  showDropZoneImportNotification: mocks.showDropZoneImportNotification,
}));

const { handleImportInputChange } = await import('../js/import-file-input.js');

function importBuckets(overrides = {}) {
  return {
    jsonFiles: [],
    pdfFiles: [],
    imageFiles: [],
    dnaFiles: [],
    textFiles: [],
    cycleFiles: [],
    unsupportedCount: 0,
    ...overrides,
  };
}

function makeInput(files) {
  return { files, value: 'selected' };
}

function makeFile(name, header = '') {
  return {
    name,
    slice: () => ({ text: async () => header }),
  };
}

async function runInput(files) {
  const target = makeInput(files);
  await handleImportInputChange({ target });
  return target;
}

describe('import file input runtime routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadImportUI.mockResolvedValue(mocks.importModule);
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets());
    mocks.hasDropZoneMtDNAHandler.mockReturnValue(true);
    mocks.isDropZoneImportRunning.mockReturnValue(false);
  });

  it('short-circuits before lazy loading while an import is running', async () => {
    mocks.isDropZoneImportRunning.mockReturnValue(true);
    const target = await runInput([makeFile('profile.json')]);

    expect(target.value).toBe('');
    expect(mocks.loadImportUI).not.toHaveBeenCalled();
  });

  it('notifies and clears selection when the lazy import module fails', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.loadImportUI.mockRejectedValue(new Error('load failed'));
    const target = await runInput([makeFile('report.pdf')]);

    expect(target.value).toBe('');
    expect(errorLog).toHaveBeenCalledWith(
      '[import-file-input] Could not load import UI:',
      expect.any(Error),
    );
    expect(mocks.showDropZoneImportNotification).toHaveBeenCalledWith(
      'Could not load import UI. Reload the app to finish updating, then try again.',
      'error',
    );
    errorLog.mockRestore();
  });

  it('routes JSON files through the runtime JSON importer', async () => {
    const json = makeFile('profile.json');
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets({ jsonFiles: [json] }));

    const target = await runInput([json]);

    expect(mocks.importDropZoneJSONFile).toHaveBeenCalledWith(json);
    expect(target.value).toBe('');
  });

  it('routes cycle XML and ZIP files through the cycle importer', async () => {
    const cycleFile = makeFile('export.xml');
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets({ cycleFiles: [cycleFile] }));

    const target = await runInput([cycleFile]);

    expect(mocks.importModule.handleCycleImportFile).toHaveBeenCalledWith(cycleFile);
    expect(mocks.importModule.handleTextFile).not.toHaveBeenCalled();
    expect(target.value).toBe('');
  });

  it('processes every supported bucket in a mixed selection', async () => {
    const cycle = makeFile('export.xml');
    const dna = makeFile('ancestry.txt', '#AncestryDNA');
    const text = makeFile('labs.csv');
    const image = makeFile('result.png');
    const pdf = makeFile('report.pdf');
    mocks.detectDropZoneDNAFile.mockReturnValue('ancestry');
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets({
      cycleFiles: [cycle],
      dnaFiles: [dna],
      textFiles: [text],
      imageFiles: [image],
      pdfFiles: [pdf],
    }));

    await runInput([cycle, dna, text, image, pdf]);

    expect(mocks.importModule.handleCycleImportFile).toHaveBeenCalledWith(cycle);
    expect(mocks.handleDropZoneDNAFile).toHaveBeenCalledWith(dna);
    expect(mocks.importModule.handleTextFile).toHaveBeenCalledWith(text);
    expect(mocks.importModule.handleImageFile).toHaveBeenCalledWith(image);
    expect(mocks.importModule.handlePDFFile).toHaveBeenCalledWith(pdf);
  });

  it('routes mtDNA files through the runtime mtDNA handler', async () => {
    const dna = makeFile('genome-mtdna.txt', 'MT raw data');
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets({ dnaFiles: [dna] }));
    mocks.detectDropZoneDNAFile.mockReturnValue('mtdna');

    await runInput([dna]);

    expect(mocks.detectDropZoneDNAFile).toHaveBeenCalledWith('MT raw data');
    expect(mocks.handleDropZoneMtDNAFile).toHaveBeenCalledWith(dna);
    expect(mocks.handleDropZoneDNAFile).not.toHaveBeenCalled();
  });

  it('routes autosomal DNA files through the runtime DNA handler', async () => {
    const dna = makeFile('ancestry.txt', '#AncestryDNA');
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets({ dnaFiles: [dna] }));
    mocks.detectDropZoneDNAFile.mockReturnValue('ancestry');

    await runInput([dna]);

    expect(mocks.handleDropZoneDNAFile).toHaveBeenCalledWith(dna);
    expect(mocks.handleDropZoneMtDNAFile).not.toHaveBeenCalled();
  });

  it('reports Y-chromosome DNA files without invoking DNA handlers', async () => {
    const dna = makeFile('23andme-y.txt', 'Y raw data');
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets({ dnaFiles: [dna] }));
    mocks.detectDropZoneDNAFile.mockReturnValue('23andme-y');

    await runInput([dna]);

    expect(mocks.showDropZoneImportNotification).toHaveBeenCalledWith(
      'Y-chromosome DNA files are not supported',
      'info',
    );
    expect(mocks.handleDropZoneDNAFile).not.toHaveBeenCalled();
    expect(mocks.handleDropZoneMtDNAFile).not.toHaveBeenCalled();
  });
});

// The selected files belong to the profile active before lazy loading/classification.
describe('file selection ownership', () => {
  it.each(['load', 'classify'])('rejects a profile switch during %s', async boundary => {
    const { state } = await import('../js/state.js');
    vi.clearAllMocks();
    state.currentProfile = 'origin';
    const file = makeFile('cycle.csv');
    mocks.isDropZoneImportRunning.mockReturnValue(false);
    mocks.loadImportUI.mockImplementation(async () => {
      if (boundary === 'load') state.currentProfile = 'replacement';
      return mocks.importModule;
    });
    mocks.importModule.classifyImportFiles.mockImplementation(async () => {
      if (boundary === 'classify') state.currentProfile = 'replacement';
      return importBuckets({ textFiles: [file] });
    });
    const input = await runInput([file]);
    expect(mocks.importModule.handleTextFile).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });
});

it.each(['load', 'classify'])('rejects replacement data during %s without a profile switch', async boundary => {
  const { state } = await import('../js/state.js');
  vi.clearAllMocks();
  state.currentProfile = 'origin'; state.importedData = {};
  const file = makeFile('cycle.csv');
  mocks.isDropZoneImportRunning.mockReturnValue(false);
  mocks.loadImportUI.mockImplementation(async () => {
    if (boundary === 'load') state.importedData = {};
    return mocks.importModule;
  });
  mocks.importModule.classifyImportFiles.mockImplementation(async () => {
    if (boundary === 'classify') state.importedData = {};
    return importBuckets({ textFiles: [file] });
  });
  await runInput([file]);
  expect(mocks.importModule.handleTextFile).not.toHaveBeenCalled();
});
it.each(['success', 'failure'])('preserves a newer file selection after older load %s', async outcome => {
  vi.clearAllMocks();
  mocks.isDropZoneImportRunning.mockReturnValue(false);
  const original = makeFile('original.csv'), newer = makeFile('newer.csv');
  const target = makeInput([original]);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.loadImportUI.mockImplementationOnce(async () => {
    target.files = [newer]; target.value = 'new selection';
    if (outcome === 'failure') throw new Error('load failed');
    return mocks.importModule;
  });
  mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets());
  try {
    await handleImportInputChange({ target });
    expect(target.value).toBe('new selection');
    if (outcome === 'success') expect(mocks.importModule.classifyImportFiles).toHaveBeenCalledWith([original]);
  } finally { errors.mockRestore(); }
});

describe('mixed selection boundaries', () => {
  let state;
  beforeEach(async () => {
    ({ state } = await import('../js/state.js'));
    vi.resetAllMocks(); state.currentProfile = 'origin'; state.importedData = {};
    mocks.loadImportUI.mockResolvedValue(mocks.importModule);
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets());
  });
  it.each(['profile', 'data'])('rejects DNA header completion after %s replacement', async kind => {
    const file = { name: 'ancestry.txt', slice: () => ({ text: async () => {
      if (kind === 'profile') state.currentProfile = 'other'; else state.importedData = {};
      return '#AncestryDNA';
    } }) };
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets({ dnaFiles: [file] }));
    await runInput([file]);
    expect(mocks.handleDropZoneDNAFile).not.toHaveBeenCalled();
    expect(mocks.handleDropZoneMtDNAFile).not.toHaveBeenCalled();
  });
  it.each([
    ['jsonFiles', 'importDropZoneJSONFile'], ['cycleFiles', 'handleCycleImportFile'],
    ['textFiles', 'handleTextFile'], ['imageFiles', 'handleImageFile'],
  ])('stops remaining %s and PDF work after profile navigation', async (bucket, handler) => {
    const files = [makeFile('first'), makeFile('second')], pdf = makeFile('last.pdf');
    const fn = mocks[handler] || mocks.importModule[handler];
    fn.mockImplementationOnce(async () => { state.currentProfile = 'other'; });
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets({ [bucket]: files, pdfFiles: [pdf] }));
    await runInput([...files, pdf]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mocks.importModule.handlePDFFile).not.toHaveBeenCalled();
  });
  it('allows intentional same-profile JSON data replacement before the next file', async () => {
    const json = makeFile('profile.json'), text = makeFile('cycle.csv');
    mocks.importDropZoneJSONFile.mockImplementationOnce(async () => { state.importedData = {}; });
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets({ jsonFiles: [json], textFiles: [text] }));
    await runInput([json, text]);
    expect(mocks.importModule.handleTextFile).toHaveBeenCalledExactlyOnceWith(text);
  });
  it('does not erase a newer selection if an import handler rejects', async () => {
    const target = makeInput([makeFile('bad.csv')]);
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets({ textFiles: target.files }));
    mocks.importModule.handleTextFile.mockImplementationOnce(async () => { target.value = 'new selection'; throw new Error('read failed'); });
    await expect(handleImportInputChange({ target })).rejects.toThrow('read failed');
    expect(target.value).toBe('new selection');
  });
});

describe('overlapping picker invocations', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { state } = await import('../js/state.js');
    state.currentProfile = 'origin'; state.importedData = {};
    mocks.loadImportUI.mockResolvedValue(mocks.importModule);
    mocks.importModule.classifyImportFiles.mockImplementation(async files => importBuckets({ textFiles: files }));
  });
  it.each(['load', 'classify', 'header', 'between-files'])('supersedes an older selection during %s', async boundary => {
    let release, entered;
    const pending = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const older = makeFile('older.csv'), newer = makeFile('newer.csv'), remaining = makeFile('remaining.csv');
    if (boundary === 'load') mocks.loadImportUI.mockImplementationOnce(async () => { entered(); await pending; return mocks.importModule; });
    if (boundary === 'classify') mocks.importModule.classifyImportFiles.mockImplementationOnce(async () => { entered(); await pending; return importBuckets({ textFiles: [older] }); });
    if (boundary === 'header') {
      older.slice = () => ({ text: async () => { entered(); await pending; return '#AncestryDNA'; } });
      mocks.importModule.classifyImportFiles.mockResolvedValueOnce(importBuckets({ dnaFiles: [older] }));
    }
    if (boundary === 'between-files') mocks.importModule.handleTextFile.mockImplementationOnce(async () => { entered(); await pending; });
    const oldTask = runInput(boundary === 'between-files' ? [older, remaining] : [older]);
    await started;
    await runInput([newer]);
    release(); await oldTask;
    expect(mocks.importModule.handleTextFile.mock.calls.map(([file]) => file.name))
      .toEqual(boundary === 'between-files' ? ['older.csv', 'newer.csv'] : ['newer.csv']);
    expect(mocks.handleDropZoneDNAFile).not.toHaveBeenCalled();
  });
});
