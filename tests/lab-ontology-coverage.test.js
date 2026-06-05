import { describe, expect, it } from 'vitest';

import {
  buildLabOntologyCoverageReport,
  formatLabOntologyCoverageReport,
} from '../scripts/lab-ontology-coverage.mjs';

const catalogueItems = Object.freeze([
  {
    providerId: 'cz.labshop',
    providerProductId: '19297',
    name: 'TSH',
    shortcut: 'S TSH',
    groupName: 'štítná žláza',
    priceCzk: 200,
  },
  {
    providerId: 'cz.labshop',
    providerProductId: '19134',
    name: 'Vitamin D celkový',
    shortcut: 'S VitD',
    groupName: 'Vitaminy lipidy minerály',
    priceCzk: 460,
  },
  {
    providerId: 'cz.labshop',
    providerProductId: '999-panel',
    name: 'Balíček štítná žláza',
    shortcut: 'PANEL THY',
    groupName: 'balíčky',
    priceCzk: 990,
  },
  {
    providerId: 'cz.labshop',
    providerProductId: '999-ambiguous',
    name: 'Speciální vyšetření neznámé',
    shortcut: 'SPEC',
    groupName: 'speciality',
    priceCzk: 500,
  },
]);

describe('lab ontology coverage audit', () => {
  it('classifies provider catalogue rows against the stable getbased marker ontology', () => {
    const report = buildLabOntologyCoverageReport({
      providerId: 'cz.labshop',
      catalogueItems,
      markerKeys: ['thyroid.tsh', 'vitamins.vitaminD', 'lipids.apoB'],
    });

    expect(report.summary).toEqual({
      providerId: 'cz.labshop',
      catalogueItems: 4,
      stableMarkerKeys: 3,
      ontologyMarkersCovered: 2,
      ontologyMarkerCoveragePct: 66.7,
      exactCatalogueRowsMapped: 2,
      exactCatalogueRowsMappedPct: 50,
      panelRows: 1,
      ambiguousRows: 1,
      unmappedRows: 0,
    });
    expect(report.mappedRows.map(row => row.providerProductId)).toEqual(['19297', '19134']);
    expect(report.panelRows[0]).toEqual(expect.objectContaining({ providerProductId: '999-panel' }));
    expect(report.ambiguousRows[0]).toEqual(expect.objectContaining({ providerProductId: '999-ambiguous' }));
    expect(report.missingOntologyMarkerKeys).toEqual(['lipids.apoB']);
  });

  it('formats a compact review-queue report for CLI output', () => {
    const report = buildLabOntologyCoverageReport({
      providerId: 'cz.labshop',
      catalogueItems,
      markerKeys: ['thyroid.tsh', 'vitamins.vitaminD', 'lipids.apoB'],
    });

    expect(formatLabOntologyCoverageReport(report)).toContain('Lab ontology coverage — cz.labshop');
    expect(formatLabOntologyCoverageReport(report)).toContain('Ontology markers covered: 2/3 (66.7%)');
    expect(formatLabOntologyCoverageReport(report)).toContain('Catalogue exact-mapped: 2/4 (50%)');
    expect(formatLabOntologyCoverageReport(report)).toContain('Review queue: 2 rows');
  });
});
