import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

function evidence(overrides = {}) {
  return {
    id: 'fixture-12345678',
    direction: 'adverse',
    summary: 'Directly changed a measured mitochondrial endpoint.',
    studyType: 'human_cells',
    studyLabel: 'Human cells / ex vivo',
    model: 'Human cells outside the body',
    exposure: 'Experimental concentration-response exposure.',
    limitations: 'This cannot establish a clinical effect at the recorded dose.',
    pmid: 12345678,
    title: 'Fixture primary study.',
    ...overrides,
  };
}

function compound(name, aliases, evidenceItem) {
  return {
    name,
    aliases,
    category: 'supplement',
    evidence: [evidenceItem],
  };
}

async function loadWith(data) {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => data,
  })));
  const module = await import('../js/supplement-warnings.js');
  await module.preloadMitoCompoundData();
  return module;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mitochondrial primary-study evidence', () => {
  it('keeps the shipped catalog claim-level, scoped, and structurally auditable', async () => {
    const data = JSON.parse(await readFile(new URL('../data/mito-compounds.json', import.meta.url), 'utf8'));
    const entries = data.filter(entry => entry.name);
    const evidenceItems = entries.flatMap(entry => entry.evidence);

    expect(data[0]._meta.schemaVersion).toBe(2);
    expect(entries).toHaveLength(29);
    expect(evidenceItems).toHaveLength(30);
    expect(new Set(evidenceItems.map(item => item.id)).size).toBe(evidenceItems.length);
    expect(entries.every(entry => !('effects' in entry) && !('pmid' in entry))).toBe(true);
    expect(evidenceItems.every(item => (
      item.summary
      && item.model
      && item.exposure
      && item.limitations
      && item.title
      && Number.isInteger(item.pmid)
    ))).toBe(true);
    expect(new Set(evidenceItems.map(item => item.direction))).toEqual(new Set([
      'adverse',
      'beneficial',
      'mechanism',
      'mixed',
      'null',
    ]));
  });

  it('returns every active-ingredient match and ignores an uncurated brand field', async () => {
    const module = await loadWith([
      { _meta: { schemaVersion: 2 } },
      compound('Berberine', ['berberine'], evidence({ id: 'berberine-1' })),
      compound('Sertraline', ['sertraline'], evidence({
        id: 'sertraline-2',
        studyType: 'human_observational',
        studyLabel: 'Human case series',
      })),
      compound('Пирролохинолин хинон', ['пирролохинолин хинон'], evidence({ id: 'unicode-3' })),
    ]);

    const matches = module.scanSupplementsForWarnings([{
      name: 'Multilingual combination',
      brand: 'Sertraline',
      ingredients: [
        { name: 'Berberine HCl' },
        { name: 'SERTRALINE 50 mg' },
        { name: 'Пирролохинолин-хинон' },
      ],
    }]);

    expect(matches.map(match => match.compound)).toEqual([
      'Sertraline',
      'Berberine',
      'Пирролохинолин хинон',
    ]);
    expect(matches.every(match => match.productNames.includes('Multilingual combination'))).toBe(true);

    const issueUrl = new URL(module.mitochondrialEvidenceIssueUrl({
      ...matches[0],
      productNames: ['Private medication name'],
      dosage: 'private dose',
    }));
    const issueBody = issueUrl.searchParams.get('body') || '';
    expect(issueUrl.pathname).toBe('/elkimek/get-based/issues/new');
    expect(issueUrl.searchParams.get('labels')).toBe('mitochondrial-evidence');
    expect(issueBody).toContain(`PMID ${matches[0].pmid}`);
    expect(issueBody).toContain(matches[0].summary);
    expect(issueBody).toContain('public GitHub issue');
    expect(issueBody).not.toContain('Private medication name');
    expect(issueBody).not.toContain('private dose');

    const brandOnly = module.scanSupplementsForWarnings([{
      name: 'Unrelated product',
      brand: 'Sertraline',
      ingredients: [],
    }]);
    expect(brandOnly).toEqual([]);
  });

  it('keeps formulation-specific evidence from matching a broader nutrient family', async () => {
    const data = JSON.parse(await readFile(new URL('../data/mito-compounds.json', import.meta.url), 'utf8'));
    const module = await loadWith(data);

    expect(module.lookupMitoCompound('magnesium chloride 300 mg')?.name).toBe('Magnesium chloride');
    expect(module.lookupMitoCompound('magnesium glycinate 200 mg')).toBeNull();
    expect(module.lookupMitoCompound('dietary magnesium')).toBeNull();
  });

  it('labels positive, null, mixed, mechanistic, and human caution findings explicitly', async () => {
    const module = await loadWith([{ _meta: { schemaVersion: 2 } }]);

    expect(module.mitochondrialDirectionLabel('beneficial', 'human_trial')).toBe('Potential benefit');
    expect(module.mitochondrialDirectionLabel('null', 'human_trial')).toBe('No effect detected');
    expect(module.mitochondrialDirectionLabel('mixed', 'human_intervention_mechanistic')).toBe('Mixed finding');
    expect(module.mitochondrialDirectionLabel('mechanism', 'animal_in_vivo')).toBe('Mechanism, not harm');
    expect(module.mitochondrialDirectionLabel('adverse', 'human_observational')).toBe('Human caution signal');
  });

  it('groups multiple studies under one compound without merging their claims', async () => {
    const module = await loadWith([
      { _meta: { schemaVersion: 2 } },
      {
        name: 'Coenzyme Q10',
        aliases: ['coenzyme q10', 'coq10'],
        category: 'supplement',
        evidence: [
          evidence({
            id: 'coq10-benefit',
            direction: 'beneficial',
            scopeLabel: 'Ubiquinol only',
            studyType: 'human_trial',
            studyLabel: 'Human RCT',
            pmid: 11111111,
          }),
          evidence({
            id: 'coq10-null',
            direction: 'null',
            scopeLabel: 'Simvastatin users',
            studyType: 'human_trial',
            studyLabel: 'Human RCT',
            pmid: 22222222,
          }),
        ],
      },
    ]);
    const matches = module.scanSupplementsForWarnings([{ name: 'CoQ10' }]);
    const groups = module.groupMitochondrialEvidenceMatches(matches);
    const context = module.buildMitochondrialEvidenceContext(
      [{ name: 'CoQ10' }],
      { maxItems: 1, maxEvidence: 4, maxChars: 1800 },
    );

    expect(matches).toHaveLength(2);
    expect(groups).toHaveLength(1);
    expect(groups[0].compound).toBe('Coenzyme Q10');
    expect(groups[0].evidence.map(item => item.scopeLabel)).toEqual([
      'Ubiquinol only',
      'Simvastatin users',
    ]);
    expect(context.match(/^- Coenzyme Q10/gmu)).toHaveLength(1);
    expect(context).toContain('Coenzyme Q10 (2 scoped studies');
    expect(context.match(/PMID/gu)).toHaveLength(2);
  });

  it('refuses to render the stale entry-level citation schema', async () => {
    const module = await loadWith([{
      name: 'Legacy over-broad entry',
      k: ['legacy'],
      effects: [{ f: 'Complex I', a: 'inhibits' }],
      pmid: 12345678,
    }]);

    expect(module.hasMitoCompoundData()).toBe(true);
    expect(module.lookupMitoCompound('legacy')).toBeNull();
    expect(module.scanSupplementsForWarnings([{ name: 'legacy' }])).toEqual([]);
  });

  it('bounds AI context and carries the model-to-human interpretation guardrail', async () => {
    const entries = Array.from({ length: 8 }, (_, index) => compound(
      `Compound ${index + 1}`,
      [`compound ${index + 1}`],
      evidence({
        id: `evidence-${index + 1}`,
        pmid: 20000000 + index,
        ...(index === 0 ? { scopeLabel: 'Fixture population only' } : {}),
      }),
    ));
    const module = await loadWith([{ _meta: { schemaVersion: 2 } }, ...entries]);
    const ingredients = entries.map(entry => ({ name: entry.name }));
    const context = module.buildMitochondrialEvidenceContext(
      [{ name: 'Combination', ingredients }],
      { maxItems: 3, maxChars: 1400 },
    );

    expect(context.length).toBeLessThanOrEqual(1400);
    expect(context.match(/PMID/gu)?.length).toBeLessThanOrEqual(3);
    expect(context).toContain('additional verified evidence record(s)');
    expect(context).toContain('scope: Fixture population only');
    expect(context).toContain('Treat cell, animal, tissue, and isolated-mitochondria findings as mechanistic only');
    expect(context).toContain('do not advise stopping prescription medication');
  });
});
