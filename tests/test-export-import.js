// test-export-import.js — Export/import roundtrip tests
// Run: fetch('tests/test-export-import.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const { state: S } = await import('/js/state.js');
  const backupModule = await import('/js/backup.js');
  const dataModule = await import('/js/data.js');
  const exportModule = await import('/js/export.js');
  const contextCards = await import('/js/context-cards.js');
  const profile = await import('/js/profile.js');
  const views = await import('/js/views.js');
  const nav = await import('/js/nav.js');

  // ── Profile safety guard: run tests in a throwaway profile ──
  const origProfileId = S.currentProfile;
  const testProfileId = profile.createProfile('__test_' + Date.now(), { tags: ['test'], skipInitialSync: true });
  await profile.switchProfile(testProfileId);

  try {

  console.log('%c Export/Import Roundtrip Tests ', 'background:#6366f1;color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold');

  // ═══════════════════════════════════════
  // SETUP — load demo data
  // ═══════════════════════════════════════
  const hadData = S.importedData?.entries?.length > 0;
  if (!hadData) {
    const resp = await fetch('data/demo-male.json');
    const demo = await resp.json();
    S.importedData = demo;
    S.profileSex = 'male';
    S.profileDob = '1987-11-22';
    dataModule.saveImportedData();
    nav.buildSidebar();
    views.navigate('dashboard');
    await wait(50);
  }
  const data = dataModule.getActiveData();
  assert('Setup: demo data loaded', data.dates.length > 0, `${data.dates.length} dates`);

  // ═══════════════════════════════════════
  // 1. JSON Export Structure — function availability
  // ═══════════════════════════════════════
  console.log('%c 1. Export function availability ', 'font-weight:bold;color:#f59e0b');

  assert('exportDataJSON is callable', typeof exportModule.exportDataJSON === 'function');
  assert('exportClientJSON is callable', typeof exportModule.exportClientJSON === 'function');
  assert('exportAllDataJSON is callable', typeof exportModule.exportAllDataJSON === 'function');
  assert('buildAllDataBundle is callable', typeof exportModule.buildAllDataBundle === 'function');
  assert('importDataJSON is callable', typeof exportModule.importDataJSON === 'function');
  assert('clearAllData is callable', typeof exportModule.clearAllData === 'function');

  // ═══════════════════════════════════════
  // 2. exportClientJSON — source verification
  // ═══════════════════════════════════════
  console.log('%c 2. Client export structure (source) ', 'font-weight:bold;color:#f59e0b');

  const exportSrc = await fetch('/js/export.js').then(r => r.text());
  const exportImportSrc = await fetch('/js/export-import.js').then(r => r.text());
  const exportRuntimeSrc = await fetch('/js/export-runtime.js').then(r => r.text());
  const reportCoreSrc = await fetch('/js/export-report.js').then(r => r.text());
  const reportHtmlSrc = await fetch('/js/export-report-html.js').then(r => r.text());
  const reportBuilderSrc = await fetch('/js/export-report-builder.js').then(r => r.text());
  const reportSrc = `${reportCoreSrc}\n${reportHtmlSrc}\n${reportBuilderSrc}`;
  const modalSharedSrc = await fetch('/css/modal-shared.css').then(r => r.text());
  const serviceWorkerSrc = await fetch('/service-worker.js').then(r => r.text());

  // exportClientJSON produces v2 client export with profile metadata
  assert('Client export sets version: 2', exportSrc.includes('version: 2, exportedAt:'));
  assert('Client export includes profile object', exportSrc.includes('profile: { name:'));
  assert('Client export includes entries', exportSrc.includes('entries: data.entries'));
  assert('Client export includes notes', exportSrc.includes('notes: data.notes'));
  assert('Client export includes supplements', exportSrc.includes('supplements: data.supplements'));
  assert('Client export includes diagnoses', exportSrc.includes('diagnoses: data.diagnoses'));
  assert('Client export includes diet', exportSrc.includes('diet: data.diet'));
  assert('Client export includes exercise', exportSrc.includes('exercise: data.exercise'));
  assert('Client export includes sleepRest', exportSrc.includes('sleepRest: data.sleepRest'));
  assert('Client export includes lightCircadian', exportSrc.includes('lightCircadian: data.lightCircadian'));
  assert('Client export includes stress', exportSrc.includes('stress: data.stress'));
  assert('Client export includes loveLife', exportSrc.includes('loveLife: data.loveLife'));
  assert('Client export includes environment', exportSrc.includes('environment: data.environment'));
  assert('Client export includes interpretiveLens', exportSrc.includes('interpretiveLens: data.interpretiveLens'));
  assert('Client export includes contextNotes', exportSrc.includes('contextNotes: data.contextNotes'));
  assert('Client export includes healthGoals', exportSrc.includes('healthGoals: data.healthGoals'));
  assert('Client export includes customMarkers', exportSrc.includes('customMarkers: data.customMarkers'));
  assert('Client export includes refOverrides', exportSrc.includes('refOverrides: data.refOverrides'));
  assert('Client export includes menstrualCycle', exportSrc.includes('menstrualCycle: data.menstrualCycle'));
  assert('Client export includes genetics', exportSrc.includes('genetics: data.genetics'));
  assert('Client export includes biometrics', exportSrc.includes('biometrics: data.biometrics'));
  assert('Client export includes contextSourceSettings', exportSrc.includes('contextSourceSettings: data.contextSourceSettings || {}'));
  assert('Client export includes markerNotes', exportSrc.includes('markerNotes: data.markerNotes'));
  assert('Client export includes changeHistory', exportSrc.includes('changeHistory: data.changeHistory'));
  assert('Client export includes chatSummaries', exportSrc.includes('chatSummaries: data.chatSummaries'));
  assert('JSON import restores contextSourceSettings before migration',
    exportImportSrc.includes('state.importedData.contextSourceSettings = json.contextSourceSettings'));
  assert('Database bundle merge restores contextSourceSettings for existing profiles',
    exportImportSrc.includes('current.contextSourceSettings = importData.contextSourceSettings'));
  assert('Supplement import preserves safe sourceUrl', exportImportSrc.includes('entry.sourceUrl = sourceUrl.toString()'));
  // Light & Sun stack — earlier export schema dropped these silently;
  // import learned them in v1.6.x but export hadn't followed suit.
  assert('Client export includes sunSessions', exportSrc.includes('sunSessions: data.sunSessions'));
  assert('Client export includes deviceSessions', exportSrc.includes('deviceSessions: data.deviceSessions'));
  assert('Client export includes lightDevices', exportSrc.includes('lightDevices: data.lightDevices'));
  assert('Client export includes lightAudits', exportSrc.includes('lightAudits: data.lightAudits'));
  assert('Client export includes lightMeasurements', exportSrc.includes('lightMeasurements: data.lightMeasurements'));
  assert('Client export includes lightEnvironment', exportSrc.includes('lightEnvironment: data.lightEnvironment'));
  assert('Client export includes sunDefaults', exportSrc.includes('sunDefaults: data.sunDefaults'));
  assert('Client export includes sunCorrelations', exportSrc.includes('sunCorrelations: data.sunCorrelations'));
  assert('Client export includes lifelightProfile', exportSrc.includes('lifelightProfile: data.lifelightProfile'));
  assert('Client export includes lightDailyVerdicts', exportSrc.includes('lightDailyVerdicts: data.lightDailyVerdicts'));
  assert('Client export includes channelMixAI', exportSrc.includes('channelMixAI: data.channelMixAI'));
  assert('Client export has profile sex', exportSrc.includes('sex: p.sex'));
  assert('Client export has profile dob', exportSrc.includes('dob: p.dob'));
  assert('Client export has profile tags', exportSrc.includes('tags: p.tags'));
  assert('Client export has profile height', exportSrc.includes('height: p.height'));
  assert('PDF report print footer stays in document flow',
    !/\.report-footer\s*\{[^}]*position:\s*fixed/i.test(reportSrc),
    'fixed print footer overlaps report content in generated PDFs');
  assert('PDF report footer avoids splitting across pages',
    reportSrc.includes('break-inside: avoid; page-break-inside: avoid;'));
  assert('PDF print mode lets summary flow onto first page',
    reportSrc.includes('.report-summary, .report-ai-summary, .profile-context { break-inside: auto; page-break-inside: auto; }') &&
      reportSrc.includes('.report-summary, .report-ai-summary { padding: 12px 14px; margin-bottom: 16px; }'));
  assert('PDF report header uses human-readable report labels',
      reportSrc.includes('${esc(profileName)} lab report') &&
      reportSrc.includes('report-deck') &&
      reportSrc.includes('Needs Attention') &&
      reportSrc.includes('Lab Dates') &&
      reportSrc.includes('Lab Groups') &&
      reportSrc.includes('DOB / Age') &&
      reportSrc.includes('Blood pressure') &&
      reportSrc.includes('Resting pulse') &&
      !reportSrc.includes('Collections</span>'));
  assert('PDF report forces light document background',
    reportSrc.includes(':root { color-scheme: light; }') &&
      reportSrc.includes('html, body { background: #fff; }'));
  assert('PDF report surfaces summary before detailed lab tables',
    reportSrc.indexOf("if (reportIncludes(reportOptions, 'summary'))") <
      reportSrc.indexOf('// Flagged Results') &&
      reportSrc.indexOf('// Flagged Results') < reportSrc.indexOf('// Category tables'));
  assert('PDF report date windows do not fall back to all lab dates',
    reportSrc.includes('getReportCutoffDate(range)') &&
      reportSrc.includes('return filterDataByDateIndices(rawData, indices, cutoffStr);') &&
      !reportSrc.includes('if (indices.length === 0) return rawData;'));
  assert('PDF report notes filter by selected window, not lab draw dates',
    reportSrc.includes('getReportCutoffDate(options.dateRange)') &&
      reportSrc.includes('note.date >= cutoffStr') &&
      !reportSrc.includes('dateSet.has(note.date)'));
  assert('PDF report formats profile context without raw JSON dumps',
    reportSrc.includes('formatFamilyHistoryItem') &&
      reportSrc.includes('humanizeContextKey') &&
      !reportSrc.includes('JSON.stringify(i)'));
  assert('PDF report context uses imported profile height helper',
    reportCoreSrc.includes('const pHeight = getProfileHeight(state.currentProfile);') &&
      !reportCoreSrc.includes('window.getProfileHeight'));
  assert('PDF report gives profile context a designed card layout',
    reportSrc.includes('class="profile-context"') &&
      reportSrc.includes('class="context-card"') &&
      reportSrc.includes('.context-grid') &&
      reportSrc.includes('.context-facts'));
  assert('PDF report modules avoid core-renderer circular imports',
    !reportCoreSrc.includes("from './export-report-html.js'") &&
      reportHtmlSrc.includes("from './export-report.js'"));
  assert('PDF report modules are precached for offline service-worker loads',
    serviceWorkerSrc.includes("'/js/export-report.js'") &&
      serviceWorkerSrc.includes("'/js/export-report-html.js'") &&
      serviceWorkerSrc.includes("'/js/export-report-builder.js'"));
  assert('Report builder opens as a first-class modal',
    reportSrc.includes('export function openReportBuilder') &&
      reportSrc.includes('report-builder-overlay') &&
      reportSrc.includes('report-builder-scroll') &&
      reportSrc.includes("reportBuilderActionAttrs('export')"));
  assert('Report builder facade delegates default preset to implementation',
    exportSrc.includes('export function openReportBuilder(presetId)') &&
      !exportSrc.includes("from './export-report-builder.js'") &&
      exportSrc.includes("import('./export-report-builder.js')") &&
      exportSrc.includes("import('./export-report-builder.js?lazy-retry=1')") &&
      !exportSrc.includes("openReportBuilder(presetId = 'clinician')"));
  assert('Report builder supports AI overview generation',
    reportSrc.includes('export async function generateReportAISummary') &&
      reportSrc.includes('REPORT_AI_SUMMARY_PROMPT') &&
      reportSrc.includes('Patient picture:') &&
      reportSrc.includes('Discussion focus:') &&
      reportSrc.includes('Practitioner overview') &&
      reportSrc.includes("reportBuilderActionAttrs('generate-ai-summary')") &&
      reportSrc.includes('report-ai-summary-text') &&
      reportSrc.includes('aria-label="Editable practitioner overview"') &&
      !reportSrc.includes('class="report-ai-summary-text" readonly') &&
      modalSharedSrc.includes('.report-ai-builder'));
  assert('Report category picker renders text labels without legacy emojis',
    reportSrc.includes('<span class="report-category-title">${escapeHTML(option.label)}</span>') &&
      !reportSrc.includes('${escapeHTML(option.icon)} ${escapeHTML(option.label)}'));
  assert('Report builder preview action uses primary modal styling',
    reportSrc.includes('import-btn import-btn-primary report-builder-preview-btn') &&
      modalSharedSrc.includes('.report-builder-scroll') &&
      modalSharedSrc.includes('.report-builder-actions') &&
      modalSharedSrc.includes('.report-builder-preview-btn'));
  assert('PDF report accepts builder options',
    reportSrc.includes('export function exportPDFReport(options = {})') &&
      reportSrc.includes('filterReportCategories(data, reportOptions.categoryKeys)') &&
      reportSrc.includes("reportIncludes(reportOptions, 'categories')") &&
      reportSrc.includes('aiSummary: normalizeReportAISummary(options.aiSummary)'));
  assert('PDF preview opens without auto-printing',
    !reportSrc.includes('setTimeout(() => win.print()') &&
      reportSrc.includes('report-print-btn') &&
      reportSrc.includes("addEventListener('click', () => win.print())"));
  assert('PDF report initializes genetics before summary render',
    reportSrc.indexOf('const genetics = state.importedData.genetics;') >= 0 &&
      reportSrc.indexOf('const genetics = state.importedData.genetics;') < reportSrc.indexOf('body += renderSummarySection();'));
  assert('PDF lab tables drop all-empty date columns',
    reportSrc.includes('hasReportValue') &&
      reportSrc.includes('.filter(({ index }) => markersWithData.some(([, marker]) => hasReportValue(marker.values?.[index])))'));

  // ═══════════════════════════════════════
  // 3. buildAllDataBundle — live call
  // ═══════════════════════════════════════
  console.log('%c 3. buildAllDataBundle live call ', 'font-weight:bold;color:#f59e0b');

  const raw = await exportModule.buildAllDataBundle();
  assert('buildAllDataBundle returns non-null', raw != null);

  // buildAllDataBundle returns a JSON string
  const isString = typeof raw === 'string';
  assert('buildAllDataBundle returns JSON string', isString);

  const bundle = isString ? JSON.parse(raw) : raw;
  assert('Bundle has version: 2', bundle.version === 2);
  assert('Bundle has type: database', bundle.type === 'database');
  assert('Bundle has exportedAt', typeof bundle.exportedAt === 'string' && bundle.exportedAt.length > 0);
  assert('Bundle has profiles array', Array.isArray(bundle.profiles));
  assert('Bundle has at least 1 profile', bundle.profiles.length >= 1);

  // Verify profile structure
  const currentId = S.currentProfile;
  const bundleProfile = bundle.profiles.find(p => p.id === currentId) || bundle.profiles[0];
  assert('Profile has id', typeof bundleProfile.id === 'string');
  assert('Profile has name', typeof bundleProfile.name === 'string');
  assert('Profile has sex field', 'sex' in bundleProfile);
  assert('Profile has dob field', 'dob' in bundleProfile);
  assert('Profile has data object', typeof bundleProfile.data === 'object');
  assert('Profile has tags array', Array.isArray(bundleProfile.tags));
  assert('Profile has status', typeof bundleProfile.status === 'string');
  assert('Profile has height field', 'height' in bundleProfile);
  assert('Profile has heightUnit field', 'heightUnit' in bundleProfile);

  // Profile data has entries array
  assert('Profile data has entries', Array.isArray(bundleProfile.data.entries));

  // ═══════════════════════════════════════
  // 4. Import validation — source inspection
  // ═══════════════════════════════════════
  console.log('%c 4. Import validation (source) ', 'font-weight:bold;color:#f59e0b');

  // importDataJSON checks for entries array
  assert('Import checks entries array', exportImportSrc.includes("!json.entries || !Array.isArray(json.entries)"));
  assert('Import shows error for missing entries', exportImportSrc.includes("Invalid JSON format: missing entries array"));

  // Database bundle detection
  assert('Import detects database bundle', exportImportSrc.includes("json.type === 'database' && Array.isArray(json.profiles)"));
  assert('Import routes to _importDatabaseBundle', exportImportSrc.includes('_importDatabaseBundle(json)'));

  // Client export detection (v2 with profile metadata)
  assert('Import detects client profile.name', exportImportSrc.includes('json.profile?.name'));
  assert('Import creates profile from metadata', exportImportSrc.includes('createProfile(p.name'));

  // Import handles context fields
  assert('Import handles diagnoses', exportImportSrc.includes("importContextField('diagnoses')"));
  assert('Import handles diet', exportImportSrc.includes("importContextField('diet')"));
  assert('Import handles exercise', exportImportSrc.includes("importContextField('exercise')"));

  // Import handles customMarkers merge
  assert('Import merges customMarkers', exportImportSrc.includes('json.customMarkers && typeof json.customMarkers'));
  assert('Import merges refOverrides', exportImportSrc.includes('json.refOverrides && typeof json.refOverrides'));

  // Import handles genetics, biometrics, emfAssessment
  assert('Import handles genetics', exportImportSrc.includes('json.genetics && (json.genetics.snps || json.genetics.mtdna)'));
  assert('Import handles biometrics', exportImportSrc.includes('json.biometrics && typeof json.biometrics'));
  assert('Import handles emfAssessment', exportImportSrc.includes('json.emfAssessment && json.emfAssessment.assessments'));
  assert('Import handles menstrualCycle', exportImportSrc.includes('json.menstrualCycle && typeof json.menstrualCycle'));
  assert('Import handles markerNotes', exportImportSrc.includes('json.markerNotes && typeof json.markerNotes'));

  // Legacy format migration (sleepCircadian -> sleepRest)
  assert('Import migrates old sleepCircadian', exportImportSrc.includes('json.sleepCircadian'));
  assert('Import handles v1 string-to-object migration', exportImportSrc.includes('migrations[field]'));

  // ═══════════════════════════════════════
  // 5. Data integrity — entry count match
  // ═══════════════════════════════════════
  console.log('%c 5. Data integrity roundtrip ', 'font-weight:bold;color:#f59e0b');

  // Get current entry count from state
  const stateEntries = S.importedData.entries || [];
  const entryCount = stateEntries.length;

  // Find the current profile in the bundle
  const myBundleProfile = bundle.profiles.find(p => p.id === currentId);
  assert('Current profile found in bundle', !!myBundleProfile, `looking for id=${currentId}`);

  if (myBundleProfile) {
    const bundleEntries = myBundleProfile.data.entries || [];
    assert('Entry count matches state', bundleEntries.length === entryCount,
      `bundle=${bundleEntries.length}, state=${entryCount}`);

    // Verify each entry has date and markers
    const validEntries = bundleEntries.filter(e => e.date && e.markers);
    assert('All bundle entries have date + markers', validEntries.length === bundleEntries.length,
      `valid=${validEntries.length}, total=${bundleEntries.length}`);

    // Verify dates match
    const stateDates = stateEntries.map(e => e.date).sort();
    const bundleDates = bundleEntries.map(e => e.date).sort();
    const datesMatch = stateDates.length === bundleDates.length &&
      stateDates.every((d, i) => d === bundleDates[i]);
    assert('Entry dates match between state and bundle', datesMatch);
  }

  // ═══════════════════════════════════════
  // 6. Supplements survive export
  // ═══════════════════════════════════════
  console.log('%c 6. Supplements survive export ', 'font-weight:bold;color:#f59e0b');

  // Inject a test supplement to ensure it roundtrips
  if (!S.importedData.supplements) S.importedData.supplements = [];
  const origSuppCount = S.importedData.supplements.length;
  S.importedData.supplements.push({ name: '__EXPORT_TEST_SUPP__', dosage: '100mg', startDate: '2026-01-01', periods: [{ start: '2026-01-01', end: null }] });
  dataModule.saveImportedData();
  await wait(20);

  // Rebuild bundle after adding supplement
  const raw2 = await exportModule.buildAllDataBundle();
  const bundle2 = JSON.parse(raw2);
  const myProfile2 = bundle2.profiles.find(p => p.id === currentId);
  const bundleSupps = myProfile2?.data?.supplements || [];
  const testSuppInBundle = bundleSupps.find(s => s.name === '__EXPORT_TEST_SUPP__');
  assert('Test supplement present in bundle', !!testSuppInBundle);
  assert('Test supplement dosage preserved', testSuppInBundle?.dosage === '100mg');
  assert('Test supplement startDate preserved', testSuppInBundle?.startDate === '2026-01-01');
  assert('Supplement count matches', bundleSupps.length === origSuppCount + 1,
    `bundle=${bundleSupps.length}, expected=${origSuppCount + 1}`);

  // Clean up test supplement
  S.importedData.supplements = S.importedData.supplements.filter(s => s.name !== '__EXPORT_TEST_SUPP__');
  dataModule.saveImportedData();
  await wait(20);

  // ═══════════════════════════════════════
  // 7. Context cards survive export
  // ═══════════════════════════════════════
  console.log('%c 7. Context cards survive export ', 'font-weight:bold;color:#f59e0b');

  // Inject test context data
  const origDiagnoses = S.importedData.diagnoses;
  const origDiet = S.importedData.diet;
  const origExercise = S.importedData.exercise;
  const origLens = S.importedData.interpretiveLens;

  S.importedData.diagnoses = { conditions: ['__TEST_CONDITION__'], note: 'test note' };
  S.importedData.diet = { type: 'paleo', restrictions: ['dairy'], note: 'test diet' };
  S.importedData.exercise = { frequency: 'daily', types: ['running'], intensity: 'moderate', note: '' };
  S.importedData.interpretiveLens = '__TEST_LENS__';
  dataModule.saveImportedData();
  await wait(20);

  const raw3 = await exportModule.buildAllDataBundle();
  const bundle3 = JSON.parse(raw3);
  const myProfile3 = bundle3.profiles.find(p => p.id === currentId);
  const pData = myProfile3?.data || {};

  assert('Diagnoses in bundle', pData.diagnoses?.conditions?.includes('__TEST_CONDITION__'));
  assert('Diagnoses note preserved', pData.diagnoses?.note === 'test note');
  assert('Diet type in bundle', pData.diet?.type === 'paleo');
  assert('Diet restrictions in bundle', pData.diet?.restrictions?.includes('dairy'));
  assert('Exercise in bundle', pData.exercise?.frequency === 'daily');
  assert('Exercise types in bundle', pData.exercise?.types?.includes('running'));
  assert('InterpretiveLens in bundle', pData.interpretiveLens === '__TEST_LENS__');

  // Restore originals
  S.importedData.diagnoses = origDiagnoses;
  S.importedData.diet = origDiet;
  S.importedData.exercise = origExercise;
  S.importedData.interpretiveLens = origLens;
  dataModule.saveImportedData();
  await wait(20);

  // ═══════════════════════════════════════
  // 8. Custom markers / refOverrides survive export
  // ═══════════════════════════════════════
  console.log('%c 8. Custom markers & refOverrides survive export ', 'font-weight:bold;color:#f59e0b');

  // Inject test custom marker
  if (!S.importedData.customMarkers) S.importedData.customMarkers = {};
  if (!S.importedData.refOverrides) S.importedData.refOverrides = {};
  const origCustom = { ...S.importedData.customMarkers };
  const origOverrides = { ...S.importedData.refOverrides };

  S.importedData.customMarkers['custom.__export_test_marker'] = {
    name: '__Export Test Marker__', unit: 'mg/dL', category: 'custom',
    refRange: { low: 10, high: 50 }
  };
  S.importedData.refOverrides['biochemistry.glucose'] = {
    ref: { low: 3.5, high: 6.0 }, optimal: { low: 4.0, high: 5.5 }
  };
  dataModule.saveImportedData();
  await wait(20);

  const raw4 = await exportModule.buildAllDataBundle();
  const bundle4 = JSON.parse(raw4);
  const myProfile4 = bundle4.profiles.find(p => p.id === currentId);
  const pData4 = myProfile4?.data || {};

  assert('Custom marker in bundle', !!pData4.customMarkers?.['custom.__export_test_marker']);
  assert('Custom marker name preserved', pData4.customMarkers?.['custom.__export_test_marker']?.name === '__Export Test Marker__');
  assert('Custom marker unit preserved', pData4.customMarkers?.['custom.__export_test_marker']?.unit === 'mg/dL');
  assert('RefOverride in bundle', !!pData4.refOverrides?.['biochemistry.glucose']);
  assert('RefOverride ref.low preserved', pData4.refOverrides?.['biochemistry.glucose']?.ref?.low === 3.5);
  assert('RefOverride optimal.high preserved', pData4.refOverrides?.['biochemistry.glucose']?.optimal?.high === 5.5);

  // Restore originals
  S.importedData.customMarkers = origCustom;
  S.importedData.refOverrides = origOverrides;
  dataModule.saveImportedData();
  await wait(20);

  // ═══════════════════════════════════════
  // 9. clearAllData — source inspection
  // ═══════════════════════════════════════
  console.log('%c 9. clearAllData source inspection ', 'font-weight:bold;color:#f59e0b');

  assert('clearAllData exists', typeof exportModule.clearAllData === 'function');

  // A shared cleanup boundary owns every profile-scoped storage surface.
  // clearAllData also discovers orphaned profile blobs that are no longer in
  // the profile list, then awaits the durable profile-list reset.
  assert('Discovers listed and orphaned profile data',
    exportSrc.includes('await listStoredProfileIds(profiles.map(profile => profile.id))'));
  assert('Awaits centralized profile storage cleanup',
    /for \(const id of profileIds\)[\s\S]{0,200}await clearProfileStorage\(id\)/.test(exportSrc));
  assert('Awaits the profile-list reset', exportSrc.includes('await saveProfiles([{ id: defaultId'));
  assert('Resets state.importedData from the canonical factory',
    exportSrc.includes('state.importedData = createDefaultProfileData()'));
  assert('Resets to single default profile via saveProfiles', exportSrc.includes('saveProfiles([{'));
  assert('Clears Cashu wallet DB through export runtime',
    exportSrc.includes('destroyWalletRuntimeDB') &&
    exportRuntimeSrc.includes("import('./cashu-wallet.js')") &&
    exportRuntimeSrc.includes("import('./cashu-wallet.js?lazy-retry=1')") &&
    exportRuntimeSrc.includes('await wallet.destroyWalletDB()'));
  assert('Clears Cashu wallet mint', exportSrc.includes("localStorage.removeItem('labcharts-cashu-wallet-mint')"));
  assert('Calls navigate(dashboard) after clear through export runtime',
    exportSrc.includes('refreshImportRuntimeShell({ chat: true, profileButton: true })') &&
    exportRuntimeSrc.includes("route = 'dashboard'") &&
    exportRuntimeSrc.includes("exportImportRuntimeDeps.navigate || getRuntimeFunction('navigate')") &&
    exportRuntimeSrc.includes('navigate?.(route)'));

  // ═══════════════════════════════════════
  // 10. Database bundle import — source inspection
  // ═══════════════════════════════════════
  console.log('%c 10. Database bundle import (source) ', 'font-weight:bold;color:#f59e0b');

  // _importDatabaseBundle merge logic
  assert('Bundle import matches by id first', exportImportSrc.includes('profiles.find(p => p.id === bp.id)'));
  assert('Bundle import falls back to name match', exportImportSrc.includes('profiles.find(p => p.name === bp.name)'));
  assert('Bundle import does date-keyed entry upsert',
    /const entries = ensureImportedArray\(current,\s*['"]entries['"]\)[\s\S]{0,260}entries\.findIndex\(ex => ex\.date === entry\.date\)[\s\S]{0,180}replaceImportedArrayItem\(current,\s*['"]entries['"],\s*idx,\s*entry\)/.test(exportImportSrc));
  assert('Bundle import deduplicates notes', exportImportSrc.includes('notes.some(x => x.date === n.date && x.text === n.text)'));
  assert('Bundle import deduplicates supplements', exportImportSrc.includes('supplements.some(x => x.name === s.name && x.startDate === s.startDate)'));
  assert('Bundle import merges health goals', exportImportSrc.includes('healthGoals.some(x => x.text === g.text)'));
  assert('Bundle import merges custom markers', exportImportSrc.includes("!current.customMarkers[key]"));
  assert('Bundle import merges ref overrides', exportImportSrc.includes("!current.refOverrides[key]"));
  assert('Bundle import replaces context fields', exportImportSrc.includes("for (const field of ['diagnoses', 'diet', 'exercise'"));
  assert('Bundle import caps changeHistory at 200', exportImportSrc.includes("trimImportedArray(current, 'changeHistory', 200)"));
  assert('Bundle import merges chat summaries', exportImportSrc.includes('chatSummaries.findIndex'));
  assert('Bundle import creates new profiles', exportImportSrc.includes("createProfile(bp.name || 'Imported'"));
  assert('Bundle import loads first imported profile', exportImportSrc.includes('loadProfile(targetId)'));
  assert('Bundle import handles non-secret wallet settings restore', exportImportSrc.includes('json.wallet'));

  // ═══════════════════════════════════════
  // 11. Bundle includes only non-secret wallet metadata
  // ═══════════════════════════════════════
  console.log('%c 11. Bundle non-secret wallet metadata ', 'font-weight:bold;color:#f59e0b');

  assert('Bundle wallet export includes only node URL in source', exportSrc.includes('bundle.wallet = { nodeUrl:'));
  assert('Bundle wallet export excludes Cashu mint and seed settings',
    exportSrc.includes('getSelectedNodeUrl') &&
    !exportRuntimeSrc.includes('cashuGetMintUrl') &&
    !exportRuntimeSrc.includes('cashuGetWalletMnemonic'));
  assert('Bundle wallet reads the selected node through the Nostr module',
    exportSrc.includes("from './nostr-discovery.js'") &&
    exportSrc.includes('getSelectedNodeUrl()') &&
    exportImportSrc.includes('setSelectedNodeUrl(json.wallet.nodeUrl)'));

  // ═══════════════════════════════════════
  // 12. exportDataJSON is alias for exportClientJSON
  // ═══════════════════════════════════════
  console.log('%c 12. exportDataJSON alias ', 'font-weight:bold;color:#f59e0b');

  assert('exportDataJSON calls exportClientJSON', exportSrc.includes('exportClientJSON(state.currentProfile)'));

  // ═══════════════════════════════════════
  // 13. Chat export/import integration
  // ═══════════════════════════════════════
  console.log('%c 13. Chat export/import ', 'font-weight:bold;color:#f59e0b');

  assert('_exportChatData reads chat-threads', exportSrc.includes('labcharts-${profileId}-chat-threads'));
  assert('_exportChatData reads thread messages', exportSrc.includes('labcharts-${profileId}-chat-t_${t.id}'));
  assert('_exportChatData returns threads+messages+personality', exportSrc.includes('return { threads, messages, personality, customPersonalities }'));
  assert('_importChatData writes thread messages', exportImportSrc.includes("localStorage.setItem(`labcharts-${profileId}-chat-t_${t.id}`"));
  assert('_importChatData deduplicates by thread id', exportImportSrc.includes('existingIds.has(t.id)'));
  assert('Client export optionally includes chat', exportSrc.includes('if (includeChat)'));
  assert('Bundle export always includes chat', exportSrc.includes('if (chat) entry.chat = chat'));

  // ═══════════════════════════════════════
  // 13b. Backup includes Custom API settings (regression: #116)
  // ═══════════════════════════════════════
  console.log('%c 13b. Backup includes Custom API settings (#116) ', 'font-weight:bold;color:#f59e0b');

  const backupSrc = await fetch('/js/backup.js').then(r => r.text());
  assert('GLOBAL_SETTINGS_KEYS includes labcharts-custom-key', backupSrc.includes("'labcharts-custom-key'"));
  assert('GLOBAL_SETTINGS_KEYS includes labcharts-custom-url', backupSrc.includes("'labcharts-custom-url'"));
  assert('GLOBAL_SETTINGS_KEYS includes labcharts-custom-model', backupSrc.includes("'labcharts-custom-model'"));
  assert('GLOBAL_SETTINGS_KEYS includes labcharts-custom-models', backupSrc.includes("'labcharts-custom-models'"));

  // Functional roundtrip: seed Custom API settings → snapshot → wipe → restore
  const _origCustomKey = localStorage.getItem('labcharts-custom-key');
  const _origCustomUrl = localStorage.getItem('labcharts-custom-url');
  const _origCustomModel = localStorage.getItem('labcharts-custom-model');
  localStorage.setItem('labcharts-custom-key', 'sk-roundtrip-test');
  localStorage.setItem('labcharts-custom-url', 'https://api.example.com/v1');
  localStorage.setItem('labcharts-custom-model', 'gpt-test');

  const snap = backupModule.buildBackupSnapshot();
  assert('buildBackupSnapshot module export works', !!snap);
  assert('buildBackupSnapshot stays off window', !('buildBackupSnapshot' in window));
  if (snap) {
    assert('snapshot.settings carries custom-key', snap.settings['labcharts-custom-key'] === 'sk-roundtrip-test');
    assert('snapshot.settings carries custom-url', snap.settings['labcharts-custom-url'] === 'https://api.example.com/v1');
    assert('snapshot.settings carries custom-model', snap.settings['labcharts-custom-model'] === 'gpt-test');
  }

  // Restore originals
  if (_origCustomKey !== null) localStorage.setItem('labcharts-custom-key', _origCustomKey);
  else localStorage.removeItem('labcharts-custom-key');
  if (_origCustomUrl !== null) localStorage.setItem('labcharts-custom-url', _origCustomUrl);
  else localStorage.removeItem('labcharts-custom-url');
  if (_origCustomModel !== null) localStorage.setItem('labcharts-custom-model', _origCustomModel);
  else localStorage.removeItem('labcharts-custom-model');

  // Sync also picks them up (cross-device parity)
  const syncPayloadCollectorsSrc = await fetch('/js/sync-payload-collectors.js').then(r => r.text());
  const syncApplySrc = await fetch('/js/sync-apply.js').then(r => r.text());
  assert('AI_SETTINGS_KEYS includes labcharts-custom-key', /AI_SETTINGS_KEYS[\s\S]{0,800}labcharts-custom-key/.test(syncPayloadCollectorsSrc));
  assert('AI_SETTINGS_KEYS includes labcharts-custom-url', /AI_SETTINGS_KEYS[\s\S]{0,800}labcharts-custom-url/.test(syncPayloadCollectorsSrc));
  assert('ENCRYPTED_AI_KEYS includes labcharts-custom-key', /ENCRYPTED_AI_KEYS[\s\S]{0,400}labcharts-custom-key/.test(syncApplySrc));

  // ═══════════════════════════════════════
  // 13b. #181 regression — encrypted backup re-enumerates profiles
  // ═══════════════════════════════════════
  // Pre-fix bug: with encryption-at-rest enabled, buildBackupSnapshot parsed
  // the v1: envelope as `[]` and the localStorage fallback found nothing
  // because v1.6.x moved *-imported blobs to IndexedDB. Result: every backup
  // silently shipped profiles:[] (~1 KB file). buildFullBackupSnapshot now
  // detects that case and re-enumerates through its injected crypto dependency.
  console.log('%c 13b. Encrypted backup re-enumerates profiles ', 'font-weight:bold;color:#f59e0b');

  const backupSrcEnc = await fetch('/js/backup.js').then(r => r.text());
  assert('buildFullBackupSnapshot detects encrypted profile list',
    backupSrcEnc.includes('isEncryptedValue(snap.profileList)'));
  assert('buildFullBackupSnapshot decrypts via injected encryptedGetItem',
    backupSrcEnc.includes("getBackupRuntimeDeps().encryptedGetItem('labcharts-profiles')"));
  assert('Re-enumeration only fires when profiles array is empty (no double-write)',
    /snap\.profiles\.length\s*===\s*0\s*&&\s*snap\.profileList\s*&&\s*isEncryptedValue/.test(backupSrcEnc));
  assert('Re-enumeration uses PER_PROFILE_PREF_SUFFIXES (parity with sync path)',
    /for\s*\(\s*const\s+suffix\s+of\s+PER_PROFILE_PREF_SUFFIXES\s*\)/.test(backupSrcEnc));

  // Functional roundtrip: spoof the encrypted-list state and verify the
  // snapshot recovers a profile. Inject encryptedGetItem so this works
  // without an actual passphrase setup, then restore the production deps.
  const _profileKey = 'labcharts-profiles';
  const _origProfilesRaw = localStorage.getItem(_profileKey);
  let realProfiles = [];
  try { realProfiles = JSON.parse(_origProfilesRaw || '[]'); } catch {}
  if (Array.isArray(realProfiles) && realProfiles.length > 0) {
    const decryptedJson = JSON.stringify(realProfiles);
    // Make the on-disk value look encrypted (v1: prefix → isEncryptedValue
    // returns true → buildBackupSnapshot parses it as []).
    localStorage.setItem(_profileKey, 'v1:fake-ciphertext-only-the-prefix-matters');
    const previousBackupDeps = backupModule.configureBackupRuntimeDeps({
      encryptedGetItem: async (key) => {
        if (key === _profileKey) return decryptedJson;
        return null;
      },
    });
    try {
      const recoveredSnap = await backupModule.buildFullBackupSnapshot();
      assert('buildFullBackupSnapshot recovers profile list when encrypted',
        recoveredSnap?.profiles?.length === realProfiles.length,
        `expected ${realProfiles.length} profiles, got ${recoveredSnap?.profiles?.length ?? 'null'}`);
      assert('Recovered at least one imported blob from IDB',
        recoveredSnap?.profiles?.some(p => p?.keys?.imported != null));
      assert('Recovered profile carries the original profile id',
        recoveredSnap?.profiles?.[0]?.profileId === realProfiles[0].id);
    } finally {
      // Restore originals so subsequent tests see a clean state.
      if (_origProfilesRaw !== null) localStorage.setItem(_profileKey, _origProfilesRaw);
      else localStorage.removeItem(_profileKey);
      backupModule.configureBackupRuntimeDeps(previousBackupDeps);
    }
  } else {
    assert('Setup: at least one profile present for encrypted-recovery test', false,
      'no profiles in localStorage — demo data setup may have failed');
  }

  // ═══════════════════════════════════════
  // 14. Module exports
  // ═══════════════════════════════════════
  console.log('%c 14. Module exports ', 'font-weight:bold;color:#f59e0b');

  assert('Module has exportPDFReport', typeof exportModule.exportPDFReport === 'function');
  assert('Module has openReportBuilder', typeof exportModule.openReportBuilder === 'function');
  assert('Module has closeReportBuilder', typeof exportModule.closeReportBuilder === 'function');
  assert('Module has exportDataJSON', typeof exportModule.exportDataJSON === 'function');
  assert('Module has exportClientJSON', typeof exportModule.exportClientJSON === 'function');
  assert('Module has exportAllDataJSON', typeof exportModule.exportAllDataJSON === 'function');
  assert('Module has buildAllDataBundle', typeof exportModule.buildAllDataBundle === 'function');
  assert('Module has importDataJSON', typeof exportModule.importDataJSON === 'function');
  assert('Module has clearAllData', typeof exportModule.clearAllData === 'function');
  assert('Module has loadDemoData', typeof exportModule.loadDemoData === 'function');

  await exportModule.openReportBuilder();
  const reportBuilder = document.getElementById('report-builder-overlay');
  assert('Report builder modal renders', !!reportBuilder);
  assert('Report builder has presets, sections, date range, and categories',
    !!reportBuilder?.querySelector('.report-preset-btn.active') &&
      !!reportBuilder?.querySelector('#report-date-range') &&
      reportBuilder.querySelectorAll('input[data-report-section]').length >= 4 &&
      reportBuilder.querySelectorAll('input[data-report-category]').length >= 1);
  assert('Report builder presets describe the export scope',
    Array.from(reportBuilder.querySelectorAll('.report-preset-meta')).some(el => /Priority labs|All dates|notes/i.test(el.textContent || '')));
  reportBuilder.querySelector('[data-report-action="clear-categories"]')?.click();
  await wait(20);
  reportBuilder.querySelector('[data-report-action="export"]')?.click();
  await wait(20);
  assert('Report builder requires lab categories for lab-derived sections',
    !!document.getElementById('report-builder-overlay') &&
      (document.getElementById('notification-container')?.textContent || '').includes('Choose at least one lab category'));
  exportModule.closeReportBuilder();
  assert('Report builder closes cleanly', !document.getElementById('report-builder-overlay'));

  {
    const isoDate = d => d.toISOString().slice(0, 10);
    const inWindow = new Date();
    inWindow.setMonth(inWindow.getMonth() - 1);
    const outsideWindow = new Date();
    outsideWindow.setFullYear(outsideWindow.getFullYear() - 2);
    const originalNotes = Array.isArray(S.importedData.notes) ? S.importedData.notes.slice() : [];
    const originalDiagnoses = S.importedData.diagnoses;
    const originalSupplements = Array.isArray(S.importedData.supplements) ? S.importedData.supplements.slice() : [];
    const originalGenetics = S.importedData.genetics;
    const originalBiometrics = S.importedData.biometrics ? JSON.parse(JSON.stringify(S.importedData.biometrics)) : S.importedData.biometrics;
    const originalProfileSex = S.profileSex;
    const originalProfileDob = S.profileDob;
    const originalProfiles = JSON.parse(JSON.stringify(profile.getProfiles() || []));
    const originalSnpTable = window._snpTableCache;
    const oldOpen = window.open;
    let capturedReport = '';
    let printCalled = false;
    window.open = () => ({
      document: {
        write(markup) { capturedReport += markup; },
        close() {}
      },
      print() { printCalled = true; }
    });
    try {
      const profiles = profile.getProfiles() || [];
      let activeProfile = profiles.find(p => p.id === S.currentProfile);
      if (!activeProfile) {
        activeProfile = { id: S.currentProfile || 'default', name: 'Test Profile' };
        profiles.push(activeProfile);
      }
      Object.assign(activeProfile, {
        sex: 'male',
        dob: '1980-01-02',
        location: { country: 'CZ', zip: '11000' },
        height: 180,
        heightUnit: 'cm',
      });
      S.profileSex = 'male';
      S.profileDob = '1980-01-02';
      await profile.saveProfiles(profiles);
      S.importedData.biometrics = {
        weight: [{ date: '2026-05-15', value: 82, unit: 'kg', source: 'manual' }],
        bp: [{ date: '2026-05-15', sys: 118, dia: 76, source: 'manual' }],
        pulse: [{ date: '2026-05-15', value: 61, source: 'manual' }],
      };
      S.importedData.notes = originalNotes.concat([
        { date: isoDate(inWindow), text: 'Between-draw report note retained' },
        { date: isoDate(outsideWindow), text: 'Old report note excluded' }
      ]);
      exportModule.exportPDFReport({ preset: 'personal', dateRange: '1y', sections: ['notes'], categoryKeys: null });
      assert('Report notes include in-window notes without matching lab draw',
        capturedReport.includes('Between-draw report note retained') &&
          !capturedReport.includes('Old report note excluded'));
      assert('Report preview exposes print button without auto-printing',
        capturedReport.includes('class="report-preview-toolbar"') &&
          capturedReport.includes('Print / Save PDF') &&
          !printCalled);
      assert('Report header includes complete profile data when present',
        capturedReport.includes('<dt>Sex</dt><dd>Male</dd>') &&
          capturedReport.includes('<dt>DOB / Age</dt><dd>Jan 2, 1980') &&
          capturedReport.includes('<dt>Location</dt><dd>CZ, 11000</dd>') &&
          capturedReport.includes('<dt>Height</dt><dd>180 cm</dd>') &&
          capturedReport.includes('<dt>Weight</dt><dd>82 kg (May 15, 2026)</dd>') &&
          capturedReport.includes('<dt>BMI</dt><dd>25.3 (May 15, 2026)</dd>') &&
          capturedReport.includes('<dt>Blood pressure</dt><dd>118/76 mmHg (May 15, 2026)</dd>') &&
          capturedReport.includes('<dt>Resting pulse</dt><dd>61 bpm (May 15, 2026)</dd>'));

      capturedReport = '';
      exportModule.exportPDFReport({ preset: 'personal', dateRange: '3m', sections: ['categories'], categoryKeys: null });
      assert('Report date window with no matching lab draws stays empty',
        capturedReport.includes('No lab dates in selected range') && !capturedReport.includes('<h2>Biochemistry</h2>'));

      capturedReport = '';
      S.importedData.diagnoses = {
        conditions: ['CMT 2A (c.T626A,p.L209Q)'],
        familyHistory: [
          { relative: 'father', condition: 'Psoriasis', onsetAge: 18 },
          { relative: 'sibling', condition: 'Epilepsy', onsetAge: 17 },
          { relative: 'paternal_grandfather', condition: "Alzheimer's Disease", onsetAge: 70, note: 'died' }
        ]
      };
      exportModule.exportPDFReport({ preset: 'clinician', dateRange: 'all', sections: ['context'], categoryKeys: null });
      assert('Report medical history formats family history as readable text',
        capturedReport.includes('Father: Psoriasis (onset 18)') &&
          capturedReport.includes('Paternal Grandfather: Alzheimer') &&
          !capturedReport.includes('{"relative"') &&
          !capturedReport.includes('familyHistory:'));

      capturedReport = '';
      S.importedData.genetics = {
        source: 'Unit test',
        importDate: '2026-01-01',
        apoe: 'E3/E4',
        snps: {}
      };
      window._snpTableCache = {};
      exportModule.exportPDFReport({ preset: 'personal', dateRange: 'all', sections: ['summary', 'genetics'], categoryKeys: null });
      assert('Report summary can include genetics without crashing',
        capturedReport.includes('<strong>APOE:</strong> E3/E4'));

      const exportMod = await import('/js/export.js');
      S.importedData.genetics = null;
      S.importedData.supplements = [{
        name: 'Magnesium complex',
        dosage: '2 capsules',
        type: 'supplement',
        startDate: '2026-01-01',
        ingredients: [{ name: 'Magnesium', amount: '100 mg' }],
        timesPerDay: 2
      }];
      const fixtureData = {
        dates: ['2026-01-01', '2026-02-01', '2026-03-01'],
        categories: {
          vitamins: {
            label: 'Vitamins',
            markers: {
              vitaminD: { name: 'Vitamin D', unit: 'ng/mL', refMin: 30, refMax: 100, values: [42, null, undefined] },
              emptyMarker: { name: 'Empty marker', unit: 'mg/L', refMin: 0, refMax: 10, values: [null, null, undefined] }
            }
          }
        }
      };
      const fixtureReport = exportMod.buildReportHTML('Fixture', 'Not specified', fixtureData, [], [], S.importedData.supplements, [], {
        preset: 'full',
        dateRange: 'all',
        sections: ['summary', 'categories', 'supplements']
      });
      assert('Report category table omits all-empty date columns',
        fixtureReport.includes('<th>Jan 1, 2026</th>') &&
          !fixtureReport.includes('<th>Feb 1, 2026</th>') &&
          !fixtureReport.includes('<th>Mar 1, 2026</th>') &&
          !fixtureReport.includes('Empty marker'));
      assert('Report supplement dosage includes ingredient daily total',
        fixtureReport.includes('2 capsules') &&
          fixtureReport.includes('Magnesium 100 mg x 2/day -&gt; 200 mg/day'));
      const aiFixtureReport = exportMod.buildReportHTML('Fixture', 'Not specified', fixtureData, [], [], [], [], {
        preset: 'full',
        dateRange: 'all',
        sections: ['summary'],
        aiSummary: {
          text: 'Patient picture:\nOverall picture is stable <script>alert(1)</script>\n\nDiscussion focus:\n- Review Vitamin D trend with clinician',
          model: 'Unit model',
          generatedAt: '2026-01-01T00:00:00.000Z'
        }
      });
      assert('Report renders escaped practitioner overview near top',
        aiFixtureReport.includes('<h2>Practitioner Overview</h2>') &&
          aiFixtureReport.includes('<p class="report-ai-subhead">Patient picture</p>') &&
          aiFixtureReport.includes('<p class="report-ai-subhead">Discussion focus</p>') &&
          aiFixtureReport.includes('Overall picture is stable &lt;script&gt;alert(1)&lt;/script&gt;') &&
          aiFixtureReport.includes('Review Vitamin D trend with clinician') &&
          aiFixtureReport.includes('Unit model') &&
          !aiFixtureReport.includes('stable <script>alert(1)</script>'));
    } finally {
      S.importedData.notes = originalNotes;
      S.importedData.diagnoses = originalDiagnoses;
      S.importedData.supplements = originalSupplements;
      S.importedData.genetics = originalGenetics;
      S.importedData.biometrics = originalBiometrics;
      S.profileSex = originalProfileSex;
      S.profileDob = originalProfileDob;
      await profile.saveProfiles(originalProfiles);
      window._snpTableCache = originalSnpTable;
      window.open = oldOpen;
    }
  }

  // ═══════════════════════════════════════
  // 15. Demo round-trip — importDataJSON preserves Light & Sun stack
  //
  // Regression for f48638f: importDataJSON was authored before the Light &
  // Sun lens existed and silently dropped sunSessions / deviceSessions /
  // lightDevices / lightEnvironment / lightAudits / lightMeasurements /
  // sunDefaults / sunCorrelations / lifelightProfile / lightDailyVerdicts.
  // The demo file itself was correct; the import path ate everything past
  // manualValues. The test below loads the demo through the real import
  // function and asserts every Light & Sun field landed.
  // ═══════════════════════════════════════
  console.log('%c 15. Demo round-trip through importDataJSON ', 'font-weight:bold;color:#f59e0b');

  {
    // Snapshot then nuke state.importedData so the import has a clean slate.
    const snapshot = JSON.parse(JSON.stringify(S.importedData || {}));
    const profilesBeforeDemoImport = JSON.parse(JSON.stringify(profile.getProfiles() || []));
    const origSex = S.profileSex;
    const origDob = S.profileDob;
    S.importedData = { entries: [], notes: [], supplements: [], healthGoals: [],
      diagnoses: null, diet: null, exercise: null, sleepRest: null,
      lightCircadian: null, stress: null, loveLife: null, environment: null,
      interpretiveLens: '', contextNotes: '', menstrualCycle: null,
      emfAssessment: null, customMarkers: {}, changeHistory: [],
      genetics: null, biometrics: null, manualValues: {},
      sunSessions: [], deviceSessions: [], lightDevices: [],
      lightEnvironment: null, lightMeasurements: [], lightAudits: [],
      sunCorrelations: null, lifelightProfile: null, sunDefaults: null };
    try {
      const demo = await fetch('data/demo-female.json').then(r => r.json());
      const expectedSun       = demo.sunSessions?.length || 0;
      const expectedDevSess   = demo.deviceSessions?.length || 0;
      const expectedDevices   = demo.lightDevices?.length || 0;
      const expectedRooms     = demo.lightEnvironment?.rooms?.length || 0;
      const expectedScreens   = demo.lightEnvironment?.screens?.length || 0;
      const expectedAudits    = demo.lightAudits?.length || 0;
      const expectedMeas      = demo.lightMeasurements?.length || 0;
      const expectedVerdicts  = Object.keys(demo.lightDailyVerdicts || {}).length;
      const expectedSunCoords = demo.sunDefaults?.coords;

      assert('demo source has Light & Sun stack populated',
        expectedSun > 0 && expectedDevices > 0 && expectedRooms > 0,
        `sun=${expectedSun}, devices=${expectedDevices}, rooms=${expectedRooms}`);

      // Demo JSON imports are guarded in product code. Exercise the allowed
      // path by marking the throwaway fixture profile as a demo profile.
      const profiles = profile.getProfiles() || [];
      const activeProfile = profiles.find(p => p.id === S.currentProfile);
      if (activeProfile && !activeProfile.tags?.includes('demo')) {
        activeProfile.tags = Array.from(new Set([...(activeProfile.tags || []), 'demo']));
        await profile.saveProfiles(profiles);
      }

      // importDataJSON consumes a File object via FileReader. Synthesize one.
      const blob = new Blob([JSON.stringify(demo)], { type: 'application/json' });
      const file = new File([blob], 'demo-female.json', { type: 'application/json' });
      await exportModule.importDataJSON(file);

      // FileReader is async — poll the imported state up to 5s for the
      // first Light & Sun field to land.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && (S.importedData?.sunSessions || []).length === 0) {
        await wait(50);
      }

      const got = S.importedData || {};
      assert('sunSessions imported',     (got.sunSessions || []).length === expectedSun,
        `got ${(got.sunSessions || []).length}, expected ${expectedSun}`);
      assert('deviceSessions imported',  (got.deviceSessions || []).length === expectedDevSess,
        `got ${(got.deviceSessions || []).length}, expected ${expectedDevSess}`);
      assert('lightDevices imported',    (got.lightDevices || []).length === expectedDevices,
        `got ${(got.lightDevices || []).length}, expected ${expectedDevices}`);
      assert('lightEnvironment.rooms imported',
        (got.lightEnvironment?.rooms || []).length === expectedRooms,
        `got ${(got.lightEnvironment?.rooms || []).length}, expected ${expectedRooms}`);
      assert('lightEnvironment.screens imported',
        (got.lightEnvironment?.screens || []).length === expectedScreens,
        `got ${(got.lightEnvironment?.screens || []).length}, expected ${expectedScreens}`);
      assert('lightAudits imported',     (got.lightAudits || []).length === expectedAudits,
        `got ${(got.lightAudits || []).length}, expected ${expectedAudits}`);
      assert('lightMeasurements imported', (got.lightMeasurements || []).length === expectedMeas,
        `got ${(got.lightMeasurements || []).length}, expected ${expectedMeas}`);
      assert('lightDailyVerdicts imported',
        Object.keys(got.lightDailyVerdicts || {}).length === expectedVerdicts,
        `got ${Object.keys(got.lightDailyVerdicts || {}).length}, expected ${expectedVerdicts}`);
      // channelMixAI singleton — without it, demo loads with no prefilled
      // channel-mix verdict and the surface auto-fires a provider call.
      assert('channelMixAI imported',
        got.channelMixAI?.status === demo.channelMixAI?.status &&
        got.channelMixAI?.dot === demo.channelMixAI?.dot,
        `got status=${got.channelMixAI?.status} dot=${got.channelMixAI?.dot}, expected status=${demo.channelMixAI?.status} dot=${demo.channelMixAI?.dot}`);

      // Focus card prefill — demo JSONs ship a hand-authored focusCard
      // sibling. The loadDemoData path writes it to per-profile
      // localStorage (importDataJSON deliberately does NOT touch
      // focusCard — that prefill is demo-only by code path). The cache
      // entry intentionally ships with no fingerprint; loadFocusCard
      // treats that as a hand-authored prefill and never auto-refreshes
      // against a live provider.
      assert('demo JSON ships focusCard.text',
        typeof demo.focusCard?.text === 'string' && demo.focusCard.text.length > 50,
        `got ${typeof demo.focusCard?.text} (${demo.focusCard?.text?.length || 0} chars)`);
      const focusCardSrc = await fetch('/js/focus-card.js').then(r => r.text());
      assert('loadFocusCard early-returns when cache has no fingerprint (demo prefill marker)',
        focusCardSrc.includes('if (!cached.fingerprint) return;'),
        'loadFocusCard must skip AI refresh when cached.fingerprint is missing');
      const exportSrcLive = await fetch('/js/export.js').then(r => r.text());
      const exportImportSrcLive = await fetch('/js/export-import.js').then(r => r.text());
      const exportRuntimeSrcLive = await fetch('/js/export-runtime.js').then(r => r.text());
      assert('loadDemoData writes focusCard to localStorage (demo-only by code path)',
        exportSrcLive.includes("profileStorageKey(profileId, 'focusCard')") &&
        /demoJson\??\.focusCard\?\.text/.test(exportSrcLive),
        'demo loader must prefill focus card cache from demo JSON');
      // Slice out just the importDataJSON function body — checking the
      // whole file would false-positive on clearAllData (which legitimately
      // wipes the focusCard cache when the profile is deleted) and on the
      // demo-loader's own comment that explicitly disclaims this guarantee.
      const _importStart = exportImportSrcLive.indexOf('export function importDataJSON');
      const _afterImport = exportImportSrcLive.indexOf('\nasync function _importDatabaseBundle', _importStart + 1);
      const _importBody = _importStart >= 0 && _afterImport > _importStart
        ? exportImportSrcLive.slice(_importStart, _afterImport)
        : '';
      assert('importDataJSON does NOT touch focusCard cache (so non-demo imports are unaffected)',
        _importBody.length > 0 && !_importBody.includes('focusCard'),
        'focus card prefill leaks into the regular JSON-import path');

      // Context health dots prefill — demo JSONs ship dots+summaries for
      // all 9 context cards. The demo loader awaits importDataJSON, then
      // computes live fingerprints (via getCardFingerprint) against the
      // freshly-imported state and writes the cache. Real users get
      // standard AI-generated dots; demo prefill suppresses 9 calls on
      // first dashboard render. No special branch in
      // loadContextHealthDots — the prefilled fingerprints simply
      // already match, so the existing fp === fp check renders cached.
      assert('demo JSON ships contextHealth.dots for all 9 cards',
        demo.contextHealth?.dots && Object.keys(demo.contextHealth.dots).length === 9,
        `got ${Object.keys(demo.contextHealth?.dots || {}).length} cards`);
      const _allDotKeys = ['healthGoals','diagnoses','diet','exercise','sleepRest','lightCircadian','stress','loveLife','environment'];
      const _missingCards = _allDotKeys.filter(k => !demo.contextHealth?.dots?.[k]);
      assert('all 9 context-card keys covered in demo prefill',
        _missingCards.length === 0,
        `missing: ${_missingCards.join(', ')}`);
      assert('all 9 context-card summaries covered in demo prefill',
        _allDotKeys.every(k => typeof demo.contextHealth?.summaries?.[k] === 'string'),
        'every dot must have a paired summary');
      assert('importDataJSON returns a Promise (awaitable)',
        /return new Promise/.test(_importBody),
        'demo loader needs to await importDataJSON before computing fingerprints');
      assert('loadDemoData computes live fingerprints + writes contextHealth cache',
        exportSrcLive.includes("profileStorageKey(profileId, 'contextHealth')") &&
        /getCardFingerprint/.test(exportSrcLive),
        'demo loader must seed the contextHealth localStorage cache');
      const _loadDemoSection = exportSrcLive.split('export async function loadDemoData')[1] || '';
      assert('contextHealth prefill is inside loadDemoData (demo-only by code path)',
        _loadDemoSection.includes("profileStorageKey(profileId, 'contextHealth')"),
        'prefill must live in loadDemoData, not in importDataJSON');
      assert('loadDemoData pre-unlocks Biology Scores without AI provider call',
        _loadDemoSection.includes('buildBiologyScoreContextFingerprintsByRange')
          && _loadDemoSection.includes('biologyScoreContextAI')
          && _loadDemoSection.includes('Demo context checked locally'),
        'demo loader must seed Biology Scores context review locally');
      assert('loadDemoData does not depend on cross-device sync for demo Biology Scores',
        _loadDemoSection.includes('skipInitialSync: true')
          && _loadDemoSection.includes('markDemoLoadingProfile(profileId)')
          && exportRuntimeSrcLive.includes('_demoLoadingProfileId')
          && exportImportSrcLive.includes("reason: 'demo-import'")
          && _loadDemoSection.includes("skipSync: true, reason: 'demo-biology-score-context'"),
        'demo loading must not sync an empty demo profile and wait for pull/rebroadcast to unlock Biology Scores');
      assert('loadDemoData awaits demo import before post-import Biology Scores validation',
        _loadDemoSection.includes('await importDataJSON(demoImportFile)')
          && _loadDemoSection.includes('hasCurrentBiologyScoreContextReview(scoreData)')
          && _loadDemoSection.includes("reason: 'demo-biology-score-context'"),
        'demo loader must recompute the local Biology Scores unlock after the real import path settles');
      assert('importDataJSON imports precomputed Biology Score context review',
        _importBody.includes('json.biologyScoreContextAI') && _importBody.includes('state.importedData.biologyScoreContextAI'),
        'JSON import must preserve the demo Biology Scores unlock');
      assert('importDataJSON does NOT touch contextHealth cache (so non-demo imports are unaffected)',
        _importBody.length > 0 && !_importBody.includes('contextHealth'),
        'context-health prefill leaks into the regular JSON-import path');
      assert('sunDefaults.coords survived (lat)',
        got.sunDefaults?.coords?.lat === expectedSunCoords?.lat,
        `got ${got.sunDefaults?.coords?.lat}, expected ${expectedSunCoords?.lat}`);
      assert('sunDefaults.completedAt survived',
        got.sunDefaults?.completedAt === demo.sunDefaults?.completedAt);
      assert('sunCorrelations imported',
        !!got.sunCorrelations && got.sunCorrelations.weeksAnalyzed === demo.sunCorrelations?.weeksAnalyzed);
      assert('lifelightProfile imported',
        got.lifelightProfile?.chronotype === demo.lifelightProfile?.chronotype);

      // Same-date entries — demo ships TWO entries on 2025-08-05 and
      // 2026-01-25 each (comprehensive panel + specialty add-on like an
      // OmegaQuant run on the same draw day). Earlier draft of the
      // import dedup-by-date silently dropped the second entry, losing
      // every fatty-acid / specialty marker. Verify both panels'
      // markers end up on the surviving merged entry.
      const aug2025 = (got.entries || []).find(e => e.date === '2025-08-05');
      assert('2025-08-05 entry survived merge',
        !!aug2025 && Object.keys(aug2025.markers || {}).length > 0);
      assert('2025-08-05 entry has comprehensive markers',
        !!aug2025?.markers?.['biochemistry.glucose']);
      assert('2025-08-05 entry has specialty (fatty acid) markers',
        !!aug2025?.markers?.['fattyAcids.epaC20_5'],
        'specialty add-on was dropped on import — same-date merge failed');

      // id-keyed dedup — re-importing the same demo shouldn't double sun
      // sessions. This is the merge contract for repeat imports.
      const beforeRepeat = (S.importedData?.sunSessions || []).length;
      const file2 = new File([new Blob([JSON.stringify(demo)], { type: 'application/json' })],
        'demo-female.json', { type: 'application/json' });
      await exportModule.importDataJSON(file2);
      assert('re-importing same demo does NOT duplicate sunSessions',
        (S.importedData?.sunSessions || []).length === beforeRepeat,
        `before=${beforeRepeat}, after=${(S.importedData?.sunSessions || []).length}`);
    } finally {
      // Restore prior state so subsequent tests aren't disturbed.
      S.importedData = snapshot;
      S.profileSex = origSex;
      S.profileDob = origDob;
      await profile.saveProfiles(profilesBeforeDemoImport);
    }
  }

  // ═══════════════════════════════════════
  // 16. Demo prefill — runtime end-to-end (zero AI calls)
  // ═══════════════════════════════════════
  // Source-inspection assertions above prove the prefill code is wired
  // up. This block exercises it end-to-end: call loadDemoData('female'),
  // wait for the dashboard to settle, then verify every prefill landed
  // AND zero AI provider calls fired during the load. Catches:
  //  • importDataJSON unit-conversion drift (e.g. hematocrit fraction →
  //    percent migration shifting fingerprints — the bug that bit us
  //    in the original f714591 build cycle)
  //  • same-date entry merge logic going out of sync between the two
  //    code paths
  //  • someone re-introducing the "navigate fires loadContextHealthDots
  //    before our cache lands" race
  if (typeof exportModule.loadDemoData === 'function') {
    console.log('%c 16. Demo prefill end-to-end (zero AI calls) ', 'font-weight:bold;color:#f59e0b');
    const snapshot2 = JSON.parse(JSON.stringify(S.importedData || {}));
    const origProfile = S.currentProfile;
    const origFetch = window.fetch;
    let aiCallCount = 0;
    const aiCallUrls = [];
    window.fetch = function(url, opts) {
      const u = String(url || '');
      // Match every commonly-used AI provider endpoint shape (incl.
      // local Ollama on 11434). Mirror the regex used in the chrome
      // verification harness so the test stays in sync with manual QA.
      if (/\/api\/(generate|chat|completions)|api\.anthropic|openrouter|venice\.ai|ppq\.ai|11434|claude/i.test(u)) {
        aiCallCount++;
        aiCallUrls.push(u.slice(0, 80));
      }
      return origFetch.apply(this, arguments);
    };
    try {
      await exportModule.loadDemoData('female');
      // Wait long enough for: import resolve → navigate('dashboard') →
      // loadFocusCard + loadContextHealthDots fire-and-forget paths.
      await wait(4000);
      const profileId = S.currentProfile;
      const profileName = profile.getProfiles().find(p => p.id === profileId)?.name;
      assert('Demo profile created with expected name',
        profileName === 'Demo Sarah', `got "${profileName}"`);

      // channelMixAI imported into state (via importDataJSON branch)
      assert('state.importedData.channelMixAI populated after demo load',
        S.importedData?.channelMixAI?.status === 'ok' && S.importedData.channelMixAI.dot,
        `got ${JSON.stringify(S.importedData?.channelMixAI || {}).slice(0, 80)}`);

      // focusCard cache written to localStorage (demo-only path)
      const focusKey = `labcharts-${profileId}-focusCard`;
      const focusRaw = localStorage.getItem(focusKey);
      const focusCached = focusRaw ? JSON.parse(focusRaw) : null;
      assert('focusCard cache prefilled with demo text',
        typeof focusCached?.text === 'string' && focusCached.text.length > 50,
        `got: ${focusCached?.text?.slice(0, 60)}`);
      assert('focusCard prefill ships WITHOUT a fingerprint (loadFocusCard early-return marker)',
        focusCached && !focusCached.fingerprint,
        `unexpected fingerprint: ${focusCached?.fingerprint}`);

      // contextHealth cache written with all 9 dots + matching fingerprints
      const ctxKey = `labcharts-${profileId}-contextHealth`;
      const ctxRaw = localStorage.getItem(ctxKey);
      const ctxCached = ctxRaw ? JSON.parse(ctxRaw) : null;
      const expectedKeys = ['healthGoals','diagnoses','diet','exercise','sleepRest','lightCircadian','stress','loveLife','environment'];
      const cachedDotKeys = Object.keys(ctxCached?.dots || {});
      assert('contextHealth cache has all 9 dot entries',
        expectedKeys.every(k => cachedDotKeys.includes(k)),
        `missing: ${expectedKeys.filter(k => !cachedDotKeys.includes(k)).join(', ')}`);
      assert('contextHealth cache has all 9 summaries',
        expectedKeys.every(k => typeof ctxCached?.summaries?.[k] === 'string'),
        `missing summaries: ${expectedKeys.filter(k => typeof ctxCached?.summaries?.[k] !== 'string').join(', ')}`);
      // Critical: cached fingerprints must match what loadContextHealthDots
      // would compute against the live state. If migrateProfileData /
      // same-date merge drifts, fingerprints diverge and dots fall through
      // to AI fire on next render.
      if (typeof contextCards.getCardFingerprint === 'function') {
        const liveFps = expectedKeys.map(k => ({k, live: contextCards.getCardFingerprint(k), cached: ctxCached?.fingerprints?.[k]}));
        const mismatched = liveFps.filter(x => x.live !== x.cached);
        assert('All 9 cached fingerprints match live fingerprints (proves migration + merge applied correctly)',
          mismatched.length === 0,
          `mismatched: ${mismatched.map(x => x.k).join(', ')}`);
      }

      const bioReview = S.importedData?.biologyScoreContextAI;
      assert('Biology Scores demo context review populated after demo load',
        bioReview?.summary?.includes('Demo context checked locally')
          && bioReview?.updatedAt
          && Array.isArray(bioReview?.unlockedRanges)
          && ['all','1y','6m','3m'].every(range => bioReview.unlockedRanges.includes(range)),
        `got ${JSON.stringify(bioReview || {}).slice(0, 160)}`);
      try {
        const { hasCurrentBiologyScoreContextReview } = await import('../js/biology-score-context-ai.js');
        const scoreData = dataModule.filterDatesByRange?.(dataModule.getActiveData?.() || {}, { fallbackToAll: false }) || dataModule.getActiveData?.() || {};
        assert('Biology Scores demo context review matches live fingerprints',
          hasCurrentBiologyScoreContextReview(scoreData),
          'demo Biology Scores would still show the unlock gate');
      } catch (err) {
        assert('Biology Scores demo context review module import failed', false, err?.message || String(err));
      }

      // Zero AI calls during the demo-load window
      assert('Zero AI provider calls fired during demo load',
        aiCallCount === 0,
        `got ${aiCallCount} calls: ${aiCallUrls.join('; ')}`);
    } finally {
      window.fetch = origFetch;
      // Restore prior state so subsequent tests aren't disturbed.
      S.importedData = snapshot2;
      S.currentProfile = origProfile;
    }
  } else {
    assert('Demo prefill end-to-end test skipped — module loadDemoData unavailable', true);
  }

  // ═══════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════
  console.log(`\n%c Export/Import: ${pass} passed, ${fail} failed `,
    fail > 0
      ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px'
      : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  console.log(`Results: ${pass} passed, ${fail} failed`);
  window.__testResults = { pass, fail };

  } finally {
    // Restore original profile and delete the throwaway
    try {
      const profiles = profile.getProfiles();
      await profile.switchProfile(origProfileId);
      profile.saveProfiles(profiles.filter(p => p.id !== testProfileId));
    } catch (e) {
      console.error('Test cleanup failed:', e);
    }
  }
})();
