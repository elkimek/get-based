// test-dna-recommendations.js — Verify DNA-aware supplement recommendation integration
// Run: fetch('tests/test-dna-recommendations.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c DNA-Aware Supplement Recommendations Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const recSrc = await fetchWithRetry('js/recommendations.js');
  const dnaSrc = await fetchWithRetry('js/dna.js');
  const ctxSrc = await fetchWithRetry('js/context-cards.js');
  const cssSrc = await fetchWithRetry('styles.css');
  const snpData = await fetch('data/snp-health.json').then(r => r.json());
  const catalogData = await fetch('data/recommendations.json').then(r => r.json());

  // ═══════════════════════════════════════
  // 1. snp-health.json — snpHints structure
  // ═══════════════════════════════════════
  console.log('%c 1. SNP Hints Data ', 'font-weight:bold;color:#f59e0b');

  // Count SNPs with snpHints
  let hintsCount = 0;
  const validDirections = new Set(['form', 'avoid', 'increase']);
  let allHintsValid = true;
  for (const [rsid, entry] of Object.entries(snpData)) {
    if (rsid.startsWith('_')) continue;
    if (!entry.snpHints) continue;
    hintsCount++;
    for (const [genotype, hint] of Object.entries(entry.snpHints)) {
      if (!hint.slotKey || !hint.direction || !hint.text || !hint.ref) {
        allHintsValid = false;
        console.error(`  Invalid hint: ${rsid} ${genotype}`, hint);
      }
      if (!validDirections.has(hint.direction)) {
        allHintsValid = false;
        console.error(`  Invalid direction: ${rsid} ${genotype} ${hint.direction}`);
      }
      if (!/^https?:\/\/pubmed/.test(hint.ref)) {
        allHintsValid = false;
        console.error(`  Non-PubMed ref: ${rsid} ${genotype} ${hint.ref}`);
      }
    }
  }
  assert('snpHints on 20+ SNPs', hintsCount >= 20, `found ${hintsCount}`);
  assert('All snpHints have required fields (slotKey, direction, text, ref)', allHintsValid);

  // Check wording rules
  let wordingValid = true;
  for (const [rsid, entry] of Object.entries(snpData)) {
    if (rsid.startsWith('_') || !entry.snpHints) continue;
    for (const [genotype, hint] of Object.entries(entry.snpHints)) {
      if (!hint.text.startsWith('Your ')) {
        wordingValid = false;
        console.error(`  Hint text must start with "Your": ${rsid} ${genotype}`);
      }
      if (/\brequires?\b/i.test(hint.text) || /\bis better\b/i.test(hint.text) || /\bis dangerous\b/i.test(hint.text) || /\byou are deficient\b/i.test(hint.text)) {
        wordingValid = false;
        console.error(`  Hint uses forbidden wording: ${rsid} ${genotype}`);
      }
    }
  }
  assert('All hints follow wording rules (Your..., suggests, no absolutes)', wordingValid);

  // No bilirubin hints
  const bilirubinSnps = Object.entries(snpData).filter(([k, v]) => !k.startsWith('_') && v.category === 'bilirubin');
  const bilirubinHints = bilirubinSnps.filter(([, v]) => v.snpHints);
  assert('No bilirubin hints (Gilbert syndrome is benign)', bilirubinHints.length === 0);

  // No hints for "none" effect genotypes
  let noNoneHints = true;
  for (const [rsid, entry] of Object.entries(snpData)) {
    if (rsid.startsWith('_') || !entry.snpHints) continue;
    for (const genotype of Object.keys(entry.snpHints)) {
      const gInfo = entry.genotypes?.[genotype];
      if (gInfo && gInfo.effect === 'none') {
        noNoneHints = false;
        console.error(`  Hint for "none" effect genotype: ${rsid} ${genotype}`);
      }
    }
  }
  assert('No hints for effect: "none" genotypes', noNoneHints);

  // FADS markers fixed
  assert('rs174546 markers includes fattyAcids.omega3Index', (snpData.rs174546?.markers || []).includes('fattyAcids.omega3Index'));
  assert('rs174547 markers includes fattyAcids.omega3Index', (snpData.rs174547?.markers || []).includes('fattyAcids.omega3Index'));
  assert('rs174575 markers includes fattyAcids.omega3Index', (snpData.rs174575?.markers || []).includes('fattyAcids.omega3Index'));
  assert('rs953413 markers includes fattyAcids.omega3Index', (snpData.rs953413?.markers || []).includes('fattyAcids.omega3Index'));

  // ═══════════════════════════════════════
  // 2. Catalog — new slots
  // ═══════════════════════════════════════
  console.log('%c 2. Catalog Slots ', 'font-weight:bold;color:#f59e0b');

  assert('Catalog has vitamins.vitaminB12 slot', !!catalogData.slots?.['vitamins.vitaminB12']);
  assert('Catalog has vitamins.folate slot', !!catalogData.slots?.['vitamins.folate']);
  const b12Slot = catalogData.slots?.['vitamins.vitaminB12'];
  const folateSlot = catalogData.slots?.['vitamins.folate'];
  assert('B12 slot has forms', b12Slot?.forms?.length >= 2);
  assert('B12 slot has food forms', b12Slot?.foodForms?.length >= 2);
  assert('Folate slot has forms', folateSlot?.forms?.length >= 2);
  assert('Folate slot has food forms', folateSlot?.foodForms?.length >= 2);

  // ═══════════════════════════════════════
  // 3. recommendations.js — buildDNAHints
  // ═══════════════════════════════════════
  console.log('%c 3. buildDNAHints ', 'font-weight:bold;color:#f59e0b');

  assert('buildDNAHints exported', recSrc.includes('export function buildDNAHints'));
  assert('buildDNAHints on window', typeof window.buildDNAHints === 'function');
  assert('buildDNAHints handles APOE specially', recSrc.includes('genetics.apoe') && recSrc.includes('lipids.ldl'));
  assert('buildDNAHints handles genotype reversal', recSrc.includes('[1] + g[0]') || recSrc.includes('rev'));

  // Test with no genetics — should return empty
  const noGenResult = window.buildDNAHints('vitamins.vitaminD');
  assert('buildDNAHints returns [] with no genetics', Array.isArray(noGenResult) && noGenResult.length === 0);

  // ═══════════════════════════════════════
  // 4. _renderRecSection DNA integration
  // ═══════════════════════════════════════
  console.log('%c 4. Render Integration ', 'font-weight:bold;color:#f59e0b');

  assert('_renderRecSection calls buildDNAHints', recSrc.includes('buildDNAHints(slotKey)'));
  assert('YOUR GENETICS label in render', recSrc.includes('YOUR GENETICS'));
  assert('Avoid hints get amber styling', recSrc.includes('rec-dna-avoid'));
  assert('Study link rendered for hints', recSrc.includes('rec-dna-ref'));
  assert('escapeHTML used for hint text', recSrc.includes('escapeHTML(h.text)'));
  assert('Hint ref validated to https', recSrc.includes("'https?://'") || recSrc.includes('/^https?:\\/\\//'));

  // ═══════════════════════════════════════
  // 5. detectSupplementSlots DNA enhancement
  // ═══════════════════════════════════════
  console.log('%c 5. Keyword Scanner DNA ', 'font-weight:bold;color:#f59e0b');

  assert('detectSupplementSlots has DNA gene matching', recSrc.includes('gene.toLowerCase()') || recSrc.includes('stored.gene'));
  assert('detectSupplementSlots cap raised for DNA', recSrc.includes('hasDNA ? 2 : 1') || recSrc.includes('hasDNA'));
  assert('detectSupplementSlots verifies slot exists in catalog', recSrc.includes('_catalog.slots[hint.slotKey]'));

  // ═══════════════════════════════════════
  // 6. Card DNA section in Tips modal
  // ═══════════════════════════════════════
  console.log('%c 6. Card DNA Section ', 'font-weight:bold;color:#f59e0b');

  // DNA info is inside the Tips modal via _buildCardDNASection in recommendations.js
  const recSrc2 = await fetchWithRetry('js/recommendations.js');
  assert('_buildCardDNASection checks contextCards', recSrc2.includes('entry.contextCards'));
  assert('_buildCardDNASection checks snpHints', recSrc2.includes('!entry.snpHints'));
  assert('_buildCardDNASection skips effect=none', recSrc2.includes("effect === 'none'"));

  // ═══════════════════════════════════════
  // 7. Context card Tips badge rendering
  // ═══════════════════════════════════════
  console.log('%c 7. Context Card Tips Badges ', 'font-weight:bold;color:#f59e0b');
  assert('recommendations.js has _buildCardDNASection', recSrc2.includes('function _buildCardDNASection'));
  assert('Card DNA section checks contextCards', recSrc2.includes('entry.contextCards'));
  assert('Card DNA section shows gene name', recSrc2.includes('stored.gene'));
  assert('Card DNA section shows avoid styling', recSrc2.includes('ctx-tip-avoid'));

  // ═══════════════════════════════════════
  // 8. CSS classes
  // ═══════════════════════════════════════
  console.log('%c 8. CSS Classes ', 'font-weight:bold;color:#f59e0b');

  assert('CSS has .rec-dna-hints', cssSrc.includes('.rec-dna-hints'));
  assert('CSS has .rec-dna-row', cssSrc.includes('.rec-dna-row'));
  assert('CSS has .rec-dna-avoid', cssSrc.includes('.rec-dna-avoid'));
  assert('CSS has .rec-dna-ref', cssSrc.includes('.rec-dna-ref'));
  assert('CSS has .ctx-tip-avoid', cssSrc.includes('.ctx-tip-avoid'));
  assert('CSS has .ctx-tips-badge', cssSrc.includes('.ctx-tips-badge'));

  // Verify CSS is loaded in the page
  let hasDnaHintsCss = false;
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.selectorText && rule.selectorText.includes('.rec-dna-hints')) { hasDnaHintsCss = true; break; }
        }
      } catch(e) { /* cross-origin */ }
      if (hasDnaHintsCss) break;
    }
  } catch(e) {}
  assert('CSS .rec-dna-hints rule loaded in page', hasDnaHintsCss);

  // ═══════════════════════════════════════
  // 9. Coverage — all hint target slots exist in catalog
  // ═══════════════════════════════════════
  console.log('%c 9. Slot Coverage ', 'font-weight:bold;color:#f59e0b');

  let allSlotsExist = true;
  const missingSlots = new Set();
  for (const [rsid, entry] of Object.entries(snpData)) {
    if (rsid.startsWith('_') || !entry.snpHints) continue;
    for (const [, hint] of Object.entries(entry.snpHints)) {
      if (!catalogData.slots[hint.slotKey]) {
        allSlotsExist = false;
        missingSlots.add(hint.slotKey);
      }
    }
  }
  assert('All snpHint slotKeys exist in catalog', allSlotsExist, missingSlots.size ? `Missing: ${[...missingSlots].join(', ')}` : '');

  // ═══════════════════════════════════════
  // 10. Direction coverage
  // ═══════════════════════════════════════
  console.log('%c 10. Direction Coverage ', 'font-weight:bold;color:#f59e0b');

  const directions = new Set();
  for (const [rsid, entry] of Object.entries(snpData)) {
    if (rsid.startsWith('_') || !entry.snpHints) continue;
    for (const hint of Object.values(entry.snpHints)) directions.add(hint.direction);
  }
  assert('Has "form" direction hints', directions.has('form'));
  assert('Has "avoid" direction hints', directions.has('avoid'));
  assert('Has "increase" direction hints', directions.has('increase'));

  // Check HFE has avoid hints
  const hfeC282Y = snpData.rs1800562;
  assert('HFE C282Y has avoid hints', hfeC282Y?.snpHints?.AA?.direction === 'avoid');
  assert('HFE C282Y avoid targets iron.ferritin', hfeC282Y?.snpHints?.AA?.slotKey === 'iron.ferritin');

  // Check MTHFR has form hints
  const mthfr = snpData.rs1801133;
  assert('MTHFR C677T has form hints', mthfr?.snpHints?.AA?.direction === 'form');
  assert('MTHFR C677T targets coagulation.homocysteine', mthfr?.snpHints?.AA?.slotKey === 'coagulation.homocysteine');

  // Check TMPRSS6 has increase hints
  const tmprss6 = snpData.rs855791;
  assert('TMPRSS6 has increase hints', tmprss6?.snpHints?.AA?.direction === 'increase');

  // ═══════════════════════════════════════
  // 11. No render signature changes
  // ═══════════════════════════════════════
  console.log('%c 11. API Compatibility ', 'font-weight:bold;color:#f59e0b');

  assert('renderRecommendationSection still async', recSrc.includes('export async function renderRecommendationSection'));
  assert('renderRecommendationSectionSync still sync', recSrc.includes('export function renderRecommendationSectionSync'));
  assert('_renderRecSection signature unchanged (slotKey, opts)', /function _renderRecSection\(slotKey, opts/.test(recSrc));

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
  console.log(`\n%c Results: ${pass} passed, ${fail} failed `, `background:${fail?'#ef4444':'#22c55e'};color:#fff;font-size:14px;padding:4px 12px;border-radius:4px`);
})();
