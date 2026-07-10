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
    loadPdfImport: vi.fn(),
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
  loadPdfImport: mocks.loadPdfImport,
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
    mocks.loadPdfImport.mockResolvedValue(mocks.importModule);
    mocks.importModule.classifyImportFiles.mockResolvedValue(importBuckets());
    mocks.hasDropZoneMtDNAHandler.mockReturnValue(true);
    mocks.isDropZoneImportRunning.mockReturnValue(false);
  });

  it('short-circuits before lazy loading while an import is running', async () => {
    mocks.isDropZoneImportRunning.mockReturnValue(true);
    const target = await runInput([makeFile('profile.json')]);

    expect(target.value).toBe('');
    expect(mocks.loadPdfImport).not.toHaveBeenCalled();
  });

  it('notifies and clears selection when the lazy import module fails', async () => {
    mocks.loadPdfImport.mockRejectedValue(new Error('load failed'));
    const target = await runInput([makeFile('report.pdf')]);

    expect(target.value).toBe('');
    expect(mocks.showDropZoneImportNotification).toHaveBeenCalledWith(
      'Could not load import module - check your connection and try again.',
      'error',
    );
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
