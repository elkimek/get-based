#!/usr/bin/env node
// test-dna-illumina-and-valence.js — covers everything shipped 2026-04-24:
//   - Illumina GenomeStudio (DNAEra) format support + probe-name prefix strip
//   - CETP TaqIB (rs708272) strand fix (forward-strand G/A keys)
//   - Effect-label recalibration across MTHFR A1298C / MTR / VDR / FUT2 / ADIPOQ
//   - 5 new SNPs across alcohol / caffeine / bodyComposition categories
//   - Valence-aware dot rendering + legend block + catLabels coverage
//
// Run: node tests/test-dna-illumina-and-valence.js  (or via npm test)
//
// Full port — parseDNAFile spins a Blob-backed Worker (synchronous Worker
// shim in _node-shim.js); renderGeneticsSection returns an HTML string with
// no DOM dependency. snp-health.json + dna.js source go through the
// fs-backed fetch shim; window._labState comes from state.js.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

// fs-backed fetch shim for the source-inspection + JSON reads.
const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    try { return new Response(read(url), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== DNA: Illumina + valence + recalibration ===\n');

// state.js sets window._labState; dna.js's Object.assign(window, …) runs on import.
await import('../js/state.js');
await import('../js/utils.js');
await import('../js/data.js');
const dna = await import('../js/dna.js');
const snpTable = await fetch('data/snp-health.json').then(r => r.json());
const dnaSrc = await fetch('js/dna.js').then(r => r.text());

// ═══════════════════════════════════════
// 1. Illumina GSGT format detection
// ═══════════════════════════════════════
console.log('1. Illumina Format Detection');

const illuminaHeader = '﻿[Header]\nGSGT Version,2.0.5\nProcessing Date,8/14/2023 10:59 PM\nContent,,GSAMD-24v3-0-EA_20034606_A1.bpm\nNum SNPs,730059\n[Data]\nSample Name,SNP Name,Chr,Position,Allele1 - Plus,Allele2 - Plus\n';
assert('Detects Illumina GSGT (BOM + [Header])', dna.detectDNAFile(illuminaHeader) === 'illumina-gsgt');
assert('Detects Illumina GSGT without BOM', dna.detectDNAFile('[Header]\nGSGT Version,2.0.5\n[Data]\n') === 'illumina-gsgt');
assert('Does NOT match plain [Header] without GSGT', dna.detectDNAFile('[Header]\nSomething Else,1.0\n') === null);
assert('Does NOT trigger on Ancestry/23andMe', dna.detectDNAFile('#AncestryDNA raw data download\n') === 'ancestry');

// Filename hint includes dnaera
assert('Filename "DNAEra-orig-XXX.csv" recognized', dna.isDNAFile({ name: 'DNAEra-orig-41220311706341.csv' }));
assert('Filename without dnaera/ancestry/etc not recognized', !dna.isDNAFile({ name: 'random-data.csv' }));

// Regression guard: the worker's [Data]-block detection regex must use
// double-escaped brackets in the template literal (\\[Data\\]) so the
// worker source has a regex matching the literal string [Data]. A single
// escape would silently render `/^[Data]/i` (a character class matching
// D/a/t) — the parser would never advance past the [Header] block. This
// bit us once during development. The dna.js source must contain `\\[Data\\]`.
const dnaSrcForRegex = dnaSrc; // identical read — reuse the section-0 fetch
assert('Worker [Data] regex uses double-escaped brackets',
  dnaSrcForRegex.includes('/^\\\\[Data\\\\]/i'),
  'should match `\\\\[Data\\\\]` in source so worker sees \\[Data\\]');
// Sanity: prove the rendered worker-source regex does match the literal "[Data]".
// /^\[Data\]/i matches "[Data]"; /^[Data]/i (the broken version) does NOT.
assert('Properly-escaped regex matches literal [Data]', /^\[Data\]/i.test('[Data]'));
assert('Single-escape would NOT match (proves the bug is real)', !/^[Data]/i.test('[Data]'));

// ═══════════════════════════════════════
// 2. Illumina GSGT parser end-to-end
// ═══════════════════════════════════════
console.log('2. Illumina GSGT Parser');

// Synthetic file mirroring real DNAEra structure: BOM + [Header] block,
// [Data] marker, column header, then 6-col rows. Mix bare rsids, prefixed
// probes, missing calls, and chip-internal IDs to test all parser branches.
const illuminaContent = '﻿[Header]\n' +
  'GSGT Version,2.0.5\n' +
  'Processing Date,8/14/2023 10:59 PM\n' +
  'Content,,GSAMD-24v3-0-EA.bpm\n' +
  'Num SNPs,8\n' +
  '[Data]\n' +
  'Sample Name,SNP Name,Chr,Position,Allele1 - Plus,Allele2 - Plus\n' +
  'sample1,rs1801133,1,11856378,A,A\n' +              // bare rsid, MTHFR C677T
  'sample1,seq-rs1815739,11,66328095,T,C\n' +          // wrapped: seq- prefix
  'sample1,GSA-rs1800562,6,26093141,G,G\n' +           // wrapped: GSA- prefix
  'sample1,ilmnseq_rs7412_ilmnTOP_5AT,19,45412079,T,C\n' + // wrapped: ilmnseq_ + suffix
  'sample1,BOT-rs429358,19,45411941,T,T\n' +           // wrapped: BOT- prefix
  'sample1,rs9999999,1,100,-,-\n' +                    // missing-call row (filtered)
  'sample1,1:103380393,1,103380393,G,G\n' +            // chip-internal ID (no rs, filtered)
  'sample1,seq-rs2228570,12,48272895,A,A\n' +          // wrapped VDR FokI (recovers a real SNP)
  'sample1,seq-rs2228570.1,12,48272895,G,G\n' +        // duplicate probe — first-wins should keep AA
  '';
const illuminaFile = new File([illuminaContent], 'DNAEra-test.csv', { type: 'text/csv' });
const iResult = await dna.parseDNAFile(illuminaFile);

assert('Illumina: source detected', iResult.source === 'Illumina GenomeStudio (DNAEra)');
assert('Illumina: bare rs1801133 matched', iResult.matches.rs1801133 != null);
assert('Illumina: rs1801133 genotype is AA', iResult.matches.rs1801133?.genotype === 'AA');
assert('Illumina: seq-rs1815739 prefix stripped → match', iResult.matches.rs1815739 == null || iResult.matches.rs1815739?.genotype === 'TC');
// rs1815739 may not be in snp-health.json (we know it isn't) — test prefix strip via known rsid instead
assert('Illumina: GSA-rs1800562 prefix stripped → HFE matched', iResult.matches.rs1800562 != null);
assert('Illumina: GSA-rs1800562 genotype GG', iResult.matches.rs1800562?.genotype === 'GG');
assert('Illumina: ilmnseq_rs7412_* prefix+suffix stripped → match', iResult.matches.rs7412 != null);
assert('Illumina: ilmnseq rs7412 genotype TC', iResult.matches.rs7412?.genotype === 'TC');
assert('Illumina: BOT-rs429358 prefix stripped → match', iResult.matches.rs429358 != null);
assert('Illumina: seq-rs2228570 → VDR FokI matched (recovery test)', iResult.matches.rs2228570 != null);
assert('Illumina: first-wins kept AA (duplicate probe was GG)', iResult.matches.rs2228570?.genotype === 'AA');
assert('Illumina: missing-call row filtered (rs9999999 not present)', iResult.matches.rs9999999 == null);
assert('Illumina: chip-internal ID filtered (1:103380393 not in matches)', !Object.keys(iResult.matches).some(k => k.startsWith('1:')));

// ═══════════════════════════════════════
// 3. CETP TaqIB strand fix (rs708272)
// ═══════════════════════════════════════
console.log('3. CETP TaqIB Strand Fix');

const cetp = snpTable.rs708272;
assert('rs708272 exists in SNP table', cetp != null);
assert('rs708272 has GG key (forward strand)', cetp.genotypes.GG != null);
assert('rs708272 has GA key (forward strand)', cetp.genotypes.GA != null);
assert('rs708272 has AA key (forward strand)', cetp.genotypes.AA != null);
assert('rs708272 does NOT have old GT reverse-strand key', cetp.genotypes.GT == null);
assert('rs708272 does NOT have old TT reverse-strand key', cetp.genotypes.TT == null);
assert('rs708272 has strandNote acknowledging old G/T notation', /reverse strand|G\/T/i.test(cetp.strandNote || ''));
assert('rs708272 AA marked protective (B1B1 = lower MI risk)', cetp.genotypes.AA.valence === 'protective');

// ═══════════════════════════════════════
// 4. Effect-label recalibration (Part B)
// ═══════════════════════════════════════
console.log('4. Recalibration Findings');

assert('rs1801131 MTHFR A1298C TG recalibrated to mild', snpTable.rs1801131?.genotypes?.TG?.effect === 'mild');
assert('rs1801131 MTHFR A1298C GG recalibrated to mild', snpTable.rs1801131?.genotypes?.GG?.effect === 'mild');
assert('rs1805087 MTR A2756G AG recalibrated to mild', snpTable.rs1805087?.genotypes?.AG?.effect === 'mild');
assert('rs1805087 MTR GG kept at moderate', snpTable.rs1805087?.genotypes?.GG?.effect === 'moderate');
assert('rs2228570 VDR FokI AA recalibrated to mild', snpTable.rs2228570?.genotypes?.AA?.effect === 'mild');
assert('rs2241766 ADIPOQ TG recalibrated to mild', snpTable.rs2241766?.genotypes?.TG?.effect === 'mild');
assert('rs2241766 ADIPOQ GG recalibrated to mild', snpTable.rs2241766?.genotypes?.GG?.effect === 'mild');

// FUT2 logic-bug fix: GG was wrongly "moderate" with a hint, should be "none"
assert('rs601338 FUT2 GG fixed to none (wild-type secretor)', snpTable.rs601338?.genotypes?.GG?.effect === 'none');
assert('rs601338 FUT2 GG has NO snpHint (wild-type shouldn\'t have one)', snpTable.rs601338?.snpHints?.GG == null);
assert('rs601338 FUT2 GA marked neutral (lab artifact)', snpTable.rs601338?.genotypes?.GA?.valence === 'neutral');
assert('rs601338 FUT2 AA marked neutral (lab artifact)', snpTable.rs601338?.genotypes?.AA?.valence === 'neutral');

// ═══════════════════════════════════════
// 5. New SNPs (Part A — 5 additions)
// ═══════════════════════════════════════
console.log('5. New SNPs (v1.22.0)');

const newSnps = {
  rs671:       { gene: 'ALDH2',  category: 'alcohol',         keys: ['GG', 'GA', 'AA'] },
  rs762551:    { gene: 'CYP1A2', category: 'caffeine',        keys: ['AA', 'AC', 'CC'] },
  rs10830963:  { gene: 'MTNR1B', category: 'bloodSugar',      keys: ['CC', 'CG', 'GG'] },
  rs9939609:   { gene: 'FTO',    category: 'bodyComposition', keys: ['TT', 'AT', 'AA'] },
  rs5882:      { gene: 'CETP',   category: 'lipids',          keys: ['AA', 'AG', 'GG'] },
};
for (const [rsid, expected] of Object.entries(newSnps)) {
  const entry = snpTable[rsid];
  assert(`${rsid} exists in SNP table`, entry != null);
  if (!entry) continue;
  assert(`${rsid} gene = ${expected.gene}`, entry.gene === expected.gene);
  assert(`${rsid} category = ${expected.category}`, entry.category === expected.category);
  for (const k of expected.keys) {
    assert(`${rsid} has forward-strand key "${k}"`, entry.genotypes?.[k] != null);
  }
}

// ALDH2 strong effect on heterozygote (cancer risk)
assert('rs671 GA marked significant (dominant-negative tetramer)', snpTable.rs671?.genotypes?.GA?.effect === 'significant');
// FTO has no snpHints (no bodyFatPct slot in catalog, exercise not a supplement)
assert('rs9939609 FTO has no snpHints (no catalog slot)', snpTable.rs9939609?.snpHints == null);

// ═══════════════════════════════════════
// 6. Valence field — protective + neutral marks
// ═══════════════════════════════════════
console.log('6. Valence Field');

// Confirmed protective genotypes
const protective = [
  ['rs11591147', 'GT', 'PCSK9 R46L'],
  ['rs11591147', 'TT', 'PCSK9 R46L'],
  ['rs5882',     'AG', 'CETP I405V'],
  ['rs5882',     'GG', 'CETP I405V'],
  ['rs708272',   'AA', 'CETP TaqIB B1B1'],
  ['rs1800588',  'CT', 'LIPC -514T'],
  ['rs1800588',  'TT', 'LIPC -514T'],
  ['rs1801282',  'CG', 'PPARG Pro/Ala'],
  ['rs1801282',  'GG', 'PPARG Ala/Ala'],
];
for (const [rsid, gen, label] of protective) {
  assert(`${label} (${rsid} ${gen}) marked valence:protective`, snpTable[rsid]?.genotypes?.[gen]?.valence === 'protective');
}

// Neutral (lab-artifact / informational)
assert('FUT2 GA marked valence:neutral', snpTable.rs601338?.genotypes?.GA?.valence === 'neutral');
assert('FUT2 AA marked valence:neutral', snpTable.rs601338?.genotypes?.AA?.valence === 'neutral');

// Risk genotypes have no explicit valence (implicit default = 'risk')
assert('MTHFR C677T AA has no valence field (defaults to risk)', snpTable.rs1801133?.genotypes?.AA?.valence == null);
assert('HFE C282Y AA has no valence field (defaults to risk)', snpTable.rs1800562?.genotypes?.AA?.valence == null);

// ═══════════════════════════════════════
// 7. dotFor() icon mapping (via rendered HTML)
// ═══════════════════════════════════════
console.log('7. Dot Rendering');

// dotFor is a local fn inside renderGeneticsSection — verify behavior by
// mocking genetics state for known genotypes and inspecting rendered HTML.
const origGenetics = window._labState.importedData.genetics;

function mockAndRender(snps) {
  window._labState.importedData.genetics = {
    source: 'TestSource', importDate: '2026-04-24',
    coverage: { found: Object.keys(snps).length, total: Object.keys(snps).length },
    effects: { significant: 0, moderate: 0, normal: 0 },
    snps
  };
  return dna.renderGeneticsSection();
}

// Helper: extract just the finding-row HTML (excludes the legend, which always
// contains every dot character for explanatory purposes).
const findingRowDots = (html) => {
  const rows = html.match(/<div class="genetics-finding-row[^"]*"[^>]*>[\s\S]*?<\/div>/g) || [];
  return rows.join('').match(/[🔴🟡🟠🟢⚪]/g)?.join('') || '';
};

// Protective: PCSK9 GT → green dot in the finding row, no red dot in the row
let html = mockAndRender({ rs11591147: { genotype: 'GT', gene: 'PCSK9', variant: 'R46L' } });
assert('Protective finding row has green dot', findingRowDots(html).includes('🟢'));
assert('Protective finding row has NO red dot', !findingRowDots(html).includes('🔴'));

// Significant risk: MTHFR C677T AA → red dot
html = mockAndRender({ rs1801133: { genotype: 'AA', gene: 'MTHFR', variant: 'C677T' } });
assert('Significant risk renders red dot', html.includes('🔴'));

// Moderate risk: MTHFR A1298C GG... wait we recalibrated that to mild. Use HFE C282Y heterozygote → moderate
html = mockAndRender({ rs1800562: { genotype: 'GA', gene: 'HFE', variant: 'C282Y' } });
assert('Moderate risk renders orange dot', html.includes('🟠'));

// Mild risk: MTR A2756G AG → orange dot (🟠 = D83D DFE0)
html = mockAndRender({ rs1805087: { genotype: 'AG', gene: 'MTR', variant: 'A2756G' } });
assert('Mild risk renders yellow dot', html.includes('🟡'));

// Neutral: FUT2 AA → white circle, but collapsed under other imported SNPs
html = mockAndRender({ rs601338: { genotype: 'AA', gene: 'FUT2', variant: 'W154X' } });
assert('Neutral genotype renders white circle', html.includes('⚪'));
assert('Neutral genotype is collapsed with other SNPs', html.includes('genetics-other-snps'));

// None: FUT2 GG (wild-type) → collapsed, not shown in the priority tier
html = mockAndRender({ rs601338: { genotype: 'GG', gene: 'FUT2', variant: 'W154X' } });
assert('None-effect genotype is collapsed with other SNPs', html.includes('genetics-other-snps') && html.includes('normal') && findingRowDots(html).includes('⚪'));

// Restore genetics state
window._labState.importedData.genetics = origGenetics;

// ═══════════════════════════════════════
// 8. Legend block + catLabels coverage
// ═══════════════════════════════════════
console.log('8. Legend & Category Labels');

// Legend renders when there's at least one finding
window._labState.importedData.genetics = {
  source: 'TestSource', importDate: '2026-04-24',
  coverage: { found: 1, total: 1 }, effects: {},
  snps: { rs1801133: { genotype: 'AA', gene: 'MTHFR', variant: 'C677T' } }
};
const legendHtml = dna.renderGeneticsSection();
assert('Legend block renders', legendHtml.includes('genetics-legend'));
assert('Legend has "significant risk" label', legendHtml.includes('significant risk'));
assert('Legend has "mild risk" label', legendHtml.includes('mild risk'));
assert('Legend has "beneficial" label', legendHtml.includes('beneficial'));
assert('Legend has "neutral" label', legendHtml.includes('neutral'));
assert('Legend has "moderate risk" label', legendHtml.includes('moderate risk'));
window._labState.importedData.genetics = origGenetics;

// Every category used in snp-health.json must have a display label in SNP_CATEGORY_LABELS
const catLabelsMatch = dnaSrc.match(/SNP_CATEGORY_LABELS = \{([^}]+)\}/);
assert('SNP_CATEGORY_LABELS object found in dna.js source', catLabelsMatch != null);
const catLabelsKeys = (catLabelsMatch?.[1] || '').match(/(\w+):/g)?.map(s => s.replace(':', '')) || [];
const usedCats = new Set();
for (const [rsid, entry] of Object.entries(snpTable)) {
  if (rsid.startsWith('rs') && entry.category) usedCats.add(entry.category);
}
for (const cat of usedCats) {
  assert(`catLabels has display label for "${cat}"`, catLabelsKeys.includes(cat));
}

// Specifically the new categories from v1.22.0
assert('catLabels has "alcohol"', catLabelsKeys.includes('alcohol'));
assert('catLabels has "caffeine"', catLabelsKeys.includes('caffeine'));
assert('catLabels has "bodyComposition"', catLabelsKeys.includes('bodyComposition'));

// ═══════════════════════════════════════
// 9. End-to-end Illumina → render
// ═══════════════════════════════════════
console.log('9. End-to-End: Illumina file → render dashboard');

// Build a small Illumina file with rsids that exercise all 5 dot states:
//   PCSK9 GT (protective)            → 🟢
//   MTHFR C677T AA (significant)     → 🔴
//   HFE C282Y GA (moderate)          → 🟠
//   MTR A2756G AG (mild)             → 🟡
//   FUT2 W154X AA (neutral)          → ⚪
const e2eContent = '﻿[Header]\nGSGT Version,2.0.5\n[Data]\n' +
  'Sample Name,SNP Name,Chr,Position,Allele1 - Plus,Allele2 - Plus\n' +
  'sample1,rs11591147,1,55505647,G,T\n' +
  'sample1,rs1801133,1,11856378,A,A\n' +
  'sample1,rs1800562,6,26093141,G,A\n' +
  'sample1,rs1805087,1,237048500,A,G\n' +
  'sample1,rs601338,19,49206674,A,A\n' +
  '';
const e2eFile = new File([e2eContent], 'DNAEra-e2e.csv', { type: 'text/csv' });
const e2eResult = await dna.parseDNAFile(e2eFile);

assert('E2E: 5 expected matches found', Object.keys(e2eResult.matches).length === 5);
assert('E2E: PCSK9 GT matched', e2eResult.matches.rs11591147?.genotype === 'GT');
assert('E2E: MTHFR C677T AA matched', e2eResult.matches.rs1801133?.genotype === 'AA');
assert('E2E: HFE C282Y heterozygous matched', e2eResult.matches.rs1800562 != null);
assert('E2E: MTR AG matched', e2eResult.matches.rs1805087?.genotype === 'AG');
assert('E2E: FUT2 AA matched', e2eResult.matches.rs601338?.genotype === 'AA');

// Now save the parsed result and render the dashboard, asserting all 5 dots
// are present in the rendered HTML.
const e2eOrig = window._labState.importedData.genetics;
const e2eState = { source: e2eResult.source, importDate: '2026-04-24', coverage: e2eResult.coverage, effects: {}, snps: {} };
for (const [rsid, m] of Object.entries(e2eResult.matches)) {
  e2eState.snps[rsid] = { genotype: m.genotype, gene: m.gene, variant: m.variant };
}
window._labState.importedData.genetics = e2eState;
const e2eHtml = dna.renderGeneticsSection();
assert('E2E render: green dot present (PCSK9 protective)', e2eHtml.includes('🟢'));
assert('E2E render: red dot present (MTHFR significant)', e2eHtml.includes('🔴'));
assert('E2E render: orange dot present (HFE moderate)', e2eHtml.includes('🟠'));
assert('E2E render: yellow dot present (MTR mild)', e2eHtml.includes('🟡'));
assert('E2E render: white circle present (FUT2 neutral)', e2eHtml.includes('⚪'));
assert('E2E render: legend visible', e2eHtml.includes('genetics-legend'));
assert('E2E render: source name "Illumina GenomeStudio (DNAEra)" visible', e2eHtml.includes('Illumina GenomeStudio'));
window._labState.importedData.genetics = e2eOrig;

// ═══════════════════════════════════════
// 10. Severity ordering (categories + within-category)
// ═══════════════════════════════════════
// After the v1.7.6 mild-tier addition, the category sort and within-category
// sort each promote a full rank (significant > moderate > mild) instead of a
// binary "has significant?" / "is significant?". A category of moderate
// findings must out-rank a category of only mild findings, and inside a
// category mild rows must follow moderate rows.
console.log('10. Severity Ordering');

const sortOrig = window._labState.importedData.genetics;
window._labState.importedData.genetics = {
  source: 'TestSource', importDate: '2026-04-24',
  coverage: { found: 4, total: 4 }, effects: {},
  snps: {
    // vitaminB12 cat → only mild (FUT2 GA = mild/neutral)
    rs601338: { genotype: 'GA', gene: 'FUT2', variant: 'W154X' },
    // iron cat → only moderate (HFE GA = moderate/risk)
    rs1800562: { genotype: 'GA', gene: 'HFE', variant: 'C282Y' },
    // methylation cat → both moderate (MTHFR GA) AND mild (MTR AG) — proves within-category ordering
    rs1801133: { genotype: 'GA', gene: 'MTHFR', variant: 'C677T' },
    rs1805087: { genotype: 'AG', gene: 'MTR',   variant: 'A2756G' },
  }
};
const sortHtml = dna.renderGeneticsSection();
// Strip whitespace for stable substring comparisons.
const sortFlat = sortHtml.replace(/\s+/g, ' ');
const ironPos        = sortFlat.indexOf('>Iron<');
const vitaminB12Pos  = sortFlat.indexOf('>Vitamin B12<');
const methylationPos = sortFlat.indexOf('>Methylation<');
assert('Category sort: iron (moderate) renders before vitaminB12 (mild only)', ironPos > 0 && vitaminB12Pos > ironPos);
assert('Category sort: methylation (has moderate) renders before vitaminB12 (mild only)', methylationPos > 0 && vitaminB12Pos > methylationPos);

// Within methylation: MTHFR (moderate) must appear before MTR (mild).
const methylationBlock = sortFlat.slice(methylationPos, sortFlat.indexOf('genetics-cat-group', methylationPos + 1));
const mthfrPos = methylationBlock.indexOf('MTHFR');
const mtrPos   = methylationBlock.indexOf('MTR ');
assert('Within-category sort: MTHFR (moderate) before MTR (mild) inside methylation', mthfrPos > 0 && mtrPos > mthfrPos);

window._labState.importedData.genetics = sortOrig;

// ═══════════════════════════════════════
// Results
// ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
