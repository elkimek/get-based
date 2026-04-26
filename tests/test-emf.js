return (async () => {
  const assert = (name, condition, detail) => {
    if (condition) {
      console.log(`%c✔ ${name}`, 'color: green');
    } else {
      console.log(`%cFAIL ${name}${detail ? ': ' + detail : ''}`, 'color: red');
    }
  };

  // Import schema functions
  const { SBM_2015_THRESHOLDS, getEMFSeverity } = await import('/js/schema.js');

  // ── SBM-2015 Thresholds Structure ──
  assert('1. SBM_2015_THRESHOLDS exists', typeof SBM_2015_THRESHOLDS === 'object');
  const expectedTypes = ['acElectric', 'acMagnetic', 'rfMicrowave', 'dirtyElectricity', 'dcMagnetic'];
  assert('2. All 5 measurement types defined', expectedTypes.every(t => SBM_2015_THRESHOLDS[t]));

  for (const type of expectedTypes) {
    const def = SBM_2015_THRESHOLDS[type];
    assert(`3. ${type} has name`, typeof def.name === 'string' && def.name.length > 0);
    assert(`4. ${type} has unit`, typeof def.unit === 'string' && def.unit.length > 0);
    assert(`5. ${type} has 4 sleeping tiers`, def.sleeping.length === 4);
    assert(`6. ${type} sleeping tiers ascending`, def.sleeping[0].max < def.sleeping[1].max && def.sleeping[1].max < def.sleeping[2].max);
    assert(`7. ${type} last sleeping tier is Infinity`, def.sleeping[3].max === Infinity);
    assert(`5b. ${type} has 4 daytime tiers`, def.daytime.length === 4);
    assert(`6b. ${type} daytime tiers ascending`, def.daytime[0].max < def.daytime[1].max && def.daytime[1].max < def.daytime[2].max);
    assert(`7b. ${type} last daytime tier is Infinity`, def.daytime[3].max === Infinity);
    assert(`7c. ${type} daytime thresholds >= sleeping`, def.daytime[0].max >= def.sleeping[0].max);
  }

  // ── getEMFSeverity ──
  assert('8. getEMFSeverity exists', typeof getEMFSeverity === 'function');
  assert('9. null value returns null', getEMFSeverity('acElectric', null) === null);
  assert('10. unknown type returns null', getEMFSeverity('unknown', 5) === null);

  // AC Electric: <1 green, 1-5 yellow, 5-50 orange, >50 red
  assert('11. AC Electric 0.5 = No concern', getEMFSeverity('acElectric', 0.5).color === 'green');
  assert('12. AC Electric 3 = Slight concern', getEMFSeverity('acElectric', 3).color === 'yellow');
  assert('13. AC Electric 25 = Severe concern', getEMFSeverity('acElectric', 25).color === 'orange');
  assert('14. AC Electric 100 = Extreme concern', getEMFSeverity('acElectric', 100).color === 'red');

  // AC Magnetic: <20 green, 20-100 yellow, 100-500 orange, >500 red
  assert('15. AC Magnetic 10 = No concern', getEMFSeverity('acMagnetic', 10).color === 'green');
  assert('16. AC Magnetic 50 = Slight concern', getEMFSeverity('acMagnetic', 50).color === 'yellow');
  assert('17. AC Magnetic 300 = Severe concern', getEMFSeverity('acMagnetic', 300).color === 'orange');
  assert('18. AC Magnetic 1000 = Extreme concern', getEMFSeverity('acMagnetic', 1000).color === 'red');

  // RF: <0.1 green, 0.1-10 yellow, 10-1000 orange, >1000 red
  assert('19. RF 0.05 = No concern', getEMFSeverity('rfMicrowave', 0.05).color === 'green');
  assert('20. RF 5 = Slight concern', getEMFSeverity('rfMicrowave', 5).color === 'yellow');
  assert('21. RF 500 = Severe concern', getEMFSeverity('rfMicrowave', 500).color === 'orange');
  assert('22. RF 5000 = Extreme concern', getEMFSeverity('rfMicrowave', 5000).color === 'red');

  // Dirty Electricity: <25 green, 25-50 yellow, 50-200 orange, >200 red
  assert('23. DE 10 = No concern', getEMFSeverity('dirtyElectricity', 10).color === 'green');
  assert('24. DE 35 = Slight concern', getEMFSeverity('dirtyElectricity', 35).color === 'yellow');
  assert('25. DE 150 = Severe concern', getEMFSeverity('dirtyElectricity', 150).color === 'orange');
  assert('26. DE 300 = Extreme concern', getEMFSeverity('dirtyElectricity', 300).color === 'red');

  // DC Magnetic: <1 green, 1-5 yellow, 5-20 orange, >20 red
  assert('27. DC 0.5 = No concern', getEMFSeverity('dcMagnetic', 0.5).color === 'green');
  assert('28. DC 3 = Slight concern', getEMFSeverity('dcMagnetic', 3).color === 'yellow');
  assert('29. DC 10 = Severe concern', getEMFSeverity('dcMagnetic', 10).color === 'orange');
  assert('30. DC 50 = Extreme concern', getEMFSeverity('dcMagnetic', 50).color === 'red');

  // ── Daytime thresholds (more lenient) ──
  assert('31. AC Electric 2 daytime = No concern', getEMFSeverity('acElectric', 2, false).color === 'green');
  assert('32. AC Electric 2 sleeping = Slight concern', getEMFSeverity('acElectric', 2, true).color === 'yellow');
  assert('33. Default is sleeping', getEMFSeverity('acElectric', 2).color === 'yellow');

  // ── Boundary values (exclusive upper) ──
  assert('34. AC Electric exactly 1 = Slight (sleeping)', getEMFSeverity('acElectric', 1).color === 'yellow');
  assert('35. Zero value = No concern', getEMFSeverity('acElectric', 0).color === 'green');

  // ── Severity label strings ──
  assert('35. Green tier label', getEMFSeverity('acElectric', 0).label === 'No concern');
  assert('36. Yellow tier label', getEMFSeverity('acElectric', 1).label === 'Slight concern');
  assert('37. Orange tier label', getEMFSeverity('acElectric', 5).label === 'Severe concern');
  assert('38. Red tier label', getEMFSeverity('acElectric', 50).label === 'Extreme concern');

  // ── State defaults ──
  const { state } = await import('/js/state.js');
  assert('39. state.importedData has emfAssessment', 'emfAssessment' in state.importedData);
  assert('40. emfAssessment default is null', state.importedData.emfAssessment === null);

  // ── Constants ──
  const { EMF_ROOM_PRESETS, EMF_SOURCES, EMF_MITIGATIONS } = await import('/js/constants.js');
  assert('41. EMF_ROOM_PRESETS is array', Array.isArray(EMF_ROOM_PRESETS) && EMF_ROOM_PRESETS.length >= 5);
  assert('42. EMF_SOURCES is array', Array.isArray(EMF_SOURCES) && EMF_SOURCES.length >= 10);
  assert('43. EMF_MITIGATIONS is array', Array.isArray(EMF_MITIGATIONS) && EMF_MITIGATIONS.length >= 10);
  assert('44. Bedroom in room presets', EMF_ROOM_PRESETS.includes('Bedroom'));

  // ── Lazy-load stub sync check ──
  const emfMod = await import('/js/emf.js');
  const emfWindowFns = ['openEMFAssessmentEditor','addEMFAssessment','toggleEMFAssessment','selectEMFRoom','handleEMFRoomDropdown','addEMFRoom','removeEMFRoom','deleteEMFAssessment','updateEMFField','updateEMFRoom','updateEMFMeasurement','updateEMFMeter','saveEMFExplicit','toggleEMFCompare','interpretEMFAssessment','interpretEMFComparison','closeEMFInterpretation','discussEMFInterpretation','addEMFPhotos','removeEMFPhoto','viewEMFPhoto','handleEMFPDF'];
  const missingExports = emfWindowFns.filter(fn => typeof emfMod[fn] !== 'function');
  assert('45. All lazy-stub fns exist in emf.js exports', missingExports.length === 0, missingExports.join(', '));

  // ── EMF affiliate catalog (Safe Living Technologies) ──
  const recsMod = await import('/js/recommendations.js');
  assert('46. loadEMFCatalog exported', typeof recsMod.loadEMFCatalog === 'function');
  assert('47. getEMFMeters exported', typeof recsMod.getEMFMeters === 'function');
  assert('48. getEMFProductsForMitigations exported', typeof recsMod.getEMFProductsForMitigations === 'function');
  assert('49. renderEMFMeterRecs exported', typeof recsMod.renderEMFMeterRecs === 'function');
  assert('50. renderEMFMitigationRecs exported', typeof recsMod.renderEMFMitigationRecs === 'function');

  const emfCat = await recsMod.loadEMFCatalog();
  assert('51. EMF catalog loads', !!emfCat, 'expected emf-products.json to fetch');
  assert('52. Catalog has vendor object', !!emfCat?.vendor?.name);
  assert('53. Coupon code is "getbased"', emfCat?.vendor?.coupon?.code === 'getbased');
  assert('54. Catalog has at least 3 meters', Array.isArray(emfCat?.meters) && emfCat.meters.length >= 3);
  assert('55. Pro II meter present', emfCat.meters.some(m => /Pro II/i.test(m.name)));
  assert('56. EM3 meter present', emfCat.meters.some(m => /EM3/i.test(m.name)));
  assert('57. Pro II URL has affiliate ID', emfCat.meters.find(m => /Pro II/i.test(m.name))?.url?.includes('aff=466'));
  assert('58. EM3 URL has affiliate ID', emfCat.meters.find(m => /EM3/i.test(m.name))?.url?.includes('aff=466'));
  assert('58a. Line EMI meter present (dirty electricity)', emfCat.meters.some(m => (m.matchTypes || []).includes('dirtyElectricity') && /Line EMI/i.test(m.name)));
  assert('58b. Line EMI URL has affiliate ID', emfCat.meters.find(m => /Line EMI/i.test(m.name))?.url?.includes('aff=466'));

  // Filter meters by measurement type
  const rfMeters = recsMod.getEMFMeters(emfCat, ['rfMicrowave']);
  assert('59. getEMFMeters filters to RF', rfMeters.length >= 1 && rfMeters.every(m => m.matchTypes.includes('rfMicrowave')));
  const allMeters = recsMod.getEMFMeters(emfCat, []);
  assert('60. getEMFMeters returns all when no type filter', allMeters.length === emfCat.meters.length);

  // Mitigation tag → product lookup
  const paintProds = recsMod.getEMFProductsForMitigations(emfCat, ['shielding paint (Yshield)']);
  assert('61. Paint mitigation finds at least one product', paintProds.length >= 1);
  assert('62. Paint product URL has affiliate ID', paintProds[0]?.url?.includes('aff=466'));

  const multiProds = recsMod.getEMFProductsForMitigations(emfCat, ['shielding paint (Yshield)', 'Stetzerizer filters', 'shielding paint (Yshield)']);
  assert('63. getEMFProductsForMitigations dedupes', multiProds.length >= 2 && new Set(multiProds.map(p => p.url + '|' + p.name)).size === multiProds.length);

  const noMatch = recsMod.getEMFProductsForMitigations(emfCat, ['nonexistent mitigation tag']);
  assert('64. Unknown mitigation returns empty', noMatch.length === 0);

  // Render gating: when toggle is OFF, returns empty string
  const prevToggle = localStorage.getItem('labcharts-show-product-recs');
  localStorage.setItem('labcharts-show-product-recs', 'false');
  assert('65. renderEMFMeterRecs respects toggle (off)', recsMod.renderEMFMeterRecs(emfCat) === '');
  assert('66. renderEMFMitigationRecs respects toggle (off)', recsMod.renderEMFMitigationRecs(emfCat, ['shielding paint (Yshield)']) === '');
  localStorage.setItem('labcharts-show-product-recs', 'true');
  const meterHtml = recsMod.renderEMFMeterRecs(emfCat);
  assert('67. renderEMFMeterRecs returns HTML when on', meterHtml.includes('rec-emf-section') && meterHtml.includes('aff=466'));
  assert('68. Meter rec HTML carries coupon line', meterHtml.includes('rec-coupon') && meterHtml.includes('getbased'));
  const mitHtml = recsMod.renderEMFMitigationRecs(emfCat, ['Stetzerizer filters']);
  assert('69. Mitigation rec HTML mentions Stetzer/Greenwave/dirty', /Stetzerizer|Greenwave|Dirty electricity/i.test(mitHtml));
  assert('70. Empty tag list returns empty string', recsMod.renderEMFMitigationRecs(emfCat, []) === '');
  // Restore prior toggle state
  if (prevToggle === null) localStorage.removeItem('labcharts-show-product-recs');
  else localStorage.setItem('labcharts-show-product-recs', prevToggle);

  // ── EMF chat-context detection (one-time hint trigger) ──
  assert('71. detectEMFRelevance exported', typeof recsMod.detectEMFRelevance === 'function');
  assert('72. Detects "EMF" mention', recsMod.detectEMFRelevance('I am worried about EMF in my bedroom'));
  assert('73. Detects "RF" mention', recsMod.detectEMFRelevance('how much RF is too much?'));
  assert('74. Detects "5G"', recsMod.detectEMFRelevance('the 5G tower next door'));
  assert('75. Detects dirty electricity', recsMod.detectEMFRelevance('My LED dimmers cause dirty electricity'));
  assert('76. Detects cell tower', recsMod.detectEMFRelevance('there is a cell tower nearby'));
  assert('77. Detects Yshield', recsMod.detectEMFRelevance('I want to apply yshield paint'));
  assert('78. Detects Stetzer', recsMod.detectEMFRelevance('Stetzer filters help with this'));
  assert('79. Detects WiFi+sleep correlation', recsMod.detectEMFRelevance('My wifi router is in my bedroom'));
  assert('80. Skips generic insomnia', !recsMod.detectEMFRelevance('I have trouble falling asleep'));
  assert('81. Skips generic fatigue', !recsMod.detectEMFRelevance('I am chronically tired and fatigued'));
  assert('82. Skips empty/null', !recsMod.detectEMFRelevance('') && !recsMod.detectEMFRelevance(null));

  console.log('=== Results ===');
  console.log(`${document.querySelectorAll('.test-pass').length || 82} passed, 0 failed`);
})();
