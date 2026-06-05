import { afterEach, describe, expect, it } from 'vitest';

import { buildLabOntologyCoverageReport } from '../scripts/lab-ontology-coverage.mjs';
import { getMarkerCrosswalk } from '../js/lab-standards/marker-crosswalk.js';
import { buildLabOrderDraftFromMarkers } from '../js/lab-order-intent.js';
import {
  clearProviderCatalogueSourceForTests,
  setProviderCatalogueItemsForTests,
} from '../js/lab-providers/provider-catalogue-source.js';
import { LABSHOP_FIXTURE_CATALOGUE } from './fixtures/lab-provider-catalogues.js';

const REMAINING_LABSHOP_MARKERS = Object.freeze([
  'lipids.fattyAcidsProfile',
  'toxicology.drugLcmsConfirmation',
  'reproductive.pregnancyHcg',
  'infectious.hepatitisBImmunityPanel',
  'reproductive.amhWomen',
  'infectious.hepatitisCScreeningPanel',
  'infectious.vzvImmunityPanel',
  'infectious.rubellaImmunityPanel',
  'prostate.psaMenScreening',
  'histamine.daoConcentration',
  'histamine.thdcHistamineDegradation',
  'genetics.histamineIntolerance',
  'genetics.celiacHla',
  'genetics.lactoseIntolerance',
  'enzymes.acidPhosphatase',
  'parasitology.perianalTapeTest',
  'genetics.prothrombinF2G20210A',
  'microbiology.throatSwab',
  'toxicology.leadBlood',
  'toxicology.manganeseSerum',
  'iron.ferritinAnemiaPanel',
  'infectious.havTotalHepatitisPanel',
  'toxicology.cadmiumBlood',
  'enzymes.gmd',
  'urine.iodine',
  'enzymes.ace',
  'urine.glucoseQuantitative',
  'thyroid.tsi',
  'microbiology.sputumCulture',
  'thyroid.thyroglobulin',
  'toxicology.ethanolSerum',
  'biochemistry.uricAcidBasicBiochemistry',
  'transfusion.bloodGroupRhFull',
  'urine.albuminQuantitative',
  'coagulation.thrombinTime',
  'enzymes.cholinesterase',
  'toxicology.chromiumSerum',
  'toxicology.cdt',
  'microbiology.uricultUrineCulture',
  'genetics.factorVLeidenR506Q',
  'stool.rotavirusAdenovirusNorovirusAntigen',
  'microbiology.nasalSwab',
  'stool.helicobacterPyloriAntigen',
  'urine.amylase',
  'kidney.ureaBasicBiochemistry',
  'parasitology.stoolParasitesMicroscopy',
  'microbiology.midstreamUrineCulture',
  'genetics.mthfrA1298CThrombophilia',
  'stool.fobQuantitative',
  'vitamins.rbcFolate',
  'thyroid.tshReceptorAbLabshop',
  'prostate.freePsa',
  'urine.chemicalSediment',
  'urine.albuminCreatinineRatio',
  'urine.proteinCreatinineRatio',
  'infectious.hiv12P24TransfusionScreen',
  'microbiome.floragenGutMicrobiome',
  'toxicology.aluminiumPlasma',
  'enzymes.prostaticAcidPhosphatase',
  'genetics.thrombophiliaMutationsPanel',
  'proteins.proteinElectrophoresis',
  'toxicology.cadmiumToxicology',
  'toxicology.mercuryToxicology',
  'toxicology.nickelCreatinine',
  'foodIntolerance.foxPanel',
  'infectious.bordetellaPertussisRespiratoryPanel',
  'infectious.sarsCov2RespiratoryPanel',
]);

describe('Labshop remaining ontology expansion', () => {
  afterEach(() => clearProviderCatalogueSourceForTests());

  it('adds stable crosswalk entries for every remaining Labshop review-queue row', () => {
    for (const markerKey of REMAINING_LABSHOP_MARKERS) {
      expect(getMarkerCrosswalk(markerKey)).toEqual(expect.objectContaining({ markerKey }));
    }
  });

  it('maps every remaining Labshop review-queue row to a verified catalogue offer', () => {
    setProviderCatalogueItemsForTests('cz.labshop', LABSHOP_FIXTURE_CATALOGUE);
    const markers = REMAINING_LABSHOP_MARKERS.map(markerKey => ({
      markerKey,
      displayName: getMarkerCrosswalk(markerKey)?.canonicalName || markerKey,
      priority: 'core',
    }));
    const draft = buildLabOrderDraftFromMarkers(markers, {
      country: 'CZ',
      userRequest: 'Labshop remaining ontology expansion coverage test',
    });
    const labshop = draft.providerComparisons.find(row => row.providerId === 'cz.labshop');

    expect(labshop.coveredCount).toBe(REMAINING_LABSHOP_MARKERS.length);
    expect(labshop.missingMarkerKeys).toEqual([]);
    expect(labshop.offerCount).toBe(REMAINING_LABSHOP_MARKERS.length);
  });

  it('keeps the checked-in fixture review queue bounded to duplicate fixture rows only', () => {
    const report = buildLabOntologyCoverageReport({
      providerId: 'cz.labshop',
      catalogueItems: LABSHOP_FIXTURE_CATALOGUE,
    });

    // The fixture intentionally contains a few duplicated historical rows with
    // identical names/shortcuts to older demo rows, which a one-marker→one-offer
    // matcher cannot distinguish without provider product IDs. Runtime coverage
    // is verified by the lab:coverage script against the private full snapshot.
    expect(report.summary.panelRows).toBe(0);
    expect(report.summary.ambiguousRows).toBeLessThanOrEqual(5);
    expect(report.summary.unmappedRows).toBe(0);
  });
});
