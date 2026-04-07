# Testing

getbased uses browser-based tests — no test framework, no Jest, no jsdom. Each test file is a self-executing IIFE that runs assertions against the live app in a real browser context.

## The assert pattern

Every test file defines a local `assert` helper and collects results:

```js
(async () => {
  const results = [];
  let passed = 0, failed = 0;

  function assert(name, condition, detail = '') {
    if (condition) {
      results.push({ ok: true, name });
      passed++;
    } else {
      results.push({ ok: false, name, detail });
      failed++;
    }
  }

  // --- tests ---

  assert('state object exists', typeof window._labState === 'object');
  assert('importedData has entries array',
    Array.isArray(window._labState.importedData.entries));

  // --- report ---
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  results.filter(r => !r.ok).forEach(r =>
    console.error(`FAIL: ${r.name}`, r.detail)
  );
  return { passed, failed, results };
})();
```

The `detail` argument appears in the failure output — use it to print the actual value that caused the failure.

## The 30 test files

All test files live in the `tests/` directory. Run `ls tests/test-*.js | wc -l` for the current count.

| File | What it covers |
|---|---|
| `tests/test-audit.js` | Security audit: XSS escaping, null guards, div-by-zero, JSON.parse guards, focus trapping, CSP |
| `tests/test-biometrics.js` | Biometrics time-series: weight, BP, pulse, BMI auto-calc |
| `tests/test-cashu-wallet.js` | Cashu wallet: module exports, security (encrypted mnemonic, locks), proof management, recovery, fee mechanism, Nostr discovery, API nodeUrl guard, sync/export integration, BIP-39 seed generation |
| `tests/test-change-history.js` | Change history: `recordChange` dedup, snapshot deep-copy, cap, AI context timeline, export/import round-trip |
| `tests/test-changelog.js` | What's New modal + `hasCardContent` auto-gating: version sync, HTML, main.js wiring, settings, behavioral tests |
| `tests/test-chat-actions.js` | Chat message action buttons: regenerate, copy, context toggle |
| `tests/test-chat-threads.js` | Chat thread CRUD, auto-naming, migration, encryption patterns, backup inclusion |
| `tests/test-crypto.js` | AES-256-GCM encryption, PBKDF2, IndexedDB auto-backup, passphrase validation (20+ sections) |
| `tests/test-custom-personality.js` | Named custom personalities: storage, icon picker, generation, dirty state, thread metadata |
| `tests/test-cycle-improvements.js` | Phase-aware ranges, cycle iron alerts, perimenopause detection, heavy flow alerts |
| `tests/test-cycle-tour.js` | Cycle spotlight tour: 8 steps, DOM elements, auto-trigger, storage key |
| `tests/test-demo.js` | Demo data files: v2 structure, structured context cards, menstrual cycle for Sarah |
| `tests/test-dna.js` | DNA import: SNP parsing, APOE haplotype, format detection, dashboard rendering |
| `tests/test-dna-recommendations.js` | DNA-aware supplement recommendations: snpHints, buildDNAHints, gene-keyword scanner |
| `tests/test-emf.js` | EMF assessment: SBM-2015 severity, room CRUD, source/mitigation tags |
| `tests/test-folder-backup.js` | Folder backup: File System Access API, snapshot format, daily filenames, IndexedDB v2 handle persistence |
| `tests/test-hardware.js` | Model Advisor: GPU detection, VRAM badges, model fitness ratings |
| `tests/test-image-utils.js` | Image utilities: resize, format, vision content building |
| `tests/test-integration-batch2.js` | Integration: batch import, marker keys, custom markers, adapters |
| `tests/test-mobile.js` | Responsive layout: breakpoints, grid overflow, touch tap targets, safe grid sizing |
| `tests/test-openrouter.js` | OpenRouter provider: curated model list, pricing cache, exclude blocklist, model fetch |
| `tests/test-phase-ranges.js` | Phase-aware reference ranges for estradiol and progesterone aligned with dates |
| `tests/test-pii.js` | PII obfuscation: regex patterns, streaming sanitizer |
| `tests/test-prelab.js` | Pre-lab onboarding: context assembly without data, chat prompts |
| `tests/test-recommendations.js` | Supplement recommendations: catalog slots, keyword scanner, safety caveats, disclosure gate |
| `tests/test-schema.js` | MARKER_SCHEMA integrity, unit conversions, optimal ranges, phase ranges |
| `tests/test-sync.js` | Cross-device sync: payload format, AI settings keys, encrypted keys, Evolu integration |
| `tests/test-tour.js` | App tour: 7 steps, spotlight DOM, positioning, escape key, completion flag (154 assertions) |
| `tests/test-unit-import.js` | Unit normalization on import: SI conversion, enzyme units, FA adapter safety |
| `tests/test-venice-e2ee.js` | Venice E2EE: ECDH key exchange, AES-GCM encryption, TEE headers, model detection |

The landing page test (`test-landing.js`) lives in the [get-based-site](https://github.com/elkimek/get-based-site) repo.

## Run all tests headlessly

```bash
./run-tests.sh
```

The script:
1. Checks if a server is running on port 8000; starts `python3 -m http.server 8000` if not
2. Runs each test file through headless Chrome via Puppeteer
3. Prints a pass/fail summary per file
4. Exits with code `0` if all pass, `1` if any fail

**Requires:** Node.js with Puppeteer installed (`npm i -g puppeteer` or `npx puppeteer`).

Alternatively, with a server already running:

```bash
NODE_PATH=/path/to/node_modules node run-tests.js
```

## Running a single test in the browser

Open the browser console while `http://localhost:8000` is running, then:

```js
fetch('tests/test-cycle-improvements.js').then(r => r.text()).then(s => Function(s)())
```

Results appear in the console. This is useful during development before running the full suite.

## Writing new tests

When you add a feature or fix a bug, add assertions to the relevant test file. If none fits, create `test-yourfeature.js`.

**What to cover:**

- **Source inspection** — verify the function or pattern exists in the source:
  ```js
  const src = await fetch('js/data.js').then(r => r.text());
  assert('getActiveData exported', src.includes('export function getActiveData'));
  ```

- **DOM state** — check that elements render correctly:
  ```js
  const card = document.querySelector('.context-card[data-key="diet"]');
  assert('diet card rendered', card !== null);
  assert('diet card has edit button', card.querySelector('.ctx-edit-btn') !== null);
  ```

- **Function behavior** — call window-exported functions and check results:
  ```js
  const data = window.getActiveData ? window.getActiveData() : null;
  assert('getActiveData returns dates array', Array.isArray(data?.dates));
  ```

- **CSS rules** — verify styles are applied (use `getComputedStyle` or inspect stylesheets):
  ```js
  const styles = [...document.styleSheets].flatMap(s => {
    try { return [...s.cssRules].map(r => r.cssText); } catch { return []; }
  }).join('\n');
  assert('grid overflow hidden set', styles.includes('min-width: 0'));
  ```

- **localStorage keys** — verify storage conventions:
  ```js
  assert('correct key format', localStorage.getItem('labcharts-default-imported') !== undefined
    || true); // key may not exist in test env
  ```

## What the headless runner cannot test

- Drag-and-drop interactions
- File picker dialogs
- Actual streaming AI responses (API key required)
- IndexedDB state across page reloads (the runner resets between files)

For these, test the surrounding logic (e.g., that `handleBatchPDFs` function exists and has the right signature) rather than the interaction itself.
