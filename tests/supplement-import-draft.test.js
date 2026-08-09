import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import {
  SUPPLEMENT_EXTRACTION_SCHEMA_PROMPT,
  extractSupplementPageFacts,
  mergeSupplementImportDrafts,
  normalizeSupplementImportDraft,
  parseSupplementImportJson,
  supplementImportIngredientKey,
} from '../js/supplement-import-draft.js';

describe('supplement import drafts', () => {
  it('normalizes the legacy extractor shape without treating label directions as personal use', () => {
    const { draft, issues } = normalizeSupplementImportDraft({
      product: 'Vitamin D3',
      dosage: 'Take one softgel daily',
      ingredients: [{ name: 'Vitamin D3', amount: '25 µg' }],
    }, { kind: 'label photos' });

    expect(draft).toMatchObject({
      product: 'Vitamin D3',
      labelDirections: 'Take one softgel daily',
      ingredients: [{ name: 'Vitamin D3', amountValue: 25, amountUnit: 'mcg', amount: '25 mcg' }],
      source: { kind: 'label photos', reviewed: false },
    });
    expect(draft).not.toHaveProperty('timesPerDay');
    expect(issues).toEqual([]);
  });

  it('retains custom source units and flags facts that need review', () => {
    const { draft, issues } = normalizeSupplementImportDraft({
      name: 'Probiotic',
      ingredients: [
        { name: 'L. rhamnosus', amountValue: 10, amountUnit: 'billion CFU' },
        { name: 'L. reuteri' },
      ],
    });

    expect(draft.ingredients[0].amount).toBe('10 billion CFU');
    expect(issues).toContain('L. reuteri: verify the amount.');
  });

  it('parses fenced JSON while rejecting non-JSON extraction text', () => {
    expect(parseSupplementImportJson('```json\n{"product":"Magnesium"}\n```')).toEqual({ product: 'Magnesium' });
    expect(parseSupplementImportJson('Result:\n{“product”:"Magnesium",}')).toEqual({ product: 'Magnesium' });
    expect(() => parseSupplementImportJson('No product found')).toThrow(/invalid JSON/);
  });

  it('extracts the complete labeled ingredient table before using AI', () => {
    const { window } = new JSDOM('');
    const html = `<!doctype html><html><body>
      <span itemprop="brand"><meta itemprop="name" content="BrainMax"></span>
      <h1>BrainMax Activated B-Complex, 90 capsules <span class="product-appendix">Marketing subtitle</span></h1>
      <section><h2>100 % testovaných látek potvrzeno</h2><table>
        <thead><tr><th>Měřená látka</th><th>Deklarováno</th><th>Naměřeno</th></tr></thead>
        <tbody><tr><td>Vitamín B3</td><td>100 mg</td><td>98 mg</td></tr></tbody>
      </table></section>
      <div class="m-dosage"><h2>Doporučené dávkování</h2><p>2 kapsle denně</p></div>
      <div id="nutritional-values"><h2>Složení</h2><table>
        <thead><tr><th>Aktivní látky ve 2 kapslích</th><th>Množství</th><th>%RHP</th></tr></thead>
        <tbody>
          <tr><td>Cholin (VitaCholine)</td><td>100 mg</td><td>**</td></tr>
          <tr><td>Vitamín B7 (biotin)</td><td>1000 µg</td><td>2000%</td></tr>
          <tr><td>Vitamín B12 (methylkobalamin)</td><td>100 µg</td><td>4000%</td></tr>
        </tbody>
      </table></div>
      <div class="tab-pane active"><table class="detail-parameters">
        <tbody>
          <tr><th>EAN:</th><td>8594190023908</td></tr>
          <tr><th>Počet kapslí:</th><td>90</td></tr>
          <tr><th>Expirace:</th><td>30.9.2027</td></tr>
        </tbody>
      </table></div>
      <div class="m-specific-table"><table>
        <thead><tr><th>Těžké kovy</th><th>Hodnota</th></tr></thead>
        <tbody>
          <tr><td>Kadmium</td><td>&lt; 0.01 mg</td></tr>
          <tr><td>Olovo</td><td>&lt; 0.02 mg</td></tr>
        </tbody>
      </table></div>
      <p><strong>Upozornění</strong>: Uchovávejte mimo dosah dětí.</p>
      <p>Doplněk stravy.</p>
    </body></html>`;

    const extracted = extractSupplementPageFacts(html, window.DOMParser);

    expect(extracted.facts).toMatchObject({
      product: 'BrainMax Activated B-Complex, 90 capsules',
      brand: 'BrainMax',
      type: 'supplement',
      dosageForm: 'capsule',
      servingSize: { value: 2, unit: 'capsule' },
      labelDirections: '2 kapsle denně',
      ingredients: [
        { name: 'Cholin (VitaCholine)', amountValue: 100, amountUnit: 'mg' },
        { name: 'Vitamín B7 (biotin)', amountValue: 1000, amountUnit: 'mcg' },
        { name: 'Vitamín B12 (methylkobalamin)', amountValue: 100, amountUnit: 'mcg' },
      ],
      warnings: ['Uchovávejte mimo dosah dětí.'],
    });
    expect(extracted.deterministicFields).toContain('ingredients');
    expect(extracted.facts.ingredients).toHaveLength(3);
  });

  it('keeps ambiguous non-Latin tables for AI classification instead of declaring ingredients', () => {
    const { window } = new JSDOM('');
    const html = `<!doctype html><html><body>
      <h1>Местный комплекс</h1>
      <table><tbody>
        <tr><td>Витамин C</td><td>500 мг</td></tr>
        <tr><td>Цинк</td><td>10 мг</td></tr>
      </tbody></table>
      <table><tbody>
        <tr><td>ビタミンD</td><td>25 マイクログラム</td></tr>
        <tr><td>亜鉛</td><td>10 ミリグラム</td></tr>
      </tbody></table>
    </body></html>`;

    const extracted = extractSupplementPageFacts(html, window.DOMParser);

    expect(extracted.facts.ingredients).toEqual([]);
    const classified = normalizeSupplementImportDraft({
      product: 'Местный комплекс',
      ingredients: [
      { name: 'Витамин C', amountValue: 500, amountUnit: 'mg' },
      { name: 'Цинк', amountValue: 10, amountUnit: 'mg' },
      { name: 'ビタミンD', amountValue: 25, amountUnit: 'mcg' },
      { name: '亜鉛', amountValue: 10, amountUnit: 'mg' },
      ],
    }, { kind: 'product URL' });
    expect(classified.draft.ingredients).toMatchObject([
      { name: 'Витамин C', amountValue: 500, amountUnit: 'mg' },
      { name: 'Цинк', amountValue: 10, amountUnit: 'mg' },
      { name: 'ビタミンD', amountValue: 25, amountUnit: 'mcg' },
      { name: '亜鉛', amountValue: 10, amountUnit: 'mg' },
    ]);
    expect(supplementImportIngredientKey('Витамин C')).toBe('витамин c');
    expect(supplementImportIngredientKey('ビタミンD')).toBe('ビタミンd');
    expect(extracted.evidenceText.slice(0, 250)).toContain('Витамин C | 500 мг');
    expect(extracted.evidenceText.slice(0, 250)).toContain('ビタミンD | 25 マイクログラム');
  });

  it('keeps excipients and laboratory contaminants out of active ingredients', () => {
    const { draft, issues } = normalizeSupplementImportDraft({
      product: 'Tested Vitamin C',
      ingredients: [
        { name: 'Vitamin C', amountValue: 500, amountUnit: 'mg' },
        { name: 'Cellulose', amount: '100 mg' },
      ],
      inactiveIngredients: ['Cellulose'],
      qualityTests: [
        { category: 'contaminant', analyte: 'Lead', resultText: 'ND', unit: 'mg', basis: 'per capsule', status: 'not-detected' },
        { category: 'potency', analyte: 'Vitamin C', resultText: '498 mg', declaredText: '500 mg', status: 'pass' },
      ],
    }, { kind: 'label photos' });

    expect(draft.ingredients).toMatchObject([
      { name: 'Vitamin C', amountValue: 500, amountUnit: 'mg' },
    ]);
    expect(draft.inactiveIngredients).toEqual(['Cellulose']);
    expect(draft.qualityTests).toMatchObject([
      { category: 'contaminant', analyte: 'Lead', resultText: 'ND', value: null, status: 'not-detected' },
      { category: 'potency', analyte: 'Vitamin C', resultText: '498 mg', value: 498, unit: 'mg' },
    ]);
    expect(issues).toEqual([]);
    expect(SUPPLEMENT_EXTRACTION_SCHEMA_PROMPT).toContain('Classification is mandatory');
    expect(SUPPLEMENT_EXTRACTION_SCHEMA_PROMPT).toContain('only in qualityTests, never in ingredients');
  });

  it('reads schema.org Product facts when a storefront has no visible facts table', () => {
    const { window } = new JSDOM('');
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Universal Daily Formula',
        brand: { '@type': 'Brand', name: 'Example Labs' },
        dosageForm: 'tablet',
        servingSize: 'per 2 tablets',
        activeIngredient: [
          { name: 'Vitamin D3', amount: { value: 25, unitText: 'mcg' } },
          { name: 'Zinc', amount: '10 mg' },
        ],
      })}</script>
    </head><body><p>Dietary supplement</p></body></html>`;

    const extracted = extractSupplementPageFacts(html, window.DOMParser);

    expect(extracted.facts).toMatchObject({
      product: 'Universal Daily Formula',
      brand: 'Example Labs',
      type: 'supplement',
      dosageForm: 'tablet',
      servingSize: { value: 2, unit: 'tablet' },
      ingredients: [
        { name: 'Vitamin D3', amountValue: 25, amountUnit: 'mcg' },
        { name: 'Zinc', amountValue: 10, amountUnit: 'mg' },
      ],
    });
    expect(extracted.deterministicFields).toEqual(expect.arrayContaining([
      'product', 'brand', 'dosageForm', 'servingSize', 'ingredients',
    ]));
  });

  it('unions multiple English Supplement Facts tables and ignores lab-result tables', () => {
    const { window } = new JSDOM('');
    const html = `<!doctype html><html><body>
      <h1>Split Label Multi</h1><p>Dietary supplement</p>
      <section class="supplement-facts"><table>
        <thead><tr><th>Supplement Facts per 1 capsule</th><th>Amount per serving</th></tr></thead>
        <tbody>
          <tr><th>Vitamin C</th><td>500 mg</td></tr>
          <tr><th>Vitamin D3</th><td>1000 IU</td></tr>
        </tbody>
      </table></section>
      <section class="active-ingredients"><table>
        <thead><tr><th>Active ingredients</th><th>Quantity</th></tr></thead>
        <tbody><tr><td>Coenzyme Q10</td><td>50 mg</td></tr></tbody>
      </table></section>
      <section><table>
        <thead><tr><th>Laboratory result</th><th>Declared</th><th>Measured</th></tr></thead>
        <tbody><tr><td>Vitamin C</td><td>499 mg</td><td>501 mg</td></tr></tbody>
      </table></section>
    </body></html>`;

    const extracted = extractSupplementPageFacts(html, window.DOMParser);

    expect(extracted.facts.servingSize).toEqual({ value: 1, unit: 'capsule' });
    expect(extracted.facts.ingredients).toMatchObject([
      { name: 'Vitamin C', amountValue: 500, amountUnit: 'mg' },
      { name: 'Vitamin D3', amountValue: 1000, amountUnit: 'IU' },
      { name: 'Coenzyme Q10', amountValue: 50, amountUnit: 'mg' },
    ]);
    expect(extracted.facts.ingredients).toHaveLength(3);
  });

  it('leaves unstructured prose for AI instead of claiming complete deterministic ingredients', () => {
    const { window } = new JSDOM('');
    const html = `<!doctype html><html><body>
      <h1>Prose-only product</h1>
      <p>Our blend contains vitamin C and zinc in a proprietary formulation.</p>
    </body></html>`;

    const extracted = extractSupplementPageFacts(html, window.DOMParser);

    expect(extracted.facts.product).toBe('Prose-only product');
    expect(extracted.facts.ingredients).toEqual([]);
    expect(extracted.deterministicFields).not.toContain('ingredients');
  });

  it('supports OTC Drug Facts rows whose strength is embedded in the ingredient cell', () => {
    const { window } = new JSDOM('');
    const html = `<!doctype html><html><body>
      <h1>Example Pain Relief</h1>
      <section id="drug-facts"><h2>Drug Facts</h2><table>
        <thead><tr><th>Active ingredient (in each tablet)</th><th>Purpose</th></tr></thead>
        <tbody><tr><th>Acetaminophen 500 mg</th><td>Pain reliever</td></tr></tbody>
      </table></section>
    </body></html>`;

    const extracted = extractSupplementPageFacts(html, window.DOMParser);

    expect(extracted.facts.type).toBe('medication');
    expect(extracted.facts.ingredients).toMatchObject([
      { name: 'Acetaminophen', amountValue: 500, amountUnit: 'mg' },
    ]);
    expect(extracted.deterministicFields).toContain('ingredients');
  });

  it('unions link and photo ingredients while filling missing facts', () => {
    const link = normalizeSupplementImportDraft({
      product: 'Daily Complex',
      ingredients: [
        { name: 'Magnesium', amountValue: 200 },
        { name: 'Vitamin B6', amountValue: 5, amountUnit: 'mg' },
      ],
      inactiveIngredients: ['Rice flour'],
      qualityTests: [{ category: 'contaminant', analyte: 'Lead', canonicalAnalyte: 'lead', resultText: 'ND', status: 'not-detected' }],
    }, { kind: 'product URL', url: 'https://example.com/product' });
    const photos = normalizeSupplementImportDraft({
      product: 'Daily Complex',
      ingredients: [
        { name: 'Magnesium', amountValue: 200, amountUnit: 'mg' },
        { name: 'Zinc', amountValue: 10, amountUnit: 'mg' },
      ],
      inactiveIngredients: ['Vegetable capsule'],
      qualityTests: [
        { category: 'contaminant', analyte: 'Lead', canonicalAnalyte: 'lead', resultText: 'ND', status: 'not-detected' },
        { category: 'contaminant', analyte: 'Mercury', canonicalAnalyte: 'mercury', resultText: 'NQ', status: 'not-quantified' },
      ],
    }, { kind: 'label photos' });

    const combined = mergeSupplementImportDrafts(link, photos);

    expect(combined.draft.ingredients).toHaveLength(3);
    expect(combined.draft.ingredients[0]).toMatchObject({
      name: 'Magnesium',
      amount: '200 mg',
      amountUnit: 'mg',
      sourceKinds: ['product URL', 'label photos'],
    });
    expect(combined.draft.ingredients[2]).toMatchObject({ name: 'Zinc', amount: '10 mg' });
    expect(combined.draft.inactiveIngredients).toEqual(['Rice flour', 'Vegetable capsule']);
    expect(combined.draft.qualityTests).toHaveLength(2);
    expect(combined.draft.qualityTests[0]).toMatchObject({
      analyte: 'Lead', resultText: 'ND', sourceKinds: ['product URL', 'label photos'],
    });
    expect(combined.draft.source).toMatchObject({
      kind: 'product URL + label photos',
      reviewed: false,
    });
    expect(combined.draft.source.evidence.map(source => source.kind)).toEqual([
      'product URL', 'label photos',
    ]);
    expect(combined.issues).not.toContain('Magnesium: choose a unit.');
  });

  it('keeps the first reviewed value and surfaces cross-source conflicts', () => {
    const photos = normalizeSupplementImportDraft({
      product: 'Vendor Label Name',
      labelDirections: 'Take one capsule',
      ingredients: [{ name: 'Zinc', amountValue: 15, amountUnit: 'mg' }],
    }, { kind: 'label photos' });
    photos.draft.source.reviewed = true;
    photos.draft.source.evidence[0].reviewed = true;
    const link = normalizeSupplementImportDraft({
      product: 'Store Listing Name',
      labelDirections: 'Take two capsules',
      ingredients: [{ name: 'Zinc', amountValue: 10, amountUnit: 'mg' }],
    }, { kind: 'product URL' });

    const combined = mergeSupplementImportDrafts(photos, link);

    expect(combined.draft.product).toBe('Vendor Label Name');
    expect(combined.draft.labelDirections).toBe('Take one capsule');
    expect(combined.draft.ingredients[0].amount).toBe('15 mg');
    expect(combined.draft.source.reviewed).toBe(false);
    expect(combined.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('Product name differs between sources'),
      expect.stringContaining('Label directions differs between sources'),
      expect.stringContaining('Zinc amount differs'),
    ]));
  });
});
