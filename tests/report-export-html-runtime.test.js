// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { state } from '../js/state.js';
import { buildReportHTML, exportPDFReport } from '../js/export-report-html.js';

const exportReportHtmlSource = readFileSync(
  'js/export-report-html.js',
  'utf8',
);

function makeFlags() {
  return [
    {
      name: 'Low Marker <Flag>',
      value: '0.50',
      rawValue: 0.5,
      unit: 'u',
      refMin: 1,
      refMax: 2,
      optimalMin: 1.2,
      optimalMax: 1.8,
      effectiveMin: 1,
      effectiveMax: 2,
      status: 'low',
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      name: `High Marker ${index + 1}`,
      value: String(31 + index),
      rawValue: 31 + index,
      unit: 'u',
      refMin: 0,
      refMax: 30,
      effectiveMin: 0,
      effectiveMax: 30,
      status: 'high',
    })),
  ];
}

function makeTrendMarkers() {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [
    `trend${index}`,
    {
      name: `Trend Marker ${index + 1}`,
      unit: 'u',
      refMin: 0,
      refMax: 20,
      values: [5, 7 + index],
    },
  ]));
}

function makeDenseData() {
  return {
    dates: ['2026-01-01', '2026-02-01'],
    categories: {
      chemistry: {
        label: 'Chemistry <Set>',
        markers: {
          albumin: {
            name: 'Albumin',
            unit: 'g/L',
            refMin: 35,
            refMax: 50,
            optimalMin: 40,
            optimalMax: 46,
            values: [42, null],
          },
          ferritin: { name: 'Ferritin', unit: 'ug/L', refMin: 30, refMax: 150, values: [null, 180] },
          zero: { name: 'Zero Trend Marker', unit: 'u', refMin: 0, refMax: 10, values: [0, 8] },
          stable: { name: 'Stable Marker', unit: 'u', refMin: 0, refMax: 10, values: [5, 5.05] },
        },
      },
      trends: {
        label: 'Trend Group',
        markers: makeTrendMarkers(),
      },
      spot: {
        label: 'Single Point',
        singleDate: true,
        singleDateLabel: 'Spot check',
        markers: {
          spotLow: { name: 'Spot Marker', unit: 'u', refMin: 1, refMax: 2, values: [0.5] },
        },
      },
    },
  };
}

function resetReportState() {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '<div id="notification-container"></div>';
  vi.useRealTimers();

  state.currentProfile = 'report-html-runtime';
  state.profileSex = 'female';
  state.profileDob = '1990-01-02';
  state.rangeMode = 'reference';
  state.unitSystem = 'EU';
  state.dateRangeFilter = 'all';
  state.profiles = [{
    id: 'report-html-runtime',
    name: 'Runtime Report',
    sex: 'female',
    dob: '1990-01-02',
    location: { city: 'Prague', country: 'CZ' },
    height: 170,
    heightUnit: 'cm',
    tags: [],
    notes: '',
    status: 'active',
  }];
  state.importedData = {
    entries: [],
    notes: [],
    supplements: [],
    genetics: null,
    biometrics: {
      weight: [{ date: '2026-02-01', value: 63, unit: 'kg' }],
      bp: [{ date: '2026-02-01', sys: 118, dia: 74 }],
      pulse: [{ date: '2026-02-01', value: 58 }],
    },
    customMarkers: {},
  };
  window._snpTableCache = null;
}

