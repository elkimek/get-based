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
    assert(`${rsid} has evidenceTier`, snpTable[rsid]?.evidenceTier === 'tier1-direct' || snpTable[rsid]?.evidenceTier === 'tier2-mechanistic');
    assert(`${rsid} has all three genotypes`, Object.keys(snpTable[rsid]?.genotypes || {}).length >= 3);
  }

  // GSTP1 specifically must cite De Luca 2014 (it is the only direct EHS study)
  assert('GSTP1 (rs1695) is tier1-direct', snpTable.rs1695?.evidenceTier === 'tier1-direct');
  assert('GSTP1 cites De Luca 2014', (snpTable.rs1695?.references || []).some(r => r.includes('24812624')));
  assert('GSTP1 GG (homozygous) note mentions De Luca', /De Luca/i.test(snpTable.rs1695?.genotypes?.GG?.note || ''));

  // SOD2 / CAT / NQO1 must be flagged as mechanistic
  assert('SOD2 (rs4880) is tier2-mechanistic', snpTable.rs4880?.evidenceTier === 'tier2-mechanistic');
  assert('CAT (rs1001179) is tier2-mechanistic', snpTable.rs1001179?.evidenceTier === 'tier2-mechanistic');
  assert('NQO1 (rs1800566) is tier2-mechanistic', snpTable.rs1800566?.evidenceTier === 'tier2-mechanistic');

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
  assert('emf.js cites De Luca PubMed link', emfSrc.includes('24812624'));
  assert('emf.js cites Yakymenko PubMed link', emfSrc.includes('26151230'));
  assert('emf.js disclaimer rejects "EMF susceptibility" framing', /not EMF-specific predictions/i.test(emfSrc));

  // ═══════════════════════════════════════
  // 5. CSS styles registered
  // ═══════════════════════════════════════
  console.log('%c 5. CSS styles ', 'font-weight:bold;color:#f59e0b');

  const cssSrc = await fetch('styles.css').then(r => r.text());
  assert('emf-genetics-panel style present', cssSrc.includes('.emf-genetics-panel'));
  assert('emf-gen-tier-direct style present', cssSrc.includes('.emf-gen-tier-direct'));
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
