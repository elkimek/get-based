// test-emf-snp-oxidative-stress.js — Oxidative-stress SNP category + EMF assessment surface
// Run: fetch('tests/test-emf-snp-oxidative-stress.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c EMF Oxidative-Stress SNP Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ═══════════════════════════════════════
  // 1. SNP table loads with new entries
  // ═══════════════════════════════════════
  console.log('%c 1. SNP table additions ', 'font-weight:bold;color:#f59e0b');

  const snpTable = await fetch('data/snp-health.json').then(r => r.json());

  assert('oxidativeStress in _meta categories', snpTable._meta.categories.includes('oxidativeStress'));
  assert('snpCount matches entries', snpTable._meta.snpCount === Object.keys(snpTable).filter(k => k.startsWith('rs')).length);
  assert('De Luca cited in _meta sources', snpTable._meta.sources.some(s => /De Luca/i.test(s)));
  assert('oxidativeStressNote present', typeof snpTable._meta.oxidativeStressNote === 'string' && snpTable._meta.oxidativeStressNote.length > 100);

  // The 3 strong-evidence oxidativeStress SNPs (curated bar: replicated functional effect)
  const oxidativeRsids = ['rs1800566', 'rs662', 'rs1799895'];
  for (const rsid of oxidativeRsids) {
    assert(`${rsid} present`, !!snpTable[rsid], snpTable[rsid] ? snpTable[rsid].gene : 'missing');
    assert(`${rsid} category=oxidativeStress`, snpTable[rsid]?.category === 'oxidativeStress');
    assert(`${rsid} contextCards includes environment`, (snpTable[rsid]?.contextCards || []).includes('environment'));
    assert(`${rsid} has at least one PubMed reference`, (snpTable[rsid]?.references || []).some(r => /pubmed\.ncbi\.nlm\.nih\.gov/.test(r)));
    assert(`${rsid} is tier2-mechanistic (no Tier-1 SNPs in our table)`, snpTable[rsid]?.evidenceTier === 'tier2-mechanistic');
    assert(`${rsid} has all three genotypes`, Object.keys(snpTable[rsid]?.genotypes || {}).length >= 3);
  }

  // The 5 weaker SNPs we previously had must be GONE (we curated to strong evidence only)
  const weakDropped = ['rs1695', 'rs4880', 'rs1001179', 'rs1050450', 'rs6721961'];
  for (const rsid of weakDropped) {
    assert(`${rsid} removed (weak evidence — GSTP1/SOD2/CAT/GPX1/NFE2L2 dropped)`, !snpTable[rsid]);
  }

  // PMID sanity — these are the canonical functional papers we cite. If any of these
  // change, re-verify against PubMed (we previously shipped four hallucinated PMIDs).
  // NQO1 → Siegel 2001 PMID 11160862
  assert('NQO1 cites Siegel 2001 (PMID 11160862)', (snpTable.rs1800566?.references || []).some(r => r.includes('11160862')));
  // PON1 → Humbert 1993 PMID 8098250
  assert('PON1 cites Humbert 1993 (PMID 8098250)', (snpTable.rs662?.references || []).some(r => r.includes('8098250')));
  // SOD3 → Bowler 2014 PMID 25085920
  assert('SOD3 cites Bowler 2014 (PMID 25085920)', (snpTable.rs1799895?.references || []).some(r => r.includes('25085920')));

  // envHints — at-risk genotypes for PON1 (Q/Q) and NQO1 (T/T) surface in Environment
  // Tips modal with environment-specific advice (no supplement push, just exposure context)
  assert('PON1 has envHint for AA (Q/Q)', !!snpTable.rs662?.envHints?.AA);
  assert('PON1 envHint AA mentions organophosphate / pesticide', /organophosphate|pesticid/i.test(snpTable.rs662?.envHints?.AA?.text || ''));
  assert('NQO1 has envHint for TT', !!snpTable.rs1800566?.envHints?.TT);
  assert('NQO1 envHint TT mentions benzene / smoke / exhaust', /benzene|smoke|exhaust/i.test(snpTable.rs1800566?.envHints?.TT?.text || ''));
  // recommendations.js must have been extended to consume envHints
  const recsSrc = await fetch('js/recommendations.js').then(r => r.text());
  assert('recommendations.js consumes envHints alongside snpHints', /entry\.envHints/.test(recsSrc));

  // Negative assertions — make sure the previous hallucinated PMIDs are gone everywhere
  const allRefs = JSON.stringify(snpTable);
  assert('No hallucinated PMID 11139325 (hot beverages)', !allRefs.includes('11139325'));
  assert('No hallucinated PMID 12618601 (burn-trauma biomarkers)', !allRefs.includes('12618601'));
  assert('No hallucinated PMID 9425228 (p16/CDK4 melanoma)', !allRefs.includes('9425228'));
  assert('No hallucinated PMID 24812624 (resveratrol/PTEN)', !allRefs.includes('24812624'));
  assert('De Luca 2014 _meta cite uses correct PMID 24812443', /24812443/.test(snpTable._meta?.oxidativeStressNote || '') || (snpTable._meta?.sources || []).some(s => s.includes('24812443')));

  // ═══════════════════════════════════════
  // 2. Existing SNPs cross-linked to environment
  // ═══════════════════════════════════════
  console.log('%c 2. Environment context cross-links ', 'font-weight:bold;color:#f59e0b');

  assert('MTHFR rs1801133 links to environment', (snpTable.rs1801133?.contextCards || []).includes('environment'));
  assert('MTHFR rs1801133 still links to diet', (snpTable.rs1801133?.contextCards || []).includes('diet'));
  assert('HFE C282Y rs1800562 links to environment', (snpTable.rs1800562?.contextCards || []).includes('environment'));
  assert('HFE H63D rs1799945 links to environment', (snpTable.rs1799945?.contextCards || []).includes('environment'));

  // ═══════════════════════════════════════
  // 3. dna.js category label includes oxidativeStress
  // ═══════════════════════════════════════
  console.log('%c 3. Category label registered ', 'font-weight:bold;color:#f59e0b');

  const dnaSrc = await fetch('js/dna.js').then(r => r.text());
  assert('catLabels contains oxidativeStress', /oxidativeStress\s*:\s*'Oxidative Stress'/.test(dnaSrc));

  // ═══════════════════════════════════════
  // 4. emf.js renders the oxidative-stress panel
  // ═══════════════════════════════════════
  console.log('%c 4. EMF oxidative-stress panel wiring ', 'font-weight:bold;color:#f59e0b');

  const emfSrc = await fetch('js/emf.js').then(r => r.text());
  assert('emf.js defines getOxidativeStressFindings', /function\s+getOxidativeStressFindings\s*\(/.test(emfSrc));
  assert('emf.js defines renderOxidativeStressPanel', /function\s+renderOxidativeStressPanel\s*\(/.test(emfSrc));
  assert('emf.js wires panel into renderAssessmentDetail', emfSrc.includes('renderOxidativeStressPanel(a)'));
  assert('emf.js gates panel on yellow+ severity', /worst\.color\s*===\s*['"]green['"]/.test(emfSrc));
  assert('emf.js cites correct De Luca PMID 24812443', emfSrc.includes('24812443'));
  assert('emf.js does NOT cite hallucinated De Luca PMID', !emfSrc.includes('24812624'));
  assert('emf.js cites Yakymenko PubMed link', emfSrc.includes('26151230'));
  assert('emf.js disclaimer rejects "EMF susceptibility" framing', /not EMF-specific predictions/i.test(emfSrc));
  assert('emf.js disclaimer clarifies De Luca finding was GSTM1+GSTT1 deletions, not surfaced SNPs', /GSTM1\+GSTT1|not for any SNP shown above/i.test(emfSrc));

  // emf.js wires genetics into the EMF AI interpretation prompt
  assert('emf.js defines buildOxidativeStressPromptBlock', /function\s+buildOxidativeStressPromptBlock\s*\(/.test(emfSrc));
  assert('emf.js appends genetics block to single-assessment interpretation prompt', /\$\{data\}\$\{buildOxidativeStressPromptBlock\(\)\}/.test(emfSrc));
  assert('emf.js appends genetics block to comparison interpretation prompt', /\$\{after\}\$\{buildOxidativeStressPromptBlock\(\)\}/.test(emfSrc));
  assert('EMF_SYSTEM tells the AI not to claim genotype causes EHS', /no validated genetic test for EHS|do NOT claim any genotype causes/i.test(emfSrc));
  assert('EMF_SYSTEM tells the AI not to push supplements from genotype', /Do NOT make supplement recommendations from genotype/i.test(emfSrc));

  // Sanity: the 3 strong-evidence SNPs we kept have at least one genotype with
  // effect: 'significant' or 'moderate' so they actually surface in the panel
  // (the panel filters out 'effect: none').
  for (const rsid of oxidativeRsids) {
    const hasNonNoneEffect = Object.values(snpTable[rsid]?.genotypes || {}).some(g => g.effect && g.effect !== 'none');
    assert(`${rsid} has at least one non-'none' effect genotype`, hasNonNoneEffect);
  }

  // ═══════════════════════════════════════
  // 6. Behavioral tests — invoke the helpers with realistic state and
  //    verify the rendered output (not just that the source compiles).
  // ═══════════════════════════════════════
  console.log('%c 6. Behavioral — render output ', 'font-weight:bold;color:#f59e0b');

  // Module under test exposes its internals via the _internal object for tests
  const emfMod = await import('../js/emf.js');
  const stateMod = await import('../js/state.js');
  assert('emf.js exposes _internal test surface', !!emfMod._internal && typeof emfMod._internal.renderOxidativeStressPanel === 'function');

  // Snapshot any pre-existing state so we can restore it after each scenario
  const savedGenetics = stateMod.state.importedData?.genetics;
  const savedSnpCache = window._snpTableCache;
  if (!stateMod.state.importedData) stateMod.state.importedData = {};
  window._snpTableCache = snpTable;

  // Helper: mock a single-room assessment with a measurement at the given severity.
  // rfMicrowave thresholds (sleeping room, SBM-2015): 0.1 µW/m² green, 10 µW/m² yellow,
  // 1000 µW/m² orange, 10000 µW/m² red.
  function makeAssessment(rfValue) {
    return { id: 'test_emf', date: '2026-04-28', label: 'test', rooms: [{ name: 'Bedroom', sleeping: true, measurements: { rfMicrowave: { value: rfValue, unit: 'uW/m2' } } }] };
  }

  // ── Scenario 1: PON1 Q/Q + NQO1 Ser/Ser + yellow assessment → both surface in panel
  stateMod.state.importedData.genetics = {
    snps: {
      rs662: { genotype: 'AA', gene: 'PON1', variant: 'Q192R' },
      rs1800566: { genotype: 'TT', gene: 'NQO1', variant: 'Pro187Ser (C609T)' }
    }
  };
  const html_yellow = emfMod._internal.renderOxidativeStressPanel(makeAssessment(50));
  assert('Yellow assessment + PON1 AA renders panel containing PON1', /PON1/.test(html_yellow));
  assert('Yellow assessment + NQO1 TT renders panel containing NQO1', /NQO1/.test(html_yellow));
  assert('Panel contains the disclaimer link to De Luca PMID 24812443', /24812443/.test(html_yellow));
  assert('Panel cites Yakymenko PMID 26151230', /26151230/.test(html_yellow));
  assert('Panel uses honest "pathway" tier badge (not "direct")', /pathway/.test(html_yellow) && !/emf-gen-tier-direct/.test(html_yellow));

  // ── Scenario 2: green-only assessment → panel hidden
  const html_green = emfMod._internal.renderOxidativeStressPanel(makeAssessment(0.05));
  assert('Green-only assessment hides the panel', html_green === '');

  // ── Scenario 3: no DNA imported → panel hidden + prompt block empty
  stateMod.state.importedData.genetics = null;
  const html_noDna = emfMod._internal.renderOxidativeStressPanel(makeAssessment(50));
  assert('No DNA imported → panel hidden', html_noDna === '');
  const prompt_noDna = emfMod._internal.buildOxidativeStressPromptBlock();
  assert('No DNA imported → prompt block is empty string', prompt_noDna === '');

  // ── Scenario 4: DNA imported but no oxidativeStress findings (e.g. only methylation SNPs) → hidden
  stateMod.state.importedData.genetics = {
    snps: { rs1801133: { genotype: 'AA', gene: 'MTHFR', variant: 'C677T' } }
  };
  const html_noOxStress = emfMod._internal.renderOxidativeStressPanel(makeAssessment(50));
  assert('DNA imported but no oxidativeStress findings → panel hidden', html_noOxStress === '');

  // ── Scenario 5: DNA + findings → AI prompt block includes the genetics
  stateMod.state.importedData.genetics = {
    snps: { rs662: { genotype: 'AA', gene: 'PON1', variant: 'Q192R' } }
  };
  const prompt_withGenetics = emfMod._internal.buildOxidativeStressPromptBlock();
  assert('Prompt block includes PON1 gene name', prompt_withGenetics.includes('PON1'));
  assert('Prompt block includes the genotype', prompt_withGenetics.includes('AA'));
  assert('Prompt block includes the EHS guardrail', /DO NOT frame any genotype as causing or predicting EHS/i.test(prompt_withGenetics));
  assert('Prompt block includes Yakymenko reference', /Yakymenko/i.test(prompt_withGenetics));

  // ── Scenario 6: getOxidativeStressFindings sorts by effect severity
  stateMod.state.importedData.genetics = {
    snps: {
      rs662: { genotype: 'AG', gene: 'PON1', variant: 'Q192R' },        // mild
      rs1800566: { genotype: 'TT', gene: 'NQO1', variant: 'Pro187Ser' } // significant
    }
  };
  const findings = emfMod._internal.getOxidativeStressFindings();
  assert('Findings sorted by severity (significant before mild)', findings.length === 2 && findings[0].effect === 'significant' && findings[1].effect === 'mild');

  // ── Scenario 7: 'none' effect genotypes filtered out of findings + panel
  stateMod.state.importedData.genetics = {
    snps: { rs1799895: { genotype: 'CC', gene: 'SOD3', variant: 'R213G' } } // CC is "none" for SOD3
  };
  const findings_none = emfMod._internal.getOxidativeStressFindings();
  assert("Effect='none' genotypes are filtered out of findings", findings_none.length === 0);
  const html_none = emfMod._internal.renderOxidativeStressPanel(makeAssessment(50));
  assert("Effect='none'-only DNA → panel hidden", html_none === '');

  // ── Scenario 8: Strand-flip — user's stored genotype is "GA" but table is keyed "AG"
  stateMod.state.importedData.genetics = {
    snps: { rs662: { genotype: 'GA', gene: 'PON1', variant: 'Q192R' } }
  };
  const findings_flip = emfMod._internal.getOxidativeStressFindings();
  assert('Strand-flipped genotype (GA→AG) still resolves to a finding', findings_flip.length === 1);

  // ═══════════════════════════════════════
  // 7. End-to-end — Environment card Tips modal renders envHints
  //    Exercises the actual renderCardTipsModal path that the user hits
  //    when clicking the 💡 lightbulb badge on the Environment card.
  // ═══════════════════════════════════════
  console.log('%c 7. End-to-end — Environment Tips modal ', 'font-weight:bold;color:#f59e0b');

  const recsMod = await import('../js/recommendations.js');
  await recsMod.loadCatalog();
  // Product recs default-on (isProductRecsEnabled() returns true unless explicitly 'false').
  // No need to flip the toggle.

  // Scenario A: PON1 Q/Q + NQO1 Ser/Ser → both envHints surface in Environment Tips
  stateMod.state.importedData.genetics = {
    snps: {
      rs662: { genotype: 'AA', gene: 'PON1', variant: 'Q192R' },
      rs1800566: { genotype: 'TT', gene: 'NQO1', variant: 'Pro187Ser (C609T)' }
    }
  };
  const envTips = recsMod.renderCardTipsModal('environment');
  assert('Env Tips: PON1 surfaces', /PON1/.test(envTips));
  assert('Env Tips: NQO1 surfaces', /NQO1/.test(envTips));
  assert('Env Tips: PON1 envHint mentions organophosphate / pesticide', /organophosphate|pesticid/i.test(envTips));
  assert('Env Tips: NQO1 envHint mentions benzene / smoke / exhaust', /benzene|smoke|exhaust/i.test(envTips));
  // Avoidance hints render with the warning icon class
  assert('Env Tips: avoidance hints use ctx-tip-avoid class', /ctx-tip-avoid/.test(envTips));

  // Scenario B: PON1 Q/R (heterozygous, no envHint) → does NOT surface in Env Tips
  stateMod.state.importedData.genetics = {
    snps: { rs662: { genotype: 'AG', gene: 'PON1', variant: 'Q192R' } }
  };
  const envTips_het = recsMod.renderCardTipsModal('environment');
  assert('Env Tips: PON1 Q/R (no envHint) does NOT surface PON1 in Your Genetics section', !/PON1.*Q\/R|PON1.*AG/.test(envTips_het));

  // Scenario C: SOD3 R/G — no envHint defined → does NOT surface in Env Tips
  // (intentional: tissue-localization, no clean environment-specific advice)
  stateMod.state.importedData.genetics = {
    snps: { rs1799895: { genotype: 'CG', gene: 'SOD3', variant: 'R213G' } }
  };
  const envTips_sod3 = recsMod.renderCardTipsModal('environment');
  assert('Env Tips: SOD3 (no envHint, deliberately) does NOT surface', !/SOD3/.test(envTips_sod3));

  // Scenario D: existing MTHFR C677T (TT) cross-link to environment surfaces in Env Tips
  stateMod.state.importedData.genetics = {
    snps: { rs1801133: { genotype: 'AA', gene: 'MTHFR', variant: 'C677T' } }
  };
  const envTips_mthfr = recsMod.renderCardTipsModal('environment');
  assert('Env Tips: MTHFR cross-link surfaces (existing snpHint + new contextCards entry)', /MTHFR/.test(envTips_mthfr));

  // ═══════════════════════════════════════
  // 8. End-to-end parser — synthetic DNA file feeds the whole pipeline
  //    Verifies the test fixture data/test-dna-oxidative-stress.txt
  //    parses through the real Ancestry parser → produces the genotypes
  //    we expect → render functions then surface the right hints.
  //    This is the closest we get to "drop the file in the app and click around"
  //    without needing Puppeteer DOM interactions.
  // ═══════════════════════════════════════
  console.log('%c 8. End-to-end — synthetic DNA fixture pipeline ', 'font-weight:bold;color:#f59e0b');

  const dnaMod = await import('../js/dna.js');
  const fixtureText = await fetch('data/test-dna-oxidative-stress.txt').then(r => r.text());
  // The parser expects a File-like object, so wrap the fixture text in a Blob
  const fixtureBlob = new File([fixtureText], 'test-dna-oxidative-stress.txt', { type: 'text/plain' });
  const parseResult = await dnaMod.parseDNAFile(fixtureBlob);
  assert('Synthetic DNA file detected as ancestry format', parseResult.source === 'AncestryDNA');
  assert('Parser found rs662 (PON1)', !!parseResult.matches?.rs662, parseResult.matches?.rs662?.genotype);
  assert('Parser found rs1800566 (NQO1)', !!parseResult.matches?.rs1800566);
  assert('Parser found rs1799895 (SOD3)', !!parseResult.matches?.rs1799895);
  assert('Parser found rs1801133 (MTHFR)', !!parseResult.matches?.rs1801133);
  assert('Parser found rs1800562 (HFE C282Y)', !!parseResult.matches?.rs1800562);
  assert('PON1 genotype is AA (Q/Q)', parseResult.matches?.rs662?.genotype === 'AA');
  assert('NQO1 genotype is TT (Ser/Ser)', parseResult.matches?.rs1800566?.genotype === 'TT');

  // Wire the parsed result into state and verify the full render pipeline produces
  // the right HTML — same path as if a user dropped the fixture into the app.
  stateMod.state.importedData.genetics = { snps: parseResult.matches, source: 'AncestryDNA (test fixture)' };
  const e2e_emfPanel = emfMod._internal.renderOxidativeStressPanel(makeAssessment(50));
  assert('E2E: EMF panel surfaces PON1 from fixture', /PON1/.test(e2e_emfPanel));
  assert('E2E: EMF panel surfaces NQO1 from fixture', /NQO1/.test(e2e_emfPanel));
  assert('E2E: EMF panel surfaces SOD3 from fixture', /SOD3/.test(e2e_emfPanel));
  const e2e_envTips = recsMod.renderCardTipsModal('environment');
  assert('E2E: Env Tips surface PON1 envHint from fixture', /PON1/.test(e2e_envTips) && /pesticid|organophosphate/i.test(e2e_envTips));
  assert('E2E: Env Tips surface NQO1 envHint from fixture', /NQO1/.test(e2e_envTips) && /benzene|smoke/i.test(e2e_envTips));
  assert('E2E: Env Tips surface MTHFR cross-link from fixture', /MTHFR/.test(e2e_envTips));
  assert('E2E: Env Tips surface HFE C282Y cross-link from fixture', /HFE/.test(e2e_envTips));
  assert('E2E: Env Tips do NOT surface SOD3 (no envHint, deliberately)', !/SOD3/.test(e2e_envTips));
  const e2e_aiPrompt = emfMod._internal.buildOxidativeStressPromptBlock();
  assert('E2E: EMF AI prompt includes all 3 oxidativeStress findings from fixture', /PON1/.test(e2e_aiPrompt) && /NQO1/.test(e2e_aiPrompt) && /SOD3/.test(e2e_aiPrompt));

  // Restore state we mutated
  stateMod.state.importedData.genetics = savedGenetics;
  window._snpTableCache = savedSnpCache;

  // ═══════════════════════════════════════
  // 5. CSS styles registered
  // ═══════════════════════════════════════
  console.log('%c 5. CSS styles ', 'font-weight:bold;color:#f59e0b');

  const cssSrc = await fetch('styles.css').then(r => r.text());
  assert('emf-genetics-panel style present', cssSrc.includes('.emf-genetics-panel'));
  assert('emf-gen-tier-mech style present', cssSrc.includes('.emf-gen-tier-mech'));
  assert('emf-genetics-disclaimer style present', cssSrc.includes('.emf-genetics-disclaimer'));

  // ═══════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════
  const total = pass + fail;
  if (fail > 0) {
    console.log(`%c ${pass}/${total} passed, ${fail} failed `, 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px;font-weight:bold');
  } else {
    console.log(`%c ${pass}/${total} passed `, 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px;font-weight:bold');
  }

  return { pass, fail, total };
})();