describe('report HTML runtime coverage', () => {
  beforeEach(() => {
    resetReportState();
  });

  it('keeps report renderer globals behind runtime helpers', () => {
    expect(exportReportHtmlSource).toContain('function getReportRuntimeWindow()');
    expect(exportReportHtmlSource).toContain('function openReportPreviewWindow()');
    expect(exportReportHtmlSource).toContain('function getReportSnpTableCache()');
    expect(exportReportHtmlSource).not.toMatch(/\bwindow(?:\.|\s*\[)/);
  });

  it('identifies the Australia / New Zealand unit profile in report metadata', () => {
    state.unitSystem = 'ANZ';
    const report = buildReportHTML(
      'ANZ Profile',
      'Female',
      { dates: [], categories: {} },
      [],
      [],
      [],
      [],
      { preset: 'personal', sections: ['summary'] },
    );
    expect(report).toContain('Australia / New Zealand');
  });

  it('uses each result date contextual range for table status ranges and totals', () => {
    state.rangeMode = 'optimal';
    const report = buildReportHTML(
      'Context Range Profile',
      'Female',
      {
        dates: ['2026-01-10', '2026-08-10'],
        categories: {
          chemistry: {
            label: 'Chemistry',
            markers: {
              contextual: {
                storageDotKey: 'chemistry.contextual',
                name: 'Contextual marker',
                unit: 'u',
                refMin: 0,
                refMax: 12,
                optimalMin: 2,
                optimalMax: 5,
                contextOptimalRanges: [{ min: 2, max: 5 }, { min: 4, max: 8 }],
                contextOptimalRangeLabels: ['Earlier guidance', 'Current guidance'],
                values: [6, 6],
              },
            },
          },
        },
      },
      [],
      [],
      [],
      [],
      {
        preset: 'full',
        dateRange: 'all',
        sections: ['summary', 'categories'],
        reportData: {
          labs: {
            collectionContextByDate: {
              '2026-08-10': { sampleTime: '14:30', fasting: false },
            },
            categories: [{
              markers: [{
                id: 'chemistry.contextual',
                storageDotKey: 'chemistry.contextual',
                note: 'Use assay-specific interpretation',
                results: [
                  { date: '2026-01-10', dateIndex: 0, note: null, source: { file: 'earlier.pdf' } },
                  { date: '2026-08-10', dateIndex: 1, note: 'Afternoon retest', source: { file: 'current.pdf' } },
                ],
              }],
            }],
          },
        },
      },
    );

    expect(report).toContain('Jan 10, 2026: <span class="optimal">Earlier guidance: 2 \u2013 5</span>');
    expect(report).toContain('Aug 10, 2026: <span class="optimal">Current guidance: 4 \u2013 8</span>');
    expect(report).toContain('class="val-high">\u25B2 6</td>');
    expect(report).toContain('class="val-normal">6<div class="report-value-note">Afternoon retest</div></td>');
    expect(report).toContain('<strong>Within Optimal Range:</strong> 1 of 1 markers with data');
    expect(report).toContain('<h2>Collection Context</h2>');
    expect(report).toContain('Sample Time: 14:30 · Fasting: No · Source: current.pdf');
    expect(report).toContain('Use assay-specific interpretation');
    expect(report).toContain('Afternoon retest');
  });

  it('renders sparse dense genetics supplement context and trend report branches', () => {
    state.importedData.genetics = {
      mtdna: {
        haplogroup: 'J1c',
        source: 'mtDNA only <source>',
      },
    };

    const sparseReport = buildReportHTML(
      'Sparse <Profile>',
      'Not specified',
      {
        dates: [],
        categories: {
          empty: {
            label: 'Empty Group',
            markers: {
              none: { name: 'No Value', unit: 'mg/L', refMin: 0, refMax: 10, values: [null, undefined] },
            },
          },
        },
      },
      [],
      [],
      [{
        name: 'No dosage supplement',
        type: '',
        startDate: '2026-01-01',
        endDate: '2026-02-01',
      }],
      [{ title: 'Plain Context', text: 'Single context line <safe>' }],
      {
        preset: 'personal',
        dateRange: '3m',
        sections: ['summary', 'categories', 'supplements', 'context', 'genetics'],
      },
    );

    expect(sparseReport).toContain('Sparse &lt;Profile&gt; lab report');
    expect(sparseReport).toContain('No lab results are available for the selected report window');
    expect(sparseReport).toContain('No lab dates in selected range');
    expect(sparseReport).toContain('No dosage supplement');
    expect(sparseReport).toContain('<td>\u2014</td><td>\u2014</td>');
    expect(sparseReport).toContain('Single context line &lt;safe&gt;');
    expect(sparseReport).toContain('mtDNA Haplogroup:</strong> J1c');
    expect(sparseReport).not.toContain('<h2>Empty Group</h2>');

    state.rangeMode = 'both';
    state.importedData.genetics = {
      source: 'Runtime DNA',
      importDate: '2026-01-15',
      apoe: 'E3/E4',
      snps: {
        rs429358: { genotype: 'CT', gene: 'APOE', variant: 'APOE skip' },
        rsSig: { genotype: 'AG', gene: 'SIG', variant: 'Reverse significant' },
        rsSig2: { genotype: 'GG', gene: 'SIG2', variant: 'Same category moderate' },
        rsMod: { genotype: 'CC', gene: 'MOD', variant: 'Moderate variant' },
        rsNone: { genotype: 'TT', gene: 'NONE', variant: 'None variant' },
        rsMissing: { genotype: 'AA', gene: 'MISS', variant: 'Missing variant' },
      },
      mtdna: {
        haplogroup: 'H1',
        coupling: { label: 'Cold-adapted', climate: 'temperate' },
        source: 'mtDNA file',
      },
    };
    window._snpTableCache = {
      rsSig: {
        category: 'iron',
        genotypes: {
          GA: { effect: 'significant', note: 'Reversed genotype note' },
        },
      },
      rsSig2: {
        category: 'iron',
        genotypes: {
          GG: { effect: 'moderate', note: 'Same category moderate note' },
        },
      },
      rsMod: {
        category: 'vitaminD',
        genotypes: {
          CC: { effect: 'moderate', note: 'Moderate genotype note' },
        },
      },
      rsNone: {
        category: 'other',
        genotypes: {
          TT: { effect: 'none', note: 'No report row' },
        },
      },
    };

    const denseReport = buildReportHTML(
      'Dense Runtime',
      'Female',
      makeDenseData(),
      makeFlags(),
      [{ date: '2026-02-03', text: 'Dense note <escape>' }],
      [{
        name: 'Dose Stack',
        dose: '100 mg',
        amount: '1 cap',
        frequency: 'daily',
        type: 'medication',
        startDate: '2026-01-01',
        endDate: '2026-03-01',
        timesPerDay: 2,
        ingredients: [
          { name: '', amount: '' },
          { name: 'Zinc', amount: '15 mg' },
        ],
      }],
      [{ title: 'Structured Context', text: 'Goal: cover report renderer\nUnkeyed context line <escaped>' }],
      {
        preset: 'full',
        dateRange: 'all',
        sections: ['summary', 'flagged', 'categories', 'trends', 'supplements', 'notes', 'genetics', 'context'],
      },
    );

    expect(denseReport).toContain('2 lab dates covering 14 markers across 3 lab groups.');
    expect(denseReport).toContain('11 latest markers are outside range.');
    expect(denseReport).toContain('Out of Range Highlights (10 of 11)');
    expect(denseReport).toContain('See Notable Trends for the full list of 9 changes.');
    expect(denseReport).toContain('<h2>Chemistry &lt;Set&gt;</h2>');
    expect(denseReport).toContain('<span class="optimal">opt: 40 \u2013 46</span>');
    expect(denseReport).toContain('class="val-missing">\u2014</td>');
    expect(denseReport).toContain('<th>Spot check</th>');
    expect(denseReport).toContain('100 mg<br>1 cap<br>daily<br>Zinc 15 mg x 2/day -&gt; 30 mg/day');
    expect(denseReport).toContain('Dense note &lt;escape&gt;');
    expect(denseReport).toContain('<dt>Goal</dt><dd>cover report renderer</dd>');
    expect(denseReport).toContain('Unkeyed context line &lt;escaped&gt;');
    expect(denseReport).toContain('SIG');
    expect(denseReport).toContain('Significant');
    expect(denseReport).toContain('Reversed genotype note');
    expect(denseReport).toContain('SIG2');
    expect(denseReport).toContain('Same category moderate note');
    expect(denseReport).toContain('MOD');
    expect(denseReport).toContain('Moderate genotype note');
    expect(denseReport).toContain('APOE:</strong> E3/E4');
    expect(denseReport).toContain('mtDNA Haplogroup:</strong> H1');
    expect(denseReport).not.toContain('NONE');
    expect(denseReport).not.toContain('MISS');
  });

  it('exports a preview and wires the print button handler', () => {
    vi.useFakeTimers();
    state.importedData.entries = [{
      date: '2026-02-01',
      markers: { 'biochemistry.glucose': 5.6 },
    }];

    let capturedReport = '';
    let printHandler = null;
    const print = vi.fn();
    window.open = vi.fn(() => ({
      document: {
        write(markup) { capturedReport += markup; },
        close: vi.fn(),
        querySelector(selector) {
          expect(selector).toBe('.report-print-btn');
          return {
            addEventListener(type, handler) {
              expect(type).toBe('click');
              printHandler = handler;
            },
          };
        },
      },
      print,
    }));

    expect(exportPDFReport({
      preset: 'personal',
      dateRange: 'all',
      sections: ['summary', 'categories'],
      categoryKeys: ['biochemistry'],
    })).toBe(true);

    expect(capturedReport).toContain('Runtime Report lab report');
    expect(capturedReport).toContain('Glucose');
    expect(capturedReport).toContain('Print / Save PDF');
    expect(document.querySelector('.notification-toast.info')?.textContent).toContain('PDF preview opened');
    expect(printHandler).toEqual(expect.any(Function));

    printHandler();
    expect(print).toHaveBeenCalledTimes(1);
    vi.runOnlyPendingTimers();
  });
});
