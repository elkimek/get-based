// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import * as dataModule from '../js/data.js';
import { buildPreparedReportPayload } from '../js/export-report.js';
import { invalidateActiveDataCache } from '../js/data.js';
import { buildReportDataSnapshot, buildReportGenetics, formatReportDataForAgent } from '../js/export-report-data.js';
import { buildReportHTML as renderReportHTML, exportPDFReport } from '../js/export-report-html.js';

const buildReportHTML = (...args) => { args[7] = { ...args[7], detailed: true }; return renderReportHTML(...args); };
const { loadCatalog } = vi.hoisted(() => ({ loadCatalog: vi.fn() }));
vi.mock('../js/dna-evidence.js', async original => ({ ...await original(), loadSnpCatalog: loadCatalog }));
const catalog = JSON.parse(readFileSync('data/snp-health.json', 'utf8'));
const options = { preset: 'full', dateRange: 'all', sections: ['genetics'], genomeVariants: ['rs4680', 'rs1815739', 'rs11591147', 'rs10455872', 'rsUnknown'] };
const emptyLabs = { dates: [], categories: {} };
const genetics = {
  source: 'Synthetic DNA', importDate: '<img src=x onerror=alert(1)>',
  coverage: { found: 5, total: 60 },
  snps: {
    rs4680: { genotype: 'AA' },
    rs1815739: { genotype: 'TT' },
    rs11591147: { genotype: 'AC' }, // reverse complement of the catalog's protective GT
    rs10455872: { genotype: 'AG' },
    rsUnknown: { genotype: 'AA', effect: 'significant', valence: 'protective' },
  },
  mtdna: { haplogroup: 'J1c', details: 'Maternal lineage fixture', matchedMutations: 4, totalDiagnostic: 7 },
};
function snapshot() {
  return buildReportDataSnapshot({ data: emptyLabs, profile: { name: 'Selected person' }, importedData: { genetics }, snpTable: catalog, reportOptions: options });
}
function render(data = emptyLabs, reportOptions = options) {
  return buildReportHTML('Selected person', 'Female', data, [], [], [], [], reportOptions);
}

