#!/usr/bin/env node
// Focused regression coverage for the genome feature remediation pass.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf8');
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (typeof url === 'string' && !/^https?:/i.test(url)) {
    try { return new Response(read(url), { status: 200 }); }
    catch { return new Response('', { status: 404 }); }
  }
  return realFetch(url, options);
};

let pass = 0;
let fail = 0;
function assert(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  PASS: ${name}`);
  } else {
    fail++;
    console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('=== Genome Remediation Tests ===\n');

const catalog = JSON.parse(read('data/snp-health.json'));
const rsids = Object.keys(catalog).filter(key => key.startsWith('rs'));
const actualCategories = new Set(rsids.map(rsid => catalog[rsid].category).filter(Boolean));

console.log('1. Catalog additions and semantics');
assert('Catalog metadata count matches actual entries', catalog._meta.snpCount === rsids.length,
  `meta=${catalog._meta.snpCount}, actual=${rsids.length}`);
assert('Catalog contains 60 curated SNPs', rsids.length === 60, `actual=${rsids.length}`);
assert('Catalog metadata lists every used category',
  [...actualCategories].every(category => catalog._meta.categories.includes(category)));
const evidenceLevels = new Set(catalog._meta.evidenceFramework.evidenceLevels);
const relevanceLevels = new Set(catalog._meta.evidenceFramework.relevanceLevels);
const claimTypes = new Set(catalog._meta.evidenceFramework.claimTypes);
assert('Every SNP has a complete structured evidence profile', rsids.every(rsid => {
  const entry = catalog[rsid];
  return evidenceLevels.has(entry.evidence?.level) &&
    Array.isArray(entry.evidence?.claimTypes) && entry.evidence.claimTypes.length > 0 &&
    entry.evidence.claimTypes.every(type => claimTypes.has(type)) &&
    !!entry.evidence.scope && /^\d{4}-\d{2}-\d{2}$/.test(entry.evidence.reviewedAt || '');
}));
assert('Every SNP has an independent personal-relevance profile', rsids.every(rsid =>
  relevanceLevels.has(catalog[rsid].relevance?.level) && !!catalog[rsid].relevance?.context));
assert('Evidence strength and relevance are demonstrably independent',
  catalog.rs4680.evidence.level === 'strong' && catalog.rs4680.relevance.level === 'trait' &&
  catalog.rs234706.evidence.level === 'preliminary' && catalog.rs234706.relevance.level === 'health_context');
assert('Mechanistic-only variants cannot masquerade as health evidence',
  ['rs1056836', 'rs2228570', 'rs10877012'].every(rsid =>
    catalog[rsid].evidence.level === 'mechanistic' && catalog[rsid].relevance.level === 'trait'));

const additions = ['rs4680', 'rs1815739', 'rs4988235', 'rs1229984', 'rs12934922', 'rs7501331', 'rs12913832', 'rs10455872', 'rs3798220'];
for (const rsid of additions) {
  const entry = catalog[rsid];
  assert(`${rsid} is present with references`, entry && Array.isArray(entry.references) && entry.references.length > 0);
  assert(`${rsid} has complete genotype notes`, entry && Object.values(entry.genotypes || {}).every(info => info.effect && info.note));
}
assert('COMT is an informational biochemical trait', catalog.rs4680.genotypes.AA.valence === 'informational');
assert('ACTN3 X/X is not labeled a medical risk', catalog.rs1815739.genotypes.TT.valence === 'informational');
assert('Lactase persistence includes an ancestry limitation', /ancestry|population/i.test(catalog.rs4988235.strandNote));
assert('LPA carrier result recommends direct measurement', /direct Lp\(a\).*measurement/i.test(catalog.rs10455872.genotypes.AG.note));

console.log('\n2. Evidence integrity');
const unrelatedPmids = new Set([
  '19724652', '29553379', '14563833', '29420005', '29570621',
  '7493038', '22182852', '22087105', '35105993', '20541251',
]);
const citationUrls = rsids.flatMap(rsid => catalog[rsid].references || []);
const citationPmids = citationUrls
  .map(reference => reference.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/)?.[1])
  .filter(Boolean);
assert('Every retained SNP has at least one publication',
  rsids.every(rsid => Array.isArray(catalog[rsid].references) && catalog[rsid].references.length > 0));
assert('Catalog references use recognized publication URLs', citationUrls.every(reference =>
  /^https:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?|pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC\d+\/?|doi\.org\/10\.\d{4,9}\/.+)$/i.test(reference)),
  citationUrls.filter(reference => !/^https:\/\/(?:pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?|pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC\d+\/?|doi\.org\/10\.\d{4,9}\/.+)$/i.test(reference)).join(', '));
assert('Known unrelated PMIDs cannot re-enter the catalog',
  citationPmids.every(pmid => !unrelatedPmids.has(pmid)));
assert('Recommendation evidence is also listed on its SNP card', rsids.every(rsid => {
  const entry = catalog[rsid];
  return Object.values(entry.snpHints || {}).every(hint => !hint.ref || entry.references.includes(hint.ref));
}));
assert('ALDH2 links direct variant, risk, and mechanism evidence',
  ['11375898', '25848305', '37978873'].every(pmid => catalog.rs671.references.some(reference => reference.includes(pmid))));
assert('DIO2 presents both large null and mechanistic evidence',
  ['27786042', '28324063'].every(pmid => catalog.rs225014.references.some(reference => reference.includes(pmid))) &&
  Object.values(catalog.rs225014.genotypes).every(info => info.valence === 'informational'));
assert('CETP TaqIB direction and outcome are not reversed',
  /higher HDL/i.test(catalog.rs708272.genotypes.GG.note) &&
  /not.*lower myocardial-infarction|did not differ/i.test(catalog.rs708272.genotypes.GG.note));
assert('ELOVL2 G allele is described as increasing expression',
  /G allele increases.*ELOVL2 expression/i.test(catalog.rs953413.genotypes.GG.note));
assert('ADIPOQ does not claim GG has higher adiponectin',
  /lower adiponectin/i.test(catalog.rs1501299.genotypes.GG.note));
assert('CUBN common variant is not equated with severe malabsorption',
  /not equivalent.*rare pathogenic CUBN/i.test(catalog.rs1801222.genotypes.AA.note));
assert('DIO1 exact DOI replaces the unrelated DIO1 paper',
  catalog.rs11206244.references.includes('https://doi.org/10.1016/j.humgen.2022.201110'));
assert('MC1R notes do not invent a personal burn-time multiplier',
  !/halve.*burn|burn.time estimates/i.test(JSON.stringify([catalog.rs1805007, catalog.rs1805008])));
assert('SHBG rs6257 direction is not reversed and remains informational',
  /lower SHBG/i.test(catalog.rs6257.genotypes.CC.note) &&
  /higher SHBG/i.test(catalog.rs6257.genotypes.TT.note) &&
  Object.values(catalog.rs6257.genotypes).every(info => info.valence === 'informational') &&
  !catalog.rs6257.snpHints);
assert('SHBG rs1799941 uses direct evidence without unsupported supplement hints',
  ['16926255', '19064566', 'PMC2615755'].every(id =>
    catalog.rs1799941.references.some(reference => reference.includes(id))) &&
  /higher SHBG/i.test(catalog.rs1799941.genotypes.AA.note) &&
  !catalog.rs1799941.snpHints);
assert('FADS1 rs174547 is intronic and C is the lower-activity association allele',
  /intron/i.test(catalog.rs174547.variant) &&
  catalog.rs174547.references.some(reference => reference.includes('21414826')) &&
  /lower estimated.*desaturase/i.test(catalog.rs174547.genotypes.CC.note) &&
  /higher estimated.*desaturase/i.test(catalog.rs174547.genotypes.TT.note) &&
  !catalog.rs174547.snpHints);
assert('TMPRSS6 rs2235321 links exact cohort evidence and does not claim anemia',
  ['PMC8044158', 'PMC7994066'].every(id =>
    catalog.rs2235321.references.some(reference => reference.includes(id))) &&
  /lower hepcidin/i.test(catalog.rs2235321.genotypes.AA.note) &&
  /did not establish anemia/i.test(catalog.rs2235321.genotypes.AA.note) &&
  !/associated with (?:benign )?microcytic anemia|causes? anemia/i.test(JSON.stringify(catalog.rs2235321.genotypes)));
assert('Vitamin D GWAS markers are framed as associations, not proven enzyme mechanisms',
  /does not.*measure.*enzyme activity/i.test(catalog.rs10741657.strandNote) &&
  /does not.*establish DHCR7 expression/i.test(catalog.rs12785878.strandNote) &&
  /does not by itself establish reduced hydroxylation/i.test(catalog.rs10741657.genotypes.GG.note) &&
  /does not directly prove higher DHCR7 expression/i.test(catalog.rs12785878.genotypes.GG.note));

console.log('\n3. Correct genotype handling');
const { state } = await import('../js/state.js');
await import('../js/utils.js');
await import('../js/data.js');
const dna = await import('../js/dna.js');
state.importedData.genetics = { snps: {} };
await dna.ensureSNPTable();

assert('UGT1A1 TA repeat accepts pipe notation and reversed allele order',
  dna.findGenotypeInfo(catalog.rs8175347, '7|6')?.effect === 'moderate');
const repeatRows = dna.parseManualSnpRows('', '', 'rs8175347 7|6');
assert('Manual row parser accepts a repeat genotype', repeatRows.length === 1 && repeatRows[0].genotype === '7|6');
const repeatProfile = {};
const repeatUpsert = dna.upsertGeneticsSnp(repeatProfile, 'rs8175347', '7|6', { type: 'manual', label: 'Lab report' });
assert('Manual repeat genotype can be saved', repeatUpsert.ok && repeatProfile.genetics.snps.rs8175347.normalizedGenotype === '6/7', repeatUpsert.error);
assert('A manual-only genome records its source and current catalog',
  repeatProfile.genetics.source === 'Lab report' && repeatProfile.genetics.catalogVersion?.size === 60);

assert('CYP24A1 T/T is the baseline genotype', catalog.rs6013897.genotypes.TT.effect === 'none');
assert('CYP24A1 A/A is the lower-25(OH)D association', catalog.rs6013897.genotypes.AA.effect === 'moderate');
const { geneticVitaminDMultiplier } = await import('../js/sun-spectrum.js');
const cypBaseline = geneticVitaminDMultiplier({ snps: { rs6013897: { genotype: 'TT', gene: 'CYP24A1' } } });
const cypAssociated = geneticVitaminDMultiplier({ snps: { rs6013897: { genotype: 'AA', gene: 'CYP24A1' } } });
assert('Vitamin D model follows corrected CYP24A1 direction', cypBaseline.mult === 1 && cypAssociated.mult < cypBaseline.mult,
  `TT=${cypBaseline.mult}, AA=${cypAssociated.mult}`);
assert('GC rs2282679 forward-strand direction is not reversed',
  catalog.rs2282679.genotypes.TT.effect === 'none' &&
  catalog.rs2282679.genotypes.GG.effect === 'moderate' &&
  /G allele is associated with lower/i.test(catalog.rs2282679.strandNote));
const gcBaseline = geneticVitaminDMultiplier({ snps: { rs2282679: { genotype: 'TT', gene: 'GC' } } });
const gcAssociated = geneticVitaminDMultiplier({ snps: { rs2282679: { genotype: 'GG', gene: 'GC' } } });
assert('Vitamin D model follows corrected GC rs2282679 direction',
  gcBaseline.mult === 1 && gcAssociated.mult < gcBaseline.mult,
  `TT=${gcBaseline.mult}, GG=${gcAssociated.mult}`);
const functionalOnly = geneticVitaminDMultiplier({ snps: {
  rs10877012: { genotype: 'TT', gene: 'CYP27B1' },
  rs2228570: { genotype: 'AA', gene: 'VDR' },
} });
assert('Functional CYP27B1 and VDR papers are not misused as UV-response multipliers',
  functionalOnly.mult === 1 && functionalOnly.contributors.length === 0);

const evidence = await import('../js/dna-evidence.js');
const comtProfile = evidence.resolveSnpEvidenceProfile(catalog.rs4680, catalog.rs4680.genotypes.AA);
assert('Evidence resolver exposes separate labels and conservative claim scope',
  comtProfile.evidenceLabel === 'Strong / replicated' &&
  comtProfile.relevanceLabel === 'Trait only' &&
  /COMT enzyme activity/i.test(comtProfile.scope));
assert('Finding presentation replaces severity wording with association direction',
  evidence.snpFindingPresentation('significant', 'risk').label === 'risk association' &&
  evidence.snpFindingPresentation('significant', 'protective').label === 'protective association');
const comtPrompt = evidence.buildSnpAIInterpretationPrompt(
  'rs4680',
  { genotype: 'AA', gene: 'COMT', variant: 'Val158Met' },
  catalog.rs4680,
);
assert('Focused SNP AI prompt carries the baseline without limiting broader model knowledge',
  comtPrompt.includes('Imported genotype: AA') &&
  comtPrompt.includes('Supported claim:') &&
  comtPrompt.includes('Interpretation context:') &&
  comtPrompt.includes('broader relevant knowledge beyond this catalog'));
assert('DOI evidence receives a specific study label',
  evidence.dnaStudyReferenceLabel('https://doi.org/10.1016/j.humgen.2022.201110') === 'DOI · 10.1016/j.humgen.2022.201110');
const snpIssue = new URL(evidence.snpEvidenceIssueUrl('rs4680', catalog.rs4680));
const snpIssueBody = snpIssue.searchParams.get('body') || '';
assert('SNP correction link targets the genome evidence workflow',
  snpIssue.searchParams.get('labels') === 'genome-evidence' && snpIssueBody.includes('rs4680'));
assert('SNP correction link excludes private genotype data',
  !snpIssueBody.includes('**Genotype:**') && /do not include your genotype/i.test(snpIssueBody));
const mtIssueBody = new URL(evidence.mtdnaEvidenceIssueUrl()).searchParams.get('body') || '';
assert('mtDNA correction link excludes personal lineage and location',
  !mtIssueBody.includes('U5a') && /do not include your haplogroup.*location/i.test(mtIssueBody));

console.log('\n4. Re-import preservation');
const profile = {
  genetics: {
    source: 'Older raw import',
    coverage: { found: 2, total: 51 },
    effects: {},
    snps: {
      rs4680: {
        genotype: 'AA', gene: 'COMT', variant: 'Val158Met', effect: 'none', valence: 'informational',
        source: { type: 'manual', label: 'Manual entry' },
      },
      rs1815739: {
        genotype: 'CC', gene: 'ACTN3', variant: 'R577X', effect: 'none', valence: 'informational',
        source: { type: 'report', label: 'Clinical SNP report' },
      },
      rs1801133: { genotype: 'GA', gene: 'MTHFR', variant: 'C677T', effect: 'moderate' },
    },
    mtdna: {
      haplogroup: 'U5a', origin: 'Europe', details: 'Stored maternal-line detail',
      coupling: { shortLabel: 'coupled', matchedLatBands: [3, 4] },
    },
  },
};
const adhInfo = catalog.rs1229984.genotypes.CT;
const rawComtInfo = catalog.rs4680.genotypes.GG;
const rawActn3Info = catalog.rs1815739.genotypes.TT;
dna.saveGeneticsData(profile, {
  source: 'New raw import',
  coverage: { found: 3, total: 60 },
  matches: {
    rs4680: {
      genotype: 'GG', gene: 'COMT', variant: 'Val158Met', category: 'neurotransmitters', markers: [],
      effect: rawComtInfo.effect, valence: rawComtInfo.valence, note: rawComtInfo.note,
    },
    rs1815739: {
      genotype: 'TT', gene: 'ACTN3', variant: 'R577X', category: 'performance', markers: [],
      effect: rawActn3Info.effect, valence: rawActn3Info.valence, note: rawActn3Info.note,
    },
    rs1229984: {
      genotype: 'CT', gene: 'ADH1B', variant: 'Arg48His', category: 'alcohol', markers: [],
      effect: adhInfo.effect, valence: adhInfo.valence, note: adhInfo.note,
    },
  },
});
assert('Autosomal re-import preserves mtDNA', profile.genetics.mtdna?.haplogroup === 'U5a');
assert('Autosomal re-import preserves manually added SNPs', profile.genetics.snps.rs4680?.source?.type === 'manual');
assert('Autosomal re-import keeps an overlapping manual SNP authoritative',
  profile.genetics.snps.rs4680?.genotype === 'AA' && profile.genetics.snps.rs4680?.source?.label === 'Manual entry');
assert('Autosomal re-import keeps an overlapping report SNP authoritative',
  profile.genetics.snps.rs1815739?.genotype === 'CC' && profile.genetics.snps.rs1815739?.source?.type === 'report');
assert('Autosomal re-import replaces stale raw-file SNP calls', profile.genetics.snps.rs1801133 == null);
assert('Autosomal re-import stores the fresh raw-file call', profile.genetics.snps.rs1229984?.genotype === 'CT');
assert('Coverage is recalculated after merging preserved manual and report SNPs', profile.genetics.coverage.found === 3 && profile.genetics.coverage.total === 60,
  JSON.stringify(profile.genetics.coverage));

console.log('\n5. mtDNA routing and display UX');
const hapTable = JSON.parse(read('data/haplogroups.json'));
const livingMotherline = '# Living DNA customer genotype data download file version: 1.0.1\n# Motherline positive markers\n263G\n750G\n1438G\n';
const livingAutosomal = '# Living DNA customer genotype data download file version: 1.0.1\nrs1801133\t1\t11856378\tGA\n';
assert('Living DNA motherline file routes to mtDNA importer', dna.detectDNAFile(livingMotherline) === 'mtdna');
assert('Living DNA autosomal file still routes to autosomal parser', dna.detectDNAFile(livingAutosomal) === 'livingdna');
assert('Manual haplogroup choices include all catalog subclades',
  ['H1', 'H3', 'J1', 'J2', 'K1', 'T1', 'T2', 'U5a', 'U5b', 'U6', 'A2'].every(hg => dna.HAPLOGROUP_LIST.includes(hg)));
assert('Direct H diagnostic markers resolve haplogroup H',
  dna.resolveHaplogroup([{ raw: '2706A' }, { raw: '7028C' }], hapTable)?.haplogroup === 'H');
assert('mtDNA evidence includes structured supportive, mixed, and null findings',
  hapTable._meta.references.length >= 10 &&
  ['supportive', 'mixed', 'null'].every(direction => hapTable._meta.references.some(reference => reference.direction === direction)) &&
  hapTable._meta.references.every(reference => reference.pmid && reference.title && reference.summary && reference.model && reference.limitations));
assert('mtDNA evidence includes the large modern climate-genomics study',
  hapTable._meta.references.some(reference => reference.pmid === 41701624));

state.importedData.genetics = {
  source: '23andMe',
  coverage: { found: 1, total: 60 },
  effects: { normal: 1 },
  snps: {
    rs4680: { genotype: 'AA', gene: 'COMT', variant: 'Val158Met', category: 'neurotransmitters', effect: 'none', valence: 'informational' },
  },
  mtdna: {
    haplogroup: 'U5a', origin: 'European', source: 'mtDNA (Living DNA)', importDate: '2026-08-10',
    matchedMutations: 7, totalDiagnostic: 9, details: 'Maternal-line context retained.',
    coupling: {
      label: 'Coupled', shortLabel: 'coupled', climate: 'Cold climate',
      description: 'Coupling description retained.', implications: 'Coupling implications retained.', matchedLatBands: [3, 4],
    },
  },
};
const rendered = dna.renderGeneticsSection();
assert('Genome overview displays catalog coverage', rendered.includes('Catalog coverage') && rendered.includes('1 / 60'));
assert('Informational SNPs render as blue traits', rendered.includes('genetics-finding-trait') && rendered.includes('>trait<'));
assert('Genome rows display evidence and relevance as separate axes',
  rendered.includes('Evidence · Strong') && rendered.includes('Relevance · Trait only'));
assert('mtDNA results display origin and marker match', rendered.includes('European') && rendered.includes('7 / 9'));
assert('mtDNA details and coupling description are retained in the UI',
  rendered.includes('Maternal-line context retained.') && rendered.includes('Coupling description retained.') && rendered.includes('Coupling implications retained.'));
assert('Legacy genetics surface exposes privacy-safe evidence contribution links',
  rendered.includes('suggest study or correction') && rendered.includes('Suggest a catalog SNP'));
assert('Legacy genetics surface offers an explicit, lightweight AI handoff',
  rendered.includes('data-dna-action="ask-ai-snp"') && rendered.includes('>Ask AI</button>'));
const context = dna.buildFullGeneticsContext(state.importedData.genetics);
assert('AI context labels COMT as an informational trait', context.includes('COMT Val158Met') && context.includes('informational trait'));
assert('AI context bounds the SNP claim with evidence and relevance labels',
  context.includes('Evidence: Strong / replicated') &&
  context.includes('Relevance: Trait only') &&
  context.includes('grounded baseline, not a limit on broader model knowledge'));
const compactContext = dna.buildGeneticsContext(state.importedData.genetics);
assert('Automatic AI context omits per-SNP scope and interpretation prose',
  compactContext.includes('Evidence: Strong / replicated') &&
  !compactContext.includes('Supported claim:') &&
  !compactContext.includes('Interpretation context:'));
assert('AI context receives complete Wallace-lens details and interpretation guidance',
  context.includes('Maternal lineage origin context: European') &&
  context.includes('Wallace coupling context: Coupling description retained.') &&
  context.includes('Wallace lens implications: Coupling implications retained.') &&
  context.includes('not as a direct measurement'));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
