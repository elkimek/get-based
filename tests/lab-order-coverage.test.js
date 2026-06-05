import { afterEach, describe, expect, it } from 'vitest';

import {
  buildProviderCoverageMatrix,
  recommendLabOrderStrategy,
} from '../js/lab-order-coverage.js';
import {
  clearProviderCatalogueSourceForTests,
  setProviderCatalogueItemsForTests,
} from '../js/lab-providers/provider-catalogue-source.js';

const MARKERS = [
  { markerKey: 'vitamins.vitaminB12', displayName: 'Vitamin B12' },
  { markerKey: 'vitamins.folate', displayName: 'Folate' },
  { markerKey: 'coagulation.homocysteine', displayName: 'Homocysteine' },
  { markerKey: 'vitamins.holotranscobalamin', displayName: 'Active B12' },
];

const THYROID_MARKERS = [
  { markerKey: 'thyroid.tsh', displayName: 'TSH' },
  { markerKey: 'thyroid.freeT4', displayName: 'Free T4' },
  { markerKey: 'thyroid.freeT3', displayName: 'Free T3' },
  { markerKey: 'thyroid.tpoAb', displayName: 'TPO antibodies' },
];

const THYROID_NEXT_DRAW_MARKERS = [
  { markerKey: 'thyroid.tsh', displayName: 'TSH' },
  { markerKey: 'thyroid.freeT4', displayName: 'Free T4' },
  { markerKey: 'thyroid.freeT3', displayName: 'Free T3' },
  { markerKey: 'thyroid.totalT4', displayName: 'Total T4' },
  { markerKey: 'thyroid.totalT3', displayName: 'Total T3' },
  { markerKey: 'unmapped.reverseT3', displayName: 'Reverse T3' },
];

