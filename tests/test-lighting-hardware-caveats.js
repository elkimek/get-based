// test-lighting-hardware-caveats.js — Guards against the load-bearing
// PWM/TRIAC caveat block being silently dropped from any AI-analysis
// surface. Without these caveats the model recommends "dimmable LED"
// as a flicker fix — which is the #1 cause of household PWM flicker.
//
// Two layers:
//   1. Content — the constant itself contains the canonical strings.
//   2. Wiring  — every importing module both imports AND spreads the
//      constant into a prompt array (catches accidental import-only).
// Run: fetch('tests/test-lighting-hardware-caveats.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; }
    else { fail++; console.error(`FAIL  ${name}` + (detail ? ` — ${detail}` : '')); }
  }

  console.log('%c Lighting Hardware Caveats Tests ', 'background:#f59e0b;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ─── 1. Caveat constant itself contains the canonical strings ────────
  const mod = await import('/js/lighting-hardware-caveats.js?bust=' + Date.now());
  const { LIGHTING_HARDWARE_CAVEATS, LIGHTING_HARDWARE_CAVEATS_TEXT } = mod;

  assert('LIGHTING_HARDWARE_CAVEATS is a non-empty array',
    Array.isArray(LIGHTING_HARDWARE_CAVEATS) && LIGHTING_HARDWARE_CAVEATS.length >= 5);
  assert('LIGHTING_HARDWARE_CAVEATS_TEXT is the joined string',
    typeof LIGHTING_HARDWARE_CAVEATS_TEXT === 'string' &&
    LIGHTING_HARDWARE_CAVEATS_TEXT.includes(LIGHTING_HARDWARE_CAVEATS[0]));

  // Canonical claims that MUST survive any future edit. These are the
  // load-bearing ones — if any disappears, the prompt loses a guarantee
  // the model relies on.
  const canonical = [
    { name: 'mentions PWM',                   needle: /\bPWM\b/ },
    { name: 'mentions TRIAC',                 needle: /\bTRIAC\b/ },
    { name: 'flags dimmable LED as #1 PWM',   needle: /dimmable LEDs? .*#?1.*(PWM|flicker)/i },
    { name: 'mentions flicker scoring',       needle: /flicker/i },
    { name: 'mentions non-dimming alternatives (incandescent OR halogen)',
                                              needle: /\b(incandescent|halogen)\b/i },
    { name: 'mentions blackout / light-blocking for sleep rooms',
                                              needle: /\b(blackout|light-blocking|tap(e|ing))\b/i },
  ];
  for (const c of canonical) {
    assert(`Caveat block ${c.name}`, c.needle.test(LIGHTING_HARDWARE_CAVEATS_TEXT));
  }

  // Each line should be a non-empty string — guards against an array
  // half-deleted during refactor.
  let bad = LIGHTING_HARDWARE_CAVEATS.filter(s => typeof s !== 'string' || s.length === 0);
  assert('Every caveat entry is a non-empty string', bad.length === 0,
    `bad entries: ${bad.length}`);

  // ─── 2. Every importer wires the constant into its prompt ────────────
  // Static check — fetch each module's source and assert that:
  //   (a) it imports LIGHTING_HARDWARE_CAVEATS (or _TEXT),
  //   (b) it spreads / includes the constant somewhere (not just imported
  //       and then dropped).
  // The 7 importing AI-analysis modules. These are listed in CLAUDE.md
  // memory + audited regularly; if a new AI surface is added that
  // recommends fixtures, it MUST be added here.
  const importers = [
    'js/light-audit-ai-analysis.js',
    'js/light-burden-ai-analysis.js',
    'js/light-screen-ai-analysis.js',
    'js/light-today-ai.js',
    'js/light-env-ai-analysis.js',
    'js/sun-onboarding-ai.js',
    'js/light-tools-ai-analysis.js',
  ];

  for (const path of importers) {
    let src;
    try { src = await fetch('/' + path + '?bust=' + Date.now()).then(r => r.text()); }
    catch (e) { src = ''; }
    assert(`${path} loads`, src && src.length > 0);
    if (!src) continue;

    const importsConst = /import\s*\{[^}]*\bLIGHTING_HARDWARE_CAVEATS(?:_TEXT)?\b[^}]*\}\s*from\s*['"]\.\/lighting-hardware-caveats\.js['"]/.test(src);
    assert(`${path} imports LIGHTING_HARDWARE_CAVEATS`, importsConst);

    const usesConst = /\.\.\.LIGHTING_HARDWARE_CAVEATS\b|LIGHTING_HARDWARE_CAVEATS_TEXT\b/.test(src);
    assert(`${path} actually uses the imported caveats (spread or _TEXT splice)`, usesConst);
  }

  console.log(`%c ${pass} passed, ${fail} failed, ${pass + fail} total`,
    fail === 0 ? 'color:#22c55e' : 'color:#ef4444');
})();
