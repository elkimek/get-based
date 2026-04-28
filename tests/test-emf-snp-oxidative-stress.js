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

  // The four new SNPs
  const newRsids = ['rs1695', 'rs4880', 'rs1001179', 'rs1800566'];
  for (const rsid of newRsids) {
    assert(`${rsid} present`, !!snpTable[rsid], snpTable[rsid] ? snpTable[rsid].gene : 'missing');
    assert(`${rsid} category=oxidativeStress`, snpTable[rsid]?.category === 'oxidativeStress');
    assert(`${rsid} contextCards includes environment`, (snpTable[rsid]?.contextCards || []).includes('environment'));
    assert(`${rsid} has at least one PubMed reference`, (snpTable[rsid]?.references || []).some(r => /pubmed\.ncbi\.nlm\.nih\.gov/.test(r)));
    assert(`${rsid} is tier2-mechanistic (no Tier-1 SNPs in our table)`, snpTable[rsid]?.evidenceTier === 'tier2-mechanistic');
    assert(`${rsid} has all three genotypes`, Object.keys(snpTable[rsid]?.genotypes || {}).length >= 3);
  }

  // PMID sanity — these are the canonical functional papers we cite. If any of these
  // change, re-verify against PubMed (we previously shipped four hallucinated PMIDs).
  // GSTP1 → Hu 1998 (PMID 9525277) functional, not De Luca, because De Luca 2014 found NO GSTP1 association.
  assert('GSTP1 cites Hu 1998 (PMID 9525277)', (snpTable.rs1695?.references || []).some(r => r.includes('9525277')));
  // GSTP1 GG note must explicitly say De Luca found NO association at this SNP — this
  // is the correction that prevents the previous false "Tier 1 direct evidence" claim.
  assert('GSTP1 GG note states De Luca found NO association at this SNP', /found NO significant association|not from this SNP/i.test(snpTable.rs1695?.genotypes?.GG?.note || ''));
  // SOD2 → Sutton 2003 PMID 12618592
  assert('SOD2 cites Sutton 2003 (PMID 12618592)', (snpTable.rs4880?.references || []).some(r => r.includes('12618592')));
  // CAT → Forsberg 2001 PMID 11182520
  assert('CAT cites Forsberg 2001 (PMID 11182520)', (snpTable.rs1001179?.references || []).some(r => r.includes('11182520')));
  // NQO1 → Siegel 2001 PMID 11160862
  assert('NQO1 cites Siegel 2001 (PMID 11160862)', (snpTable.rs1800566?.references || []).some(r => r.includes('11160862')));

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