beforeEach(() => {
  localStorage.clear();
  state.currentProfile = 'report-genome';
  state.profiles = [{ id: 'report-genome', name: 'Selected person', sex: 'female' }];
  state.profileSex = 'female';
  state.profileDob = '';
  state.rangeMode = 'reference';
  state.unitSystem = 'EU';
  state.dateRangeFilter = 'all';
  state.importedData = { entries: [], notes: [], supplements: [], customMarkers: {}, genetics: structuredClone(genetics) };
  window._snpTableCache = null;
  loadCatalog.mockReset();
  invalidateActiveDataCache();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Genome report parity', () => {
  it('preserves traits, protective calls, risk associations and independent evidence grades', () => {
    const report = snapshot();
    const rows = Object.fromEntries(report.genetics.findings.map(f => [f.rsid, f]));
    expect(rows.rs4680).toMatchObject({ direction: 'informational trait', evidence: { evidenceLevel: 'strong', relevanceLevel: 'trait' } });
    expect(rows.rs1815739.direction).toBe('informational trait');
    expect(rows.rs11591147.direction).toBe('protective association');
    expect(rows.rs10455872.direction).toBe('risk association');
    expect(rows.rsUnknown).toMatchObject({ direction: 'unclassified', evidence: { evidenceLevel: 'unreviewed' } });
    const html = render(emptyLabs, { ...options, reportData: report });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('.genetics-table tbody tr')).toHaveLength(5);
    expect(doc.querySelector('.genome-risk').textContent).toBe('risk association');
    expect(doc.querySelector('.genome-trait').textContent).toBe('informational trait');
    expect(doc.querySelector('.genome-protective').textContent).toBe('protective association');
    expect(doc.querySelector('.genome-neutral').textContent).toBe('unclassified');
    const reference = doc.querySelector('.genetics-table a');
    expect(reference.href).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);
    expect(reference.textContent).toMatch(/^PubMed \d+$/);
    expect(reference.rel).toBe('noopener noreferrer');
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.body.textContent).toContain(genetics.importDate);
    expect(doc.body.textContent).toContain('Marker match: 4 / 7');
    expect(doc.body.textContent).toContain('Catalog coverage at import: 5 / 60');
    expect(doc.body.textContent).toContain('Genotype context:');
    const context = formatReportDataForAgent(report);
    expect(context).toContain('rs4680 AA: informational trait');
    expect(context).toContain('rs11591147 AC: protective association');
    expect(context).toContain('mtDNA haplogroup: J1c');
  });


  it.each([false, true])('keeps AI-origin labels outside editable text and in both report layouts (detailed=%s)', detailed => {
    const html = render(emptyLabs, { ...options, detailed, reportData: snapshot(), aiSummary: { text: 'Synthetic overview', model: '<img src=x>' } });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('.report-header .report-origin-notice').textContent).toContain('AI-generated overview');
    expect(doc.querySelector('.report-ai-summary h2').textContent).toBe('AI-generated overview');
    expect(doc.querySelector('.report-origin-notice').closest('[contenteditable]')).toBeNull();
    expect(doc.querySelector('img')).toBeNull();
    const without = new DOMParser().parseFromString(render(emptyLabs, { ...options, detailed, reportData: snapshot() }), 'text/html');
    expect(without.querySelector('.report-origin-notice')).toBeNull();
    expect(without.querySelector('.report-origin-note').textContent).toContain('No new AI overview');
  });

  it('escapes reference text and attributes and rejects executable reference URLs', () => {
    const report = snapshot();
    report.genetics.findings = [report.genetics.findings[0]];
    report.genetics.findings[0].tone = 'risk" onmouseover="alert(1)';
    report.genetics.findings[0].references = [
      'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
      'not a URL <img src=x onerror=alert(1)>',
      'https://example.com/?q=" onclick="alert(1)&v=<test>',
    ];
    const doc = new DOMParser().parseFromString(render(emptyLabs, { ...options, reportData: report }), 'text/html');
    expect(doc.querySelectorAll('.genetics-table a')).toHaveLength(1);
    expect(doc.querySelector('a').hostname).toBe('example.com');
    expect(doc.querySelector('[onclick], [onmouseover], img, script')).toBeNull();
    expect(doc.querySelector('.genome-neutral')).not.toBeNull();
    expect(doc.body.textContent).toContain('not a URL <img src=x onerror=alert(1)>');
  });

  it.each(['reference', 'optimal', 'both'])('uses the report %s mode consistently without changing dashboard ranges', mode => {
    state.rangeMode = mode === 'reference' ? 'optimal' : 'reference';
    const dashboardMode = state.rangeMode;
    vi.spyOn(dataModule, 'getActiveData').mockReturnValue({ dates: ['2026-01-01'], categories: { lab: { label: 'Test lab', markers: {
      sample: { name: 'Range fixture', unit: 'u', values: [7], refMin: 1, refMax: 10, optimalMin: 3, optimalMax: 5, referenceRangeSource: 'import' },
    } } } });
    const payload = buildPreparedReportPayload({ preset: 'full', sections: ['categories', 'flagged', 'summary'], dateRange: 'all', rangeMode: mode });
    expect(payload.reportOptions.rangeMode).toBe(mode);
    expect(payload.reportData.scope.rangeMode).toBe(mode);
    expect(payload.flags).toHaveLength(mode === 'reference' ? 0 : 1);
    expect(payload.reportData.labs.flags).toHaveLength(payload.flags.length);
    const doc = new DOMParser().parseFromString(buildReportHTML('Fixture', 'Female', payload.data, payload.flags, [], [], [], { ...payload.reportOptions, reportData: payload.reportData }), 'text/html');
    expect(doc.querySelector('.report-stat-value').textContent).toBe(mode === 'reference' ? '0' : '1');
    const cells = [...doc.querySelectorAll('td')].map(cell => cell.textContent);
    expect(cells.some(text => text.includes('Lab reference: 1 – 10'))).toBe(mode !== 'optimal');
    expect(cells.some(text => text.includes('opt: 3 – 5'))).toBe(mode !== 'reference');
    const agentText = formatReportDataForAgent(payload.reportData);
    expect(agentText).toContain(`Range mode: ${mode}`);
    expect(agentText.includes('Lab reference 1-10')).toBe(mode !== 'optimal');
    expect(agentText.includes('Optimal 3-5')).toBe(mode !== 'reference');
    expect(state.rangeMode).toBe(dashboardMode);
  });

  it('retains phase-specific precedence and reference fallback under selected report ranges', () => {
    vi.spyOn(dataModule, 'getActiveData').mockReturnValue({ dates: ['2026-01-01'], categories: { lab: { label: 'Test lab', markers: {
      phase: { name: 'Phase fixture', values: [7], refMin: 1, refMax: 10, optimalMin: 3, optimalMax: 5, phaseRefRanges: [{ min: 6, max: 8, label: 'Phase reference' }] },
      fallback: { name: 'Fallback fixture', values: [7], refMin: 1, refMax: 10 },
    } } } });
    const payload = buildPreparedReportPayload({ preset: 'full', sections: ['categories'], dateRange: 'all', rangeMode: 'optimal' });
    expect(payload.flags).toEqual([]);
    expect(payload.reportData.labs.summary.latestInRangeCount).toBe(2);
    const results = payload.reportData.labs.categories[0].markers.map(marker => marker.latestResult);
    expect(results[0].ranges.judging).toMatchObject({ kind: 'phase', min: 6, max: 8 });
    expect(results[1].ranges.judging).toMatchObject({ kind: 'reference', min: 1, max: 10 });
  });

  it('retains neutral, reference, unmatched and malformed calls without inventing annotations', () => {
    const result = buildReportGenetics({ snps: { rsNeutral: { genotype: 'AA' }, rsReference: { genotype: 'AA' }, rsBad: null, rsWrong: { genotype: 'N/A' } } }, {
      rsNeutral: { genotypes: { AA: { effect: 'none', valence: 'neutral' } } },
      rsReference: { genotypes: { AA: { effect: 'none' } } },
      rsWrong: { genotypes: { AA: { effect: 'significant' } } },
    });
    expect(result.findings.map(f => f.direction)).toEqual(['neutral finding', 'reference finding', 'unclassified', 'unclassified']);
    expect(buildReportGenetics(genetics).findings.every(f => f.direction === 'unclassified')).toBe(true);
  });

  it('uses the selected snapshot and never substitutes the active profile genetics', () => {
    const report = snapshot();
    state.importedData.genetics = { apoe: 'Other person private APOE' };
    expect(render(emptyLabs, { ...options, reportData: report })).not.toContain('Other person private');
    expect(render(emptyLabs, { ...options, reportData: { ...report, genetics: null } })).not.toContain('Other person private');
  });

  it('loads the catalog on a cold export and keeps the captured profile while awaiting it', async () => {
    let resolveCatalog;
    loadCatalog.mockImplementation(() => new Promise(resolve => { resolveCatalog = resolve; }));
    let html = '';
    const preview = { document: { write: vi.fn(value => { html = value; }), close: vi.fn(), querySelector: () => null }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(preview);
    const pending = exportPDFReport(options);
    expect(window.open).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(loadCatalog).toHaveBeenCalledOnce());
    state.currentProfile = 'other';
    state.importedData = { genetics: { apoe: 'Other person private APOE' } };
    state.rangeMode = 'optimal';
    resolveCatalog(catalog);
    expect(await pending).toBe(true);
    expect(html).toContain('Selected person health report');
    expect(html).toContain('protective association');
    expect(html).not.toContain('Other person private');
    expect(html).toContain('<dd>Reference</dd>');
  });

  it('reports catalog failures and leaves no misleading partial preview', async () => {
    loadCatalog.mockRejectedValue(new Error('offline'));
    const preview = { document: { write: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(preview);
    expect(await exportPDFReport(options)).toBe(false);
    expect(preview.document.write).not.toHaveBeenCalled();
    expect(preview.close).toHaveBeenCalledOnce();
  });

  it('does not disclose lab counts or collection context when only genetics is selected', () => {
    const html = render({ dates: ['2026-01-01'], categories: { chemistry: { markers: { private: { values: [99], name: 'Private lab' } } } } });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('.report-overview')).toBeNull();
    expect(doc.body.textContent).not.toContain('Private lab');
    expect(doc.body.textContent).toContain('Lab results not selected');
  });

  it('does not retain an unrelated lab date for a category containing only a single-point measurement', () => {
    vi.spyOn(dataModule, 'getActiveData').mockReturnValue({ dates: ['2026-01-01'], categories: { spot: { markers: { only: { singlePoint: true, singleDate: '2026-04-02', values: [7] } } } } });
    const payload = buildPreparedReportPayload({ ...options, sections: ['categories'], categoryKeys: ['spot'] });
    expect(payload.data.dates).toEqual([]);
    expect(payload.reportData.labs.dates).toContain('2026-04-02');
  });

  it('renders independently dated measurements at their own dates, including without lab draws', () => {
    const data = { dates: ['2026-01-01'], categories: { mixed: { label: 'Mixed dates', markers: {
      serial: { name: 'Serial', unit: 'u', values: [2] },
      spot: { name: 'Spot', unit: 'u', singlePoint: true, singleDate: '2026-04-02', values: [7] },
    } } } };
    const doc = new DOMParser().parseFromString(render(data, { ...options, sections: ['categories'] }), 'text/html');
    const row = [...doc.querySelectorAll('tr')].find(tr => tr.textContent.includes('Spot'));
    expect([...row.querySelectorAll('td')].map(td => td.textContent)).toEqual(['Spot', 'u', 'Reference: not set', '—', '7', '—']);
    expect(doc.body.textContent).toContain('Apr 2, 2026');
    data.dates = [];
    delete data.categories.mixed.markers.serial;
    expect(render(data, { ...options, sections: ['categories'] })).toContain('>7</td>');
  });
});