const FOCUSED_NEXT_BLOOD_DRAW_MARKERS = [
  { markerKey: 'hormones.totalTestosterone', displayName: 'Total testosterone' },
  { markerKey: 'hormones.shbg', displayName: 'SHBG' },
  { markerKey: 'hormones.estradiol', displayName: 'Estradiol' },
  { markerKey: 'hormones.freeTestosterone', displayName: 'Free testosterone' },
  { markerKey: 'hormones.morningCortisol', displayName: 'Morning cortisol' },
  { markerKey: 'thyroid.tsh', displayName: 'TSH' },
  { markerKey: 'thyroid.freeT4', displayName: 'Free T4' },
  { markerKey: 'thyroid.freeT3', displayName: 'Free T3' },
  { markerKey: 'unmapped.reverseT3', displayName: 'Reverse T3' },
  { markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D' },
  { markerKey: 'hormones.pth', displayName: 'PTH' },
  { markerKey: 'minerals.calcium', displayName: 'Calcium' },
  { markerKey: 'metabolism.insulin', displayName: 'Fasting insulin' },
  { markerKey: 'diabetes.hba1c', displayName: 'HbA1c' },
  { markerKey: 'inflammation.hsCRP', displayName: 'hs-CRP' },
  { markerKey: 'biochemistry.cystatinC', displayName: 'Cystatin C' },
  { markerKey: 'kidney.egfr', displayName: 'eGFR' },
  { markerKey: 'biochemistry.uricAcid', displayName: 'Uric acid' },
  { markerKey: 'biochemistry.creatinine', displayName: 'Creatinine' },
  { markerKey: 'coagulation.homocysteine', displayName: 'Homocysteine' },
  { markerKey: 'minerals.rbcMagnesium', displayName: 'RBC Magnesium' },
];

const GENERAL_NEXT_DRAW_MARKERS = [
  { markerKey: 'hormones.totalTestosterone', displayName: 'Total testosterone' },
  { markerKey: 'hormones.shbg', displayName: 'SHBG' },
  { markerKey: 'hormones.estradiol', displayName: 'Estradiol' },
  { markerKey: 'hormones.dht', displayName: 'DHT' },
  { markerKey: 'hormones.lh', displayName: 'lh' },
  { markerKey: 'hormones.fsh', displayName: 'fsh' },
  { markerKey: 'hormones.prolactin', displayName: 'Prolactin' },
  { markerKey: 'hormones.dheaS', displayName: 'DHEA-S' },
  { markerKey: 'hormones.igf1', displayName: 'IGF-1' },
  { markerKey: 'thyroid.tsh', displayName: 'TSH' },
  { markerKey: 'thyroid.freeT4', displayName: 'Free T4' },
  { markerKey: 'thyroid.freeT3', displayName: 'Free T3' },
  { markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D' },
  { markerKey: 'metabolism.insulin', displayName: 'Fasting insulin' },
  { markerKey: 'inflammation.hsCRP', displayName: 'hs-CRP' },
  { markerKey: 'metabolism.homaIR', displayName: 'HOMA-IR' },
  { markerKey: 'kidney.egfr', displayName: 'eGFR' },
  { markerKey: 'biochemistry.cystatinC', displayName: 'Cystatin C' },
  { markerKey: 'biochemistry.uricAcid', displayName: 'Uric acid' },
  { markerKey: 'liver.alt', displayName: 'ALT' },
  { markerKey: 'liver.ggt', displayName: 'GGT' },
  { markerKey: 'hormones.morningCortisol', displayName: 'Morning Cortisol (serum or 4-point salivary)' },
  { markerKey: 'vitamins.folate', displayName: 'Folate' },
  { markerKey: 'prostate.psa', displayName: 'PSA' },
];

describe('provider coverage matrix and recommendations', () => {
  afterEach(() => clearProviderCatalogueSourceForTests());

  it('marks empty provider catalogue sources explicitly so the UI can avoid misleading 0/N coverage', () => {
    setProviderCatalogueItemsForTests('cz.labshop', []);
    setProviderCatalogueItemsForTests('cz.unilabs', []);

    const matrix = buildProviderCoverageMatrix([{ markerKey: 'thyroid.tsh', displayName: 'TSH' }], { country: 'CZ' });

    for (const provider of matrix.providers) {
      expect(provider).toEqual(expect.objectContaining({
        coveredCount: 0,
        offerCount: 0,
        catalogueLoaded: false,
        missingMarkerKeys: ['thyroid.tsh'],
      }));
      expect(provider.cells['thyroid.tsh']).toEqual(expect.objectContaining({
        status: 'missing',
        reasonCode: 'provider_catalogue_empty',
        diagnosticLabel: 'Provider catalogue not loaded',
        catalogueSearched: false,
      }));
    }
  });

  it('distinguishes a loaded catalogue with no matching offer from an unloaded catalogue', () => {
    const matrix = buildProviderCoverageMatrix([{ markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D' }], { country: 'CZ' });
    const unilabs = matrix.providers.find(provider => provider.providerId === 'cz.unilabs');

    expect(unilabs).toEqual(expect.objectContaining({
      coveredCount: 0,
      offerCount: 0,
      catalogueLoaded: true,
      missingMarkerKeys: ['vitamins.vitaminD'],
    }));
    expect(unilabs.cells['vitamins.vitaminD']).toEqual(expect.objectContaining({
      status: 'missing',
      reasonCode: 'no_verified_provider_offer',
      diagnosticLabel: 'No verified online offer yet',
      catalogueSearched: true,
    }));
  });

  it('covers ALP and obvious next-draw aliases instead of leaving them as not verified when provider rows exist', () => {
    const markers = [
      { markerKey: 'liver.alp', displayName: 'ALP' },
      { markerKey: 'metabolism.cPeptide', displayName: 'C-peptide' },
      { markerKey: 'inflammation.esr', displayName: 'ESR' },
      { markerKey: 'kidney.urea', displayName: 'BUN' },
      { markerKey: 'hematology.cbcDiff', displayName: 'CBC with differential' },
      { markerKey: 'hematology.reticulocytes', displayName: 'Reticulocytes' },
    ];

    const matrix = buildProviderCoverageMatrix(markers, { country: 'CZ' });
    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');
    expect(labshop.missingMarkerKeys).toEqual([]);
    for (const marker of markers) {
      expect(labshop.cells[marker.markerKey]).toEqual(expect.objectContaining({
        status: 'covered',
        reasonCode: 'verified_exact',
      }));
    }

    const unilabs = matrix.providers.find(p => p.providerId === 'cz.unilabs');
    expect(unilabs.cells['liver.alp']).toEqual(expect.objectContaining({
      status: 'covered',
      providerProductId: '2539',
      reasonCode: 'verified_exact',
    }));
    expect(unilabs.cells['kidney.urea']).toEqual(expect.objectContaining({
      status: 'covered',
      providerProductId: '2565',
      reasonCode: 'verified_exact',
    }));
  });

  it('covers common lipid and biochemistry rows that labs list under Czech catalogue names', () => {
    const markers = [
      { markerKey: 'lipids.triglycerides', displayName: 'Triglycerides' },
      { markerKey: 'lipids.cholesterol', displayName: 'Total cholesterol' },
      { markerKey: 'lipids.ldl', displayName: 'LDL' },
      { markerKey: 'lipids.hdl', displayName: 'HDL' },
      { markerKey: 'lipids.apoB', displayName: 'ApoB' },
      { markerKey: 'lipids.apoAI', displayName: 'ApoA-I' },
      { markerKey: 'lipids.lpa', displayName: 'Lp(a)' },
      { markerKey: 'metabolism.fructosamine', displayName: 'Fructosamine' },
      { markerKey: 'proteins.albumin', displayName: 'Albumin' },
      { markerKey: 'liver.bilirubinTotal', displayName: 'Total bilirubin' },
    ];

    const matrix = buildProviderCoverageMatrix(markers, { country: 'CZ' });
    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');
    const unilabs = matrix.providers.find(p => p.providerId === 'cz.unilabs');

    expect(labshop.missingMarkerKeys).toEqual([]);
    expect(labshop.cells['lipids.triglycerides']).toEqual(expect.objectContaining({ providerProductId: '19406', providerProductName: 'Triacylglyceroly', status: 'covered' }));
    expect(labshop.cells['lipids.cholesterol']).toEqual(expect.objectContaining({ providerProductId: '19173', providerProductName: 'Cholesterol', status: 'covered' }));
    expect(labshop.cells['lipids.ldl']).toEqual(expect.objectContaining({ providerProductId: '19412', providerProductName: 'LDL-Cholesterol', status: 'covered' }));
    expect(labshop.cells['lipids.hdl']).toEqual(expect.objectContaining({ providerProductId: '19255', providerProductName: 'HDL-Cholesterol', status: 'covered' }));
    expect(labshop.cells['lipids.apoB']).toEqual(expect.objectContaining({ providerProductId: '19396', providerProductName: 'Apo B', status: 'covered' }));
    expect(labshop.cells['lipids.apoAI']).toEqual(expect.objectContaining({ providerProductId: '19360', providerProductName: 'Apo A1', status: 'covered' }));
    expect(labshop.cells['lipids.lpa']).toEqual(expect.objectContaining({ providerProductId: '19309', providerProductName: 'Lp(a)', status: 'covered' }));
    expect(labshop.cells['metabolism.fructosamine']).toEqual(expect.objectContaining({ providerProductId: '19220', providerProductName: 'Fruktózamin', status: 'covered' }));
    expect(labshop.cells['proteins.albumin']).toEqual(expect.objectContaining({ providerProductId: '19373', providerProductName: 'Albumin', status: 'covered' }));
    expect(labshop.cells['liver.bilirubinTotal']).toEqual(expect.objectContaining({ providerProductId: '19335', providerProductName: 'Bilirubin', status: 'covered' }));

    expect(unilabs.cells['lipids.triglycerides']).toEqual(expect.objectContaining({ providerProductId: '2570', providerProductName: 'Triacylglyceroly', status: 'covered' }));
    expect(unilabs.cells['lipids.cholesterol']).toEqual(expect.objectContaining({ providerProductId: '2557', providerProductName: 'Test na cholesterol', status: 'covered' }));
    expect(unilabs.cells['lipids.ldl']).toEqual(expect.objectContaining({ providerProductId: '2562', providerProductName: 'LDL cholesterol', status: 'covered' }));
    expect(unilabs.cells['lipids.hdl']).toEqual(expect.objectContaining({ providerProductId: '2555', providerProductName: 'HDL cholesterol', status: 'covered' }));
    expect(unilabs.cells['lipids.lpa']).toEqual(expect.objectContaining({ status: 'missing', reasonCode: 'no_verified_provider_offer' }));
    expect(unilabs.cells['lipids.lpa']?.providerProductName).not.toBe('ALP (Alkalická fosfatáza)');
    expect(unilabs.cells['proteins.albumin']).toEqual(expect.objectContaining({ providerProductId: '2703', providerProductName: 'Albumin', status: 'covered' }));
    expect(unilabs.cells['liver.bilirubinTotal']).toEqual(expect.objectContaining({ providerProductId: '2704', providerProductName: 'Bilirubin', status: 'covered' }));
  });

  it('covers vitamin D mineral panel markers from verified catalogue rows instead of reporting false gaps', () => {
    const markers = [
      { markerKey: 'vitamins.vitaminD', displayName: 'Vitamin D' },
      { markerKey: 'hormones.pth', displayName: 'PTH' },
      { markerKey: 'minerals.calcium', displayName: 'Calcium' },
      { markerKey: 'minerals.rbcMagnesium', displayName: 'Magnesium RBC' },
      { markerKey: 'electrolytes.zinc', displayName: 'Zinc (serum or RBC)' },
      { markerKey: 'electrolytes.copper', displayName: 'Copper (serum)' },
      { markerKey: 'electrolytes.phosphorus', displayName: 'Phosphorus' },
      { markerKey: 'proteins.ceruloplasmin', displayName: 'Ceruloplasmin' },
      { markerKey: 'electrolytes.selenium', displayName: 'Selenium (serum or plasma)' },
    ];

    const matrix = buildProviderCoverageMatrix(markers, { country: 'CZ' });
    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');
    const unilabs = matrix.providers.find(p => p.providerId === 'cz.unilabs');

    expect(labshop).toEqual(expect.objectContaining({
      requestedCount: 9,
      coveredCount: 9,
      missingMarkerKeys: [],
      totalEstimateCzk: 2119,
    }));
    expect(labshop.cells['minerals.rbcMagnesium']).toEqual(expect.objectContaining({ providerProductId: '19705', providerProductName: 'Hořčík v erytrocytech (KO)', status: 'covered' }));
    expect(labshop.cells['electrolytes.zinc']).toEqual(expect.objectContaining({ providerProductId: '19707', providerProductName: 'Zinek', status: 'covered' }));
    expect(labshop.cells['electrolytes.copper']).toEqual(expect.objectContaining({ providerProductId: '19708', providerProductName: 'Měď', status: 'covered' }));
    expect(labshop.cells['electrolytes.phosphorus']).toEqual(expect.objectContaining({ providerProductId: '19703', providerProductName: 'Fosfor', status: 'covered' }));
    expect(labshop.cells['proteins.ceruloplasmin']).toEqual(expect.objectContaining({ providerProductId: '19315', providerProductName: 'Ceruloplasmin', status: 'covered' }));
    expect(labshop.cells['electrolytes.selenium']).toEqual(expect.objectContaining({ providerProductId: '19706', providerProductName: 'Selen', status: 'covered' }));

    expect(unilabs.cells['electrolytes.zinc']).toEqual(expect.objectContaining({ providerProductId: '2574', providerProductName: 'Zinek (Zincum, Zn)', status: 'covered' }));
    expect(unilabs.cells['electrolytes.copper']).toEqual(expect.objectContaining({ providerProductId: '2887', providerProductName: 'Měď (Cuprum, Cu)', status: 'covered' }));
    expect(unilabs.cells['electrolytes.phosphorus']).toEqual(expect.objectContaining({ providerProductId: '2743', providerProductName: 'Fosfor (Phosphorus, P)', status: 'covered' }));
    expect(unilabs.cells['electrolytes.selenium']).toEqual(expect.objectContaining({ status: 'missing', reasonCode: 'no_verified_provider_offer' }));
    expect(unilabs.cells['electrolytes.selenium']?.providerProductName).not.toBe('Albumin');
    expect(unilabs.missingMarkerKeys).toEqual(expect.arrayContaining([
      'vitamins.vitaminD',
      'hormones.pth',
      'minerals.rbcMagnesium',
      'proteins.ceruloplasmin',
      'electrolytes.selenium',
    ]));
  });

  it('builds per-provider marker cells with coverage, price, fees, confidence, and missing markers', () => {
    const matrix = buildProviderCoverageMatrix(MARKERS, { country: 'CZ' });

    expect(matrix.requestedMarkers.map(m => m.markerKey)).toEqual(MARKERS.map(m => m.markerKey));
    expect(matrix.providers.map(p => p.providerId)).toEqual(['cz.labshop', 'cz.unilabs']);

    const unilabs = matrix.providers.find(p => p.providerId === 'cz.unilabs');
    expect(unilabs).toEqual(expect.objectContaining({
      coveredCount: 4,
      requestedCount: 4,
      coveragePercent: 100,
      mandatoryFeesCzk: 81,
      totalEstimateCzk: 1460,
    }));
    expect(unilabs.cells['vitamins.holotranscobalamin']).toEqual(expect.objectContaining({
      status: 'covered',
      coverage: 'exact',
      priceCzk: 308,
      providerProductId: '3543',
      confidence: 'public_unilabs_online_configurator',
    }));

    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');
    expect(labshop).toEqual(expect.objectContaining({
      coveredCount: 4,
      requestedCount: 4,
      coveragePercent: 100,
      totalEstimateCzk: 1250,
      missingMarkerKeys: [],
    }));
    expect(labshop.cells['vitamins.vitaminB12']).toEqual(expect.objectContaining({
      status: 'covered',
      coverage: 'exact',
      providerProductId: '19312',
      priceCzk: 250,
      confidence: 'public_labshop_embedded_catalogue',
    }));
    expect(labshop.cells['coagulation.homocysteine']).toEqual(expect.objectContaining({
      status: 'covered',
      coverage: 'exact',
      providerProductId: '19228',
      priceCzk: 500,
    }));
  });

  it('covers the Czech thyroid panel through NCLP-backed provider mappings', () => {
    const matrix = buildProviderCoverageMatrix(THYROID_MARKERS, { country: 'CZ' });

    expect(matrix.requestedMarkers.map(m => m.markerKey)).toEqual([
      'thyroid.tsh',
      'thyroid.freeT4',
      'thyroid.freeT3',
      'thyroid.tpoAb',
    ]);
    expect(matrix.providers.map(p => p.providerId)).toEqual(['cz.labshop', 'cz.unilabs']);

    const unilabs = matrix.providers.find(p => p.providerId === 'cz.unilabs');
    expect(unilabs).toEqual(expect.objectContaining({
      requestedCount: 4,
      coveredCount: 4,
      coveragePercent: 100,
      missingMarkerKeys: [],
      totalEstimateCzk: 995,
    }));
    for (const marker of THYROID_MARKERS) {
      expect(unilabs.cells[marker.markerKey]).toEqual(expect.objectContaining({
        status: 'covered',
        coverage: 'panel_contains',
        standard: 'NCLP',
        nclpCode: expect.any(String),
        providerProductId: expect.any(String),
      }));
    }

    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');
    expect(labshop).toEqual(expect.objectContaining({
      requestedCount: 4,
      coveredCount: 4,
      coveragePercent: 100,
      missingMarkerKeys: [],
      totalEstimateCzk: 990,
    }));
    expect(labshop.cells['thyroid.tsh']).toEqual(expect.objectContaining({
      status: 'covered',
      coverage: 'exact',
      standard: 'NCLP',
      nclpCode: '03045',
      providerProductId: '19297',
      confidence: 'public_labshop_embedded_catalogue',
    }));
  });

  it('covers Elkim’s next-draw thyroid markers on Labshop except Reverse T3', () => {
    const matrix = buildProviderCoverageMatrix(THYROID_NEXT_DRAW_MARKERS, { country: 'CZ' });
    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');

    expect(labshop).toEqual(expect.objectContaining({
      requestedCount: 6,
      coveredCount: 5,
      coveragePercent: 83,
      totalEstimateCzk: 830,
      missingMarkerKeys: ['unmapped.reverseT3'],
    }));
    expect(labshop.cells['thyroid.totalT4']).toEqual(expect.objectContaining({
      status: 'covered',
      coverage: 'exact',
      providerProductId: '19234',
      priceCzk: 130,
      nclpCode: '02922',
    }));
    expect(labshop.cells['thyroid.totalT3']).toEqual(expect.objectContaining({
      status: 'covered',
      coverage: 'exact',
      providerProductId: '19339',
      priceCzk: 130,
      nclpCode: '02914',
    }));
    expect(labshop.cells['unmapped.reverseT3']).toEqual(expect.objectContaining({
      status: 'missing',
      coverage: 'unavailable',
      providerProductId: null,
      priceCzk: null,
    }));
  });

  it('covers the focused 21-marker next blood draw with verified provider catalogue rows before reporting gaps', () => {
    const matrix = buildProviderCoverageMatrix(FOCUSED_NEXT_BLOOD_DRAW_MARKERS, { country: 'CZ' });
    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');
    const unilabs = matrix.providers.find(p => p.providerId === 'cz.unilabs');

    expect(labshop).toEqual(expect.objectContaining({
      requestedCount: 20,
      coveredCount: 19,
      missingMarkerKeys: ['unmapped.reverseT3'],
    }));
    expect(labshop.cells['hormones.pth']).toEqual(expect.objectContaining({ providerProductId: '19348', providerProductName: 'PTH (1-84)', status: 'covered' }));
    expect(labshop.cells['minerals.calcium']).toEqual(expect.objectContaining({ providerProductId: '19702', providerProductName: 'Vápník', status: 'covered' }));
    expect(labshop.cells['biochemistry.creatinine']).toEqual(expect.objectContaining({ providerProductId: '19267', providerProductName: 'Kreatinin (CKD-EPI)', status: 'covered' }));
    expect(labshop.cells['minerals.rbcMagnesium']).toEqual(expect.objectContaining({ providerProductId: '19705', providerProductName: 'Hořčík v erytrocytech (KO)', status: 'covered' }));

    expect(unilabs).toEqual(expect.objectContaining({
      requestedCount: 20,
      coveredCount: 12,
    }));
    expect(unilabs.cells['minerals.calcium']).toEqual(expect.objectContaining({ providerProductId: '2572', providerProductName: 'Vápník (Kalcium, Calcium, Ca)', status: 'covered' }));
    expect(unilabs.cells['biochemistry.creatinine']).toEqual(expect.objectContaining({ providerProductId: '2560', providerProductName: 'Kreatinin', status: 'covered' }));
    expect(unilabs.missingMarkerKeys).toEqual(expect.arrayContaining([
      'hormones.shbg',
      'hormones.freeTestosterone',
      'hormones.morningCortisol',
      'unmapped.reverseT3',
      'vitamins.vitaminD',
      'hormones.pth',
      'biochemistry.cystatinC',
      'minerals.rbcMagnesium',
    ]));
  });

  it('adds diagnostics so unavailable cells explain mapping vs catalogue limits', () => {
    const matrix = buildProviderCoverageMatrix(FOCUSED_NEXT_BLOOD_DRAW_MARKERS, { country: 'CZ' });
    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');
    const unilabs = matrix.providers.find(p => p.providerId === 'cz.unilabs');

    expect(labshop.cells['hormones.pth']).toEqual(expect.objectContaining({
      status: 'covered',
      reasonCode: 'verified_exact',
      markerResolved: true,
      catalogueSearched: true,
      catalogueSource: 'labshop_embedded_data_source_products',
    }));
    expect(labshop.cells['unmapped.reverseT3']).toEqual(expect.objectContaining({
      status: 'missing',
      reasonCode: 'unmapped_marker',
      markerResolved: false,
      catalogueSearched: false,
      diagnosticLabel: 'Unmapped marker',
    }));
    expect(unilabs.cells['vitamins.vitaminD']).toEqual(expect.objectContaining({
      status: 'missing',
      reasonCode: 'no_verified_provider_offer',
      markerResolved: true,
      catalogueSearched: true,
      catalogueSource: 'unilabs_online_configurator_html',
      diagnosticLabel: 'No verified online offer yet',
    }));
    expect(unilabs.cells['inflammation.hsCRP']).toEqual(expect.objectContaining({
      status: 'covered',
      coverage: 'approximate',
      reasonCode: 'approximate_manual_review',
      diagnosticLabel: 'Approximate — manual review',
    }));
  });

  it('keeps calculated markers out of orderable provider coverage while adding their required inputs', () => {
    const matrix = buildProviderCoverageMatrix([
      { markerKey: 'metabolism.homaIR', displayName: 'HOMA-IR' },
      { markerKey: 'kidney.egfr', displayName: 'eGFR' },
    ], { country: 'CZ' });
    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');

    expect(matrix.requestedMarkers.map(m => m.markerKey)).toEqual([
      'biochemistry.glucose',
      'metabolism.insulin',
      'biochemistry.creatinine',
    ]);
    expect(matrix.calculatedMarkers).toEqual([
      expect.objectContaining({ markerKey: 'metabolism.homaIR', displayName: 'HOMA-IR' }),
      expect.objectContaining({ markerKey: 'kidney.egfr', displayName: 'eGFR' }),
    ]);
    expect(labshop).toEqual(expect.objectContaining({
      requestedCount: 3,
      coveredCount: 3,
      calculatedMarkerKeys: ['metabolism.homaIR', 'kidney.egfr'],
      missingMarkerKeys: [],
    }));
    expect(labshop.cells['metabolism.homaIR']).toEqual(expect.objectContaining({
      status: 'calculated',
      coverage: 'calculated_from_dependencies',
      providerProductId: null,
      priceCzk: 0,
    }));
    expect(labshop.cells['kidney.egfr']).toEqual(expect.objectContaining({
      status: 'calculated',
      coverage: 'calculated_from_dependencies',
      providerProductId: null,
      priceCzk: 0,
    }));
  });

  it('covers Elkim’s general next-draw endocrine/metabolic plan with provider catalogue rows and calculated HOMA-IR/eGFR separated', () => {
    const matrix = buildProviderCoverageMatrix(GENERAL_NEXT_DRAW_MARKERS, { country: 'CZ' });
    const labshop = matrix.providers.find(p => p.providerId === 'cz.labshop');
    const unilabs = matrix.providers.find(p => p.providerId === 'cz.unilabs');

    expect(matrix.calculatedMarkers.map(m => m.markerKey)).toEqual(['metabolism.homaIR', 'kidney.egfr']);
    expect(labshop).toEqual(expect.objectContaining({
      requestedCount: 24,
      coveredCount: 24,
      calculatedMarkerKeys: ['metabolism.homaIR', 'kidney.egfr'],
      missingMarkerKeys: [],
    }));
    expect(labshop.cells['hormones.estradiol']).toEqual(expect.objectContaining({ providerProductId: '19171', status: 'covered' }));
    expect(labshop.cells['hormones.dht']).toEqual(expect.objectContaining({ providerProductId: '19260', status: 'covered' }));
    expect(labshop.cells['hormones.lh']).toEqual(expect.objectContaining({ providerProductId: '19269', status: 'covered' }));
    expect(labshop.cells['hormones.fsh']).toEqual(expect.objectContaining({ providerProductId: '19226', status: 'covered' }));
    expect(labshop.cells['hormones.prolactin']).toEqual(expect.objectContaining({ providerProductId: '19434', status: 'covered' }));
    expect(labshop.cells['hormones.dheaS']).toEqual(expect.objectContaining({ providerProductId: '19378', status: 'covered' }));
    expect(labshop.cells['hormones.igf1']).toEqual(expect.objectContaining({ providerProductId: '19230', status: 'covered' }));
    expect(labshop.cells['hormones.morningCortisol']).toEqual(expect.objectContaining({ providerProductId: '19238', status: 'covered' }));
    expect(labshop.cells['prostate.psa']).toEqual(expect.objectContaining({ providerProductId: '19242', status: 'covered' }));
    expect(labshop.cells['metabolism.homaIR']).toEqual(expect.objectContaining({
      status: 'calculated',
      coverage: 'calculated_from_dependencies',
      providerProductId: null,
      priceCzk: 0,
    }));
    expect(labshop.cells['kidney.egfr']).toEqual(expect.objectContaining({
      status: 'calculated',
      coverage: 'calculated_from_dependencies',
      providerProductId: null,
      priceCzk: 0,
    }));

    expect(unilabs).toEqual(expect.objectContaining({
      requestedCount: 24,
      coveredCount: 15,
      calculatedMarkerKeys: ['metabolism.homaIR', 'kidney.egfr'],
    }));
    expect(unilabs.cells['hormones.estradiol']).toEqual(expect.objectContaining({ providerProductId: '2547', status: 'covered' }));
    expect(unilabs.cells['hormones.lh']).toEqual(expect.objectContaining({ providerProductId: '2563', status: 'covered' }));
    expect(unilabs.cells['hormones.fsh']).toEqual(expect.objectContaining({ providerProductId: '2550', status: 'covered' }));
    expect(unilabs.cells['metabolism.homaIR']).toEqual(expect.objectContaining({ status: 'calculated', coverage: 'calculated_from_dependencies', priceCzk: 0 }));
    expect(unilabs.cells['kidney.egfr']).toEqual(expect.objectContaining({ status: 'calculated', coverage: 'calculated_from_dependencies', priceCzk: 0 }));
    expect(unilabs.missingMarkerKeys).toEqual(expect.arrayContaining([
      'hormones.shbg',
      'hormones.dht',
      'hormones.prolactin',
      'hormones.dheaS',
      'hormones.igf1',
      'vitamins.vitaminD',
      'biochemistry.cystatinC',
      'hormones.morningCortisol',
      'prostate.psa',
    ]));
  });

  it('recommends best coverage, cheapest complete single lab, and cheapest split order', () => {
    const matrix = buildProviderCoverageMatrix(MARKERS, { country: 'CZ' });
    const recommendation = recommendLabOrderStrategy(matrix);

    expect(recommendation.bestCoverage.providerId).toBe('cz.labshop');
    expect(recommendation.cheapestComplete.providerId).toBe('cz.labshop');
    expect(recommendation.cheapestComplete.totalEstimateCzk).toBe(1250);

    expect(recommendation.cheapestSplit).toEqual(expect.objectContaining({
      complete: true,
      totalEstimateCzk: 1250,
      providerCount: 1,
    }));
    expect(recommendation.cheapestSplit.providers.map(p => p.providerId)).toEqual(['cz.labshop']);
    expect(recommendation.cheapestSplit.providers[0]).toEqual(expect.objectContaining({
      providerId: 'cz.labshop',
      markerKeys: ['vitamins.vitaminB12', 'vitamins.folate', 'coagulation.homocysteine', 'vitamins.holotranscobalamin'],
      totalEstimateCzk: 1250,
    }));
  });
});
