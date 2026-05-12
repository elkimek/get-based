// test-audit.js — Verify pre-release audit fixes
// Run: fetch('tests/test-audit.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Pre-Release Audit Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ═══════════════════════════════════════
  // 1. PhenoAge SI coefficients (CRITICAL)
  // ═══════════════════════════════════════
  console.log('%c 1. PhenoAge SI Coefficients ', 'font-weight:bold;color:#f59e0b');

  const dataSrc = await fetchWithRetry('js/data.js');
  assert('PhenoAge uses SI albumin directly', dataSrc.includes('0.0336  * albumin_si'));
  assert('PhenoAge uses SI creatinine directly', dataSrc.includes('0.0095  * creatinine_si'));
  assert('PhenoAge uses SI glucose directly', dataSrc.includes('0.1953  * glucose_si'));
  assert('PhenoAge uses SI lymphocytes directly', dataSrc.includes('0.0120  * lymphPct_si'));
  assert('PhenoAge uses SI ALP directly', dataSrc.includes('0.00188 * alp_si'));

  // ═══════════════════════════════════════
  // 2. Service Worker registration (CRITICAL)
  // ═══════════════════════════════════════
  console.log('%c 2. Service Worker Registration ', 'font-weight:bold;color:#f59e0b');

  const indexSrc = await fetchWithRetry('/app');
  assert('SW registration uses absolute path', indexSrc.includes("'/service-worker.js'") || indexSrc.includes('"/service-worker.js"'));
  assert('SW registration has catch handler', indexSrc.includes('.catch('));
  const swAuditSrc = await fetchWithRetry('service-worker.js');
  assert('SW uses importScripts for version', swAuditSrc.includes("importScripts('/version.js')"));
  assert('SW CACHE_NAME uses semver', swAuditSrc.includes('`labcharts-v${self.APP_VERSION}`'));
  assert('Umami analytics script present (self-hosted)', indexSrc.includes('umami-iota-olive.vercel.app/script.js'));
  assert('Umami blocked on file:// protocol', /location\.protocol\s*!==\s*['"]file:['"]/.test(indexSrc));

  // ═══════════════════════════════════════
  // 3. XSS: escapeHTML in views.js
  // ═══════════════════════════════════════
  console.log('%c 3. XSS Prevention ', 'font-weight:bold;color:#f59e0b');

  const viewsSrc = await fetchWithRetry('js/views.js');
  assert('Trend alert name escaped', viewsSrc.includes('escapeHTML(alert.name)'));
  assert('Trend alert category escaped', viewsSrc.includes('escapeHTML(alert.category)'));
  assert('Flagged marker name escaped', /escapeHTML\(f\.name\)/.test(viewsSrc));
  assert('Category label escaped in header', viewsSrc.includes('escapeHTML(cat.label)'));
  assert('marker.unit escaped in detail modal', /escapeHTML\(marker\.unit\)/.test(viewsSrc));
  assert('Correlation option names escaped', /escapeHTML\(marker\.name\)/.test(viewsSrc));

  const chatSrc = await fetchWithRetry('js/chat.js');
  const markdownSrc = await fetchWithRetry('js/markdown.js');
  assert('Markdown URL has quote escaping', markdownSrc.includes('.replace(/"/g, \'&quot;\')'));
  assert('Clipboard has navigator.clipboard guard', chatSrc.includes('if (!navigator.clipboard)'));

  // ═══════════════════════════════════════
  // 3b. XSS — marker-key allowlist on inline-onclick interpolation sites
  // ═══════════════════════════════════════
  // PDF AI extraction is sanitized at the parse boundary by _sanitizeAIMarker,
  // but legacy data and sync pulls can still feed unsafe keys into views.js
  // — five entry points interpolate keys into onclick="…('${id}')" handlers.
  // safeMarkerId in utils.js gates each one. If a refactor removes the guard
  // wiring, the helper test stays green but the actual defense disappears —
  // pin the wiring here.
  console.log('%c 3b. Marker-key allowlist guards ', 'font-weight:bold;color:#f59e0b');

  const utilsXssSrc = await fetchWithRetry('js/utils.js');
  assert('utils.js exports safeMarkerId',
    /export\s+function\s+safeMarkerId\s*\(/.test(utilsXssSrc));
  assert('safeMarkerId proto-pollution guard set covers __proto__/constructor/prototype',
    /_PROTO_PARTS\s*=\s*new\s+Set\s*\(\s*\[\s*['"]__proto__['"]\s*,\s*['"]constructor['"]\s*,\s*['"]prototype['"]\s*\]\s*\)/.test(utilsXssSrc));
  assert('views.js imports safeMarkerId from utils',
    /import\s*\{[^}]*\bsafeMarkerId\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/.test(viewsSrc));
  assert('showCategory guards on safeMarkerId(categoryKey) at function entry',
    /export function showCategory[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(categoryKey\)\s*\)\s*return/.test(viewsSrc));
  assert('switchView guards on safeMarkerId(categoryKey) at function entry',
    /export function switchView[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(categoryKey\)\s*\)\s*return/.test(viewsSrc));
  assert('showDetailModal guards on safeMarkerId(id) at function entry',
    /export function showDetailModal[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(id\)\s*\)\s*return/.test(viewsSrc));
  assert('renderChartCard returns "" on unsafe id (chokepoint for dashboard + category)',
    /export function renderChartCard[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(id\)\s*\)\s*return\s*''/.test(viewsSrc));
  assert('renderFattyAcidsView returns "" on unsafe categoryKey',
    /export function renderFattyAcidsView[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(categoryKey\)\s*\)\s*return\s*''/.test(viewsSrc));
  // Inner-loop per-key filter on category chart-cards path
  assert('showCategory chart-cards loop skips legacy customMarkers with unsafe keys',
    /for\s*\(\s*const\s*\[\s*key\s*,\s*marker\s*\]\s+of\s+withData\s*\)\s*\{\s*[\s\S]{0,200}if\s*\(\s*!safeMarkerId\(key\)\s*\)\s*continue/.test(viewsSrc));

  // Functional: prove the guards actually no-op on adversarial input.
  // Need at least one navigation target so a "did anything change?" check
  // is meaningful. Use a known-safe categoryKey for the control.
  if (window.showCategory && window._labState?.importedData) {
    window.showCategory('biochemistry');
    await new Promise(r => setTimeout(r, 50));
    const beforeHeading = document.querySelector('.category-header h2')?.textContent || null;
    if (beforeHeading) {
      window.showCategory("hormones');alert(1);//");
      await new Promise(r => setTimeout(r, 30));
      assert('showCategory no-ops on quote-injection categoryKey (heading unchanged)',
        document.querySelector('.category-header h2')?.textContent === beforeHeading);
      window.showCategory('__proto__');
      await new Promise(r => setTimeout(r, 30));
      assert('showCategory no-ops on __proto__ categoryKey (heading unchanged)',
        document.querySelector('.category-header h2')?.textContent === beforeHeading);
    }
    const overlay = document.getElementById('modal-overlay');
    const openBefore = !!overlay?.classList.contains('show');
    window.showDetailModal("biochemistry_glucose');alert(2);//");
    await new Promise(r => setTimeout(r, 30));
    assert('showDetailModal does not open on quote-injection id',
      !!overlay?.classList.contains('show') === openBefore);
    assert('renderChartCard returns "" on quote-injection id',
      window.renderChartCard("foo';evil('", { name: 'x', values: [1] }, ['2025-01-01']) === '');
    const safeRender = window.renderChartCard('biochemistry_glucose', { name: 'Glucose', values: [5] }, ['2025-01-01']) || '';
    assert('renderChartCard returns valid HTML on safe id',
      safeRender.includes('biochemistry_glucose') && safeRender.includes('chart-card'));
  }

  // ═══════════════════════════════════════
  // 4. Division by zero guards (utils.js)
  // ═══════════════════════════════════════
  console.log('%c 4. Division by Zero Guards ', 'font-weight:bold;color:#f59e0b');

  const utilsSrc = await fetchWithRetry('js/utils.js');
  assert('getRangePosition guards refMax === refMin', utilsSrc.includes('refMax === refMin'));
  assert('getTrend guards prev === 0', utilsSrc.includes('prev === 0'));

  // ═══════════════════════════════════════
  // 5. CSS variable fixes
  // ═══════════════════════════════════════
  console.log('%c 5. CSS Variable Fixes ', 'font-weight:bold;color:#f59e0b');

  const cssSrc = await fetchWithRetry('styles.css');
  assert('No var(--card-bg) reference', !cssSrc.includes('var(--card-bg)'));
  assert('No var(--text) without suffix', !/(var\(--text\))(?!-)/.test(cssSrc));
  assert('Dead overview-grid CSS removed', !cssSrc.includes('.overview-grid'));
  assert('Dead overview-card CSS removed', !cssSrc.includes('.overview-card'));

  // ═══════════════════════════════════════
  // 6. Data integrity fixes
  // ═══════════════════════════════════════
  console.log('%c 6. Data Integrity ', 'font-weight:bold;color:#f59e0b');

  assert('Ferritin lookup uses iron category', dataSrc.includes("'iron','ferritin'") && !dataSrc.includes("'hematology','ferritin'"));
  assert('Unit conversion guards null refMin', dataSrc.includes('if (marker.refMin != null) marker.refMin = parseFloat'));
  assert('Unit conversion guards null refMax', dataSrc.includes('if (marker.refMax != null) marker.refMax = parseFloat'));

  const schemaSrc = await fetchWithRetry('js/schema.js');
  // Check apoAI optimalMax <= refMax
  const apoMatch = schemaSrc.match(/lipids\.apoAI.*?optimalMax:\s*([\d.]+)/);
  if (apoMatch) {
    const apoOptMax = parseFloat(apoMatch[1]);
    assert('apoAI optimalMax <= refMax (1.70)', apoOptMax <= 1.70, `optimalMax = ${apoOptMax}`);
  }

  // ═══════════════════════════════════════
  // 7. Error handling
  // ═══════════════════════════════════════
  console.log('%c 7. Error Handling ', 'font-weight:bold;color:#f59e0b');

  const apiSrc = await fetchWithRetry('js/api.js');
  assert('Venice models JSON.parse guarded', apiSrc.includes("try { cached = JSON.parse(localStorage.getItem('labcharts-venice-models')"));
  assert('OpenRouter models JSON.parse guarded', apiSrc.includes("try { cached = JSON.parse(localStorage.getItem('labcharts-openrouter-models')"));
  assert('OpenRouter pricing JSON.parse guarded', apiSrc.includes("try { cached = JSON.parse(localStorage.getItem('labcharts-openrouter-pricing')"));

  const exportSrc = await fetchWithRetry('js/export.js');
  assert('PDF report null popup guard', exportSrc.includes('if (!win)'));
  assert('PDF report context serialization', exportSrc.includes('fmtCtx'));

  const pdfSrc = await fetchWithRetry('js/pdf-import.js');
  assert('NaN markers filtered out', pdfSrc.includes('filter(m => !isNaN(m.value))'));

  // ═══════════════════════════════════════
  // 8. Duplicate code cleanup
  // ═══════════════════════════════════════
  console.log('%c 8. Code Cleanup ', 'font-weight:bold;color:#f59e0b');

  assert('pdf-import.js imports formatCost from schema', pdfSrc.includes('formatCost') && pdfSrc.includes("from './schema.js'"));
  const localFormatCost = pdfSrc.match(/^function formatCost/m);
  assert('pdf-import.js no local formatCost', !localFormatCost);

  // ═══════════════════════════════════════
  // 9. OpenRouter curated prefixes
  // ═══════════════════════════════════════
  console.log('%c 9. OpenRouter Curated List ', 'font-weight:bold;color:#f59e0b');

  const curatedMatch = apiSrc.match(/OPENROUTER_CURATED\s*=\s*\[([\s\S]*?)\]/);
  if (curatedMatch) {
    const curated = curatedMatch[1];
    assert('Curated uses anthropic/claude- prefix (no dots in version)', !curated.includes('claude-sonnet-4.6') && !curated.includes('claude-opus-4.6'));
    assert('Curated has anthropic prefix', curated.includes('anthropic/'));
    assert('Curated has google prefix', curated.includes('google/'));
    assert('Curated has x-ai prefix', curated.includes('x-ai/'));
  }

  // ═══════════════════════════════════════
  // 10. Accessibility
  // ═══════════════════════════════════════
  console.log('%c 10. Accessibility ', 'font-weight:bold;color:#f59e0b');

  assert('Skip-to-content link exists', indexSrc.includes('class="skip-link"'));
  assert('Skip link targets #main-content', indexSrc.includes('href="#main-content"'));
  assert('Skip link CSS', cssSrc.includes('.skip-link'));

  const navSrc = await fetchWithRetry('js/nav.js');
  assert('Nav items have tabindex', navSrc.includes('tabindex="0"'));
  assert('Nav items have role=button', navSrc.includes('role="button"'));
  assert('Nav items have keyboard handler', navSrc.includes('onkeydown'));
  assert('Category labels escaped in sidebar', navSrc.includes('escapeHTML(label)') || navSrc.includes('escapeHTML(cat.label)'));

  const mainSrc = await fetchWithRetry('js/main.js');
  assert('Focus trap for modals', mainSrc.includes('e.key === "Tab"') && mainSrc.includes('focusable'));

  // ═══════════════════════════════════════
  // 11. Event listener leak fix
  // ═══════════════════════════════════════
  console.log('%c 11. Event Listener Leak Fix ', 'font-weight:bold;color:#f59e0b');

  const ctxSrc = await fetchWithRetry('js/context-cards.js');
  assert('Diagnoses editor removes old listener before adding', ctxSrc.includes('document.removeEventListener(\'click\', closeSuggestionsOnClickOutside)'));

  // ═══════════════════════════════════════
  // 12. Cycle stats NaN guard
  // ═══════════════════════════════════════
  console.log('%c 12. Cycle Stats Guard ', 'font-weight:bold;color:#f59e0b');

  const cycleSrc = await fetchWithRetry('js/cycle.js');
  assert('Cycle stats filters periods with endDate', cycleSrc.includes('filter(p => p.endDate)'));
  assert('Period length guards empty array', cycleSrc.includes('if (periodLengths.length > 0)'));

  // ═══════════════════════════════════════
  // 13. Security Headers (CSP)
  // ═══════════════════════════════════════
  console.log('%c 13. Security Headers ', 'font-weight:bold;color:#f59e0b');

  const vercelSrc = await fetchWithRetry('/vercel.json');
  assert('CSP header in vercel.json', vercelSrc.includes('Content-Security-Policy'));
  // cdn.jsdelivr.net is the only remote script source — transformers.js
  // ESM bundle can't be vendored yet (bare-specifier rewrite requires a
  // bundler pass, phase 2c). Google Fonts + vendor bundles are local.
  assert('CSP has no external CDN beyond jsdelivr (for transformers.js)',
    !vercelSrc.includes('fonts.googleapis.com') && !vercelSrc.includes('unpkg.com'));
  assert('CSP allows cdn.jsdelivr.net in script-src (transformers.js)',
    vercelSrc.includes('https://cdn.jsdelivr.net'));
  // ONNX Runtime (used inside transformers.js) spawns its proxy worker
  // from a blob: URL and dynamic-imports it as a script. script-src
  // MUST include blob: or the lens silently fails to init in prod with
  // "No available backend found".
  assert('CSP script-src includes blob: (required by ORT proxy worker)',
    /script-src[^;]*\bblob:/.test(vercelSrc));
  // Cross-origin isolation: required so the in-browser lens worker can
  // use SharedArrayBuffer + multi-threaded WASM. Without these headers
  // ORT silently falls back to single-threaded WASM (~7× slower) and
  // WebGPU adapter access can also fail. Must match dev-server.js so
  // localhost behavior matches prod.
  assert('Vercel sends Cross-Origin-Opener-Policy: same-origin',
    /"Cross-Origin-Opener-Policy"\s*:\s*"same-origin"/.test(vercelSrc));
  assert('Vercel sends Cross-Origin-Embedder-Policy: credentialless',
    /"Cross-Origin-Embedder-Policy"\s*:\s*"credentialless"/.test(vercelSrc));
  // No Permissions-Policy header — dev-server doesn't send one either,
  // and an explicit Permissions-Policy header (even granting
  // webgpu=(self) explicitly) was observed to suppress WebGPU adapter
  // access in Workers on Vercel, dropping the lens to WASM-only. Our
  // app doesn't use camera/mic/geolocation so the previous restrictive
  // policy wasn't load-bearing — removing it matches dev-server and
  // unblocks WebGPU on prod.
  assert('No Permissions-Policy header (matches dev-server)',
    !/"Permissions-Policy"/.test(vercelSrc));
  assert('CSP connect-src allows https: (decentralized nodes)', vercelSrc.includes("connect-src 'self' https:"));
  assert('CSP allows localhost for Local AI', vercelSrc.includes('localhost:*'));
  assert('X-Frame-Options DENY', vercelSrc.includes('DENY'));
  assert('X-Content-Type-Options nosniff', vercelSrc.includes('nosniff'));

  // ═══════════════════════════════════════
  // 14. Aria-live & Screen Reader
  // ═══════════════════════════════════════
  console.log('%c 14. Aria-live & Screen Reader ', 'font-weight:bold;color:#f59e0b');

  assert('Notification container has aria-live', indexSrc.includes('aria-live="polite"'));
  assert('Notification container has role=status', indexSrc.includes('role="status"'));
  const utilsSrc2 = await fetchWithRetry('js/utils.js');
  assert('Error toasts get role=alert', utilsSrc2.includes("role', 'alert'"));
  assert('Confirm dialog has role=alertdialog', utilsSrc2.includes('role="alertdialog"'));

  // ═══════════════════════════════════════
  // 15. Colorblind Accessibility
  // ═══════════════════════════════════════
  console.log('%c 15. Colorblind Accessibility ', 'font-weight:bold;color:#f59e0b');

  assert('Chart card val-high has ::before arrow', cssSrc.includes('.chart-value-num.val-high::before'));
  assert('Chart card val-low has ::before arrow', cssSrc.includes('.chart-value-num.val-low::before'));
  assert('Table val-high has ::before arrow', cssSrc.includes('.data-table .value-cell.val-high::before'));
  assert('Table val-low has ::before arrow', cssSrc.includes('.data-table .value-cell.val-low::before'));
  assert('Heatmap high has ::before', cssSrc.includes('.heatmap-high::before'));
  assert('Heatmap low has ::before', cssSrc.includes('.heatmap-low::before'));
  assert('Compare improved has ::before', cssSrc.includes('.compare-improved::before'));
  assert('Compare worsened has ::before', cssSrc.includes('.compare-worsened::before'));
  assert('Range bar high has glow', cssSrc.includes('.range-bar-marker.marker-high') && cssSrc.includes('box-shadow'));
  assert('Health dot yellow has glow', cssSrc.includes('.ctx-health-dot-yellow') && cssSrc.includes('box-shadow'));
  assert('Health dot red has glow', cssSrc.includes('.ctx-health-dot-red') && cssSrc.includes('box-shadow'));

  const chartsSrc = await fetchWithRetry('js/charts.js');
  assert('Chart.js pointStyle per status', chartsSrc.includes('ptStyles') && chartsSrc.includes('pointStyle'));

  const ctxSrc2 = await fetchWithRetry('js/context-cards.js');
  assert('Health dots have title attribute', ctxSrc2.includes('dot.title'));
  assert('Health dots have aria-label', ctxSrc2.includes("dot.setAttribute('aria-label'"));
  assert('AI tips have severity prefix', ctxSrc2.includes('prefixes'));

  const exportSrc2 = await fetchWithRetry('js/export.js');
  assert('PDF report values have status prefix', exportSrc2.includes('sPrefix'));

  // ═══════════════════════════════════════
  // 16. Context Assembly Pipeline
  // ═══════════════════════════════════════
  console.log('%c 16. Context Assembly Pipeline ', 'font-weight:bold;color:#f59e0b');

  const labCtxSrc = await fetchWithRetry('js/lab-context.js');

  // buildLabContext enriched header
  assert('buildLabContext has age computation', labCtxSrc.includes('Math.floor((new Date() - new Date(state.profileDob))'));
  assert('buildLabContext has today ISO date', labCtxSrc.includes("new Date().toISOString().slice(0, 10)"));
  assert('buildLabContext has unit system label', labCtxSrc.includes("unit system: ${unitLabel}"));
  assert('buildLabContext has fmtDate helper', labCtxSrc.includes("const fmtDate = d => new Date(d + 'T00:00:00')"));

  // Section ordering: goals before lab values, lab values before lifestyle
  const goalsIdx = labCtxSrc.indexOf('## Health Goals (Things to Solve)');
  const labValuesIdx = labCtxSrc.indexOf('## ${cat.label}');
  const dietIdx = labCtxSrc.indexOf('## Diet\\n');
  const flaggedIdx = labCtxSrc.indexOf('## Flagged Results (Latest)');
  const notesIdx = labCtxSrc.indexOf('## User Notes');
  const diagIdx = labCtxSrc.indexOf('## Medical History / Diagnoses');
  // Goals should appear before diet in the source (section ordering)
  assert('Health Goals section before Diet section', labCtxSrc.indexOf('## Health Goals') < labCtxSrc.indexOf('## Diet'));
  assert('Interpretive Lens before lab values', labCtxSrc.indexOf('Interpretive Lens') < labCtxSrc.indexOf('${cat.label}'));

  // Staleness signals (global + per-category)
  assert('buildLabContext has global staleness daysSince', labCtxSrc.includes('daysSince'));
  assert('buildLabContext has global staleness months ago', labCtxSrc.includes('months ago'));
  assert('buildLabContext has per-category staleness', labCtxSrc.includes('catDaysSince') && labCtxSrc.includes('catMonthsAgo'));
  assert('Per-category staleness uses warning marker', labCtxSrc.includes('⚠ Last tested'));
  assert('buildFocusContext has last labs date', viewsSrc.includes('last labs'));

  // Auto-gating: 7 cards use hasCardContent(), 4 have custom logic
  const hccCount = (labCtxSrc.match(/hasCardContent\(/g) || []).length;
  assert('lab-context.js uses hasCardContent for 7 card gates', hccCount >= 7, `found ${hccCount}`);
  assert('lab-context.js imports hasCardContent', labCtxSrc.includes("hasCardContent") && labCtxSrc.includes("from './utils.js'"));
  assert('Diagnoses uses hasCardContent', labCtxSrc.includes('hasCardContent(diag)'));
  assert('Diet uses hasCardContent', labCtxSrc.includes('hasCardContent(diet)'));
  assert('Exercise uses hasCardContent', labCtxSrc.includes('hasCardContent(ex)'));
  assert('Sleep uses hasCardContent', labCtxSrc.includes('hasCardContent(sl)'));
  assert('Stress uses hasCardContent', labCtxSrc.includes('hasCardContent(st)'));
  assert('LoveLife uses hasCardContent', labCtxSrc.includes('hasCardContent(ll)'));
  assert('Environment uses hasCardContent', labCtxSrc.includes('hasCardContent(env)'));
  // Light & Circadian still uses custom gate (external latitude data)
  assert('Light still uses lc || autoLat gate', labCtxSrc.includes('lc || autoLat'));
  // hasCardContent in utils.js
  const utilsSrc3 = await fetchWithRetry('js/utils.js');
  assert('hasCardContent exported from utils.js', utilsSrc3.includes('export function hasCardContent'));

  // System prompt restructure
  const constSrc = await fetchWithRetry('js/constants.js');

  // System prompt staleness + absent field instructions
  assert('System prompt has per-category staleness instruction', constSrc.includes('stale data') && constSrc.includes('recommend retesting'));
  assert('System prompt has absent field instruction', constSrc.includes('did not provide'));
  assert('System prompt has absent section instruction', constSrc.includes('has not filled in'));

  assert('System prompt has Core Rules section', constSrc.includes('## Core Rules'));
  assert('System prompt has Priority Context section', constSrc.includes('## Priority Context'));
  assert('System prompt has Lifestyle Context section', constSrc.includes('## Lifestyle Context'));
  assert('System prompt has cortisol cross-cutting note', constSrc.includes('cortisol/HPA axis'));
  assert('System prompt has Style section', constSrc.includes('## Style'));
  assert('Health goals at top of Priority Context', constSrc.indexOf('Health goals:') < constSrc.indexOf('Medical conditions:'));

  // Persona after data in chat prompt
  assert('Persona placed after lab data', chatSrc.includes("'\\n\\nCurrent lab data:\\n' + labContext + personalityPrompt"));

  // Focus card lightweight context
  assert('buildFocusContext exists in views.js', viewsSrc.includes('function buildFocusContext()'));
  assert('Focus card uses buildFocusContext', viewsSrc.includes('buildFocusContext()'));
  assert('Focus card context-aware system prompt', viewsSrc.includes("this person's goals/conditions"));

  // askAIAboutMarker uses actual reference range (not effective/optimal)
  assert('askAIAboutMarker uses marker.refMin/refMax', chatSrc.includes('${marker.refMin}') && chatSrc.includes('${marker.refMax}'));
  assert('askAIAboutMarker has trend direction', chatSrc.includes("Trend: ${dir}"));

  // JSON.parse guard in health dots
  assert('Health dots JSON.parse has try-catch', ctxSrc.includes('try { parsed = JSON.parse(jsonMatch[0])'));

  // PDF import WBC rule position
  assert('WBC rule at position 5 (before Skip non-numeric)', pdfSrc.indexOf('differential WBC') < pdfSrc.indexOf('Skip non-numeric'));
  assert('PDF import includes filename in user message', pdfSrc.includes("(file: ' + fileName"));

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
  console.log(`\n%c Results: ${pass} passed, ${fail} failed `, `background:${fail?'#ef4444':'#22c55e'};color:#fff;font-size:14px;padding:4px 12px;border-radius:4px`);
})();
