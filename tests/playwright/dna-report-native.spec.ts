import { expect, test } from './coverage-fixture.js';

test('DNA report imports a real local PDF, preserves curated calls, and shares the PDF facade extractor', async ({ page }) => {
  await page.route('**/dna-report-native', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><head></head><body><div id="notification-container"></div></body></html>',
  }));
  await page.goto('/dna-report-native');
  const result = await page.evaluate(async () => {
    const { state } = await import('../../js/state.js');
    const dna = await import('../../js/dna.js');
    const runtime = await import('../../js/dna-runtime.js');
    const profileId = 'dna-report-native-fixture';
    state.currentProfile = profileId;
    state.profiles = [{ id: profileId, name: 'Synthetic DNA report', createdAt: Date.now(), lastUpdated: Date.now(), tags: [], notes: '', status: 'active', pinned: false }];
    state.importedData = { ...state.importedData, entries: [], genetics: null };
    const stream = 'BT /F1 12 Tf 20 100 Td (rs1801133 CC - reference call) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((body, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const file = new File([pdf], 'synthetic-clinical.pdf', { type: 'application/pdf' });
    const opened = await dna.handleSnpReportFile(file);
    const pending = runtime.getPendingDnaImport();
    const preview = document.querySelector('#dna-modal-overlay')?.textContent || '';
    const coldResources = performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname);
    await dna.confirmDNAImport();
    const saved = state.importedData.genetics?.snps?.rs1801133;
    const rawOpened = await dna.handleDNAFile(new File(['#AncestryDNA raw data download\nrs1801133\t1\t11856378\tT\tT\n'], 'synthetic-ancestry.txt', { type: 'text/plain' }));
    const rawPending = runtime.getPendingDnaImport();
    await dna.confirmDNAImport();
    const rawSavedGenotype = state.importedData.genetics?.snps?.rs1801133?.genotype;
    const restored = (await import('../../js/profile-data-writes.js')).profileDataBaseline(state.importedData);
    return { pdf, opened, pendingGenotype: pending?.matches.rs1801133?.genotype, source: pending?.source,
      preview, savedGenotype: saved?.genotype, savedSource: saved?.source?.label,
      rawOpened, rawPreviewGenotype: rawPending?.matches.rs1801133?.genotype, preservedOverrideCount: rawPending?.preservedOverrideCount, rawSavedGenotype,
      persistedGenotype: restored?.genetics?.snps?.rs1801133?.genotype,
      coldLoadedLabFacade: coldResources.includes('/js/pdf-import.js') };
  });
  expect(result.opened).toBe(true);
  expect(result.pendingGenotype).toBe('CC');
  expect(result.source).toBe('synthetic-clinical.pdf');
  expect(result.preview).toContain('DNA Import');
  expect(result.savedGenotype).toBe('CC');
  expect(result.savedSource).toBe('synthetic-clinical.pdf');
  expect(result.persistedGenotype).toBe('CC');
  expect(result.rawOpened).toBe(true);
  expect(result.rawPreviewGenotype).toBe('CC');
  expect(result.preservedOverrideCount).toBe(1);
  expect(result.rawSavedGenotype).toBe('CC');
  expect(result.coldLoadedLabFacade).toBe(false);
  const facade = await page.evaluate(async pdf => {
    const moduleUrl = '/js/pdf-import.js';
    const lab = await import(moduleUrl);
    const files = await import('../../js/pdf-import-file-utils.js');
    const file = new File([pdf], 'synthetic-clinical.pdf', { type: 'application/pdf' });
    return { same: lab.extractPDFText === files.extractPDFTextFacade, name: lab.extractPDFText.name,
      arity: lab.extractPDFText.length, text: await lab.extractPDFText(file) };
  }, result.pdf);
  expect(facade.same).toBe(true);
  expect(facade.name).toBe('extractPDFText');
  expect(facade.arity).toBe(1);
  expect(facade.text).toContain('rs1801133 CC');
});
