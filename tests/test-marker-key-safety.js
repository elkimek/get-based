#!/usr/bin/env node
// Node-side test: marker-key safety helpers in js/utils.js.
// safeMarkerId is the read-time guard for any value that gets inlined
// into an onclick="..." JS string literal. sanitizeMarkerKey is the
// write-time validator that runs before a key enters state.
//
// Run: node tests/test-marker-key-safety.js

// Shim browser globals — utils.js does an Object.assign(window, ...) at
// module load to expose handlers to inline-onclick attributes. Other
// node-side tests sidestep this by reading source as text; we want to
// exercise the actual exported functions, so a dummy window suffices.
import './_node-shim.js';
const { safeMarkerId, sanitizeMarkerKey } = await import('../js/utils.js');

let passed = 0, failed = 0;
function assert(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== marker-key safety helpers ===\n');

// ── safeMarkerId — accepts ────────────────────────────────────────
assert('accepts standard schema key', safeMarkerId('biochemistry.glucose') === 'biochemistry.glucose');
assert('accepts underscore-bearing marker', safeMarkerId('diabetes.insulin_d') === 'diabetes.insulin_d');
assert('accepts category_marker form (id)', safeMarkerId('biochemistry_glucose') === 'biochemistry_glucose');
assert('accepts digit-bearing marker', safeMarkerId('metabolomix.5_h_indoleacetic_acid') === 'metabolomix.5_h_indoleacetic_acid');
assert('accepts dot-and-underscore mixture', safeMarkerId('lipids.hdl') === 'lipids.hdl');

// ── safeMarkerId — rejects ────────────────────────────────────────
assert('rejects single quote', safeMarkerId("foo.b'ar") === null);
assert('rejects double quote', safeMarkerId('foo.b"ar') === null);
assert('rejects backslash', safeMarkerId('foo.b\\ar') === null);
assert('rejects angle bracket (script breakout)', safeMarkerId('foo.<script>') === null);
assert('rejects whitespace', safeMarkerId('foo. bar') === null);
assert('rejects newline', safeMarkerId('foo.\nbar') === null);
assert('rejects parenthesis (JS call)', safeMarkerId('foo.bar()') === null);
assert('rejects empty string', safeMarkerId('') === null);
assert('rejects null', safeMarkerId(null) === null);
assert('rejects undefined', safeMarkerId(undefined) === null);
assert('rejects non-string number', safeMarkerId(42) === null);
assert('rejects non-string object', safeMarkerId({}) === null);
assert('rejects > 128 chars', safeMarkerId('a' + '.' + 'b'.repeat(200)) === null);

// ── safeMarkerId — proto-pollution guards ─────────────────────────
assert('rejects __proto__ in marker part', safeMarkerId('foo.__proto__') === null);
assert('rejects __proto__ in category part', safeMarkerId('__proto__.bar') === null);
assert('rejects constructor', safeMarkerId('foo.constructor') === null);
assert('rejects prototype', safeMarkerId('prototype.bar') === null);
assert('rejects bare __proto__', safeMarkerId('__proto__') === null);
// Underscore-separator id form: an id like `__proto___bar` is just a
// string key (no `.`-split part equals __proto__), so it's safe to embed
// in inline JS — accept it. The hazard is only on dot-split paths.
assert('accepts non-proto underscore id', safeMarkerId('cat_marker_with_underscores') === 'cat_marker_with_underscores');

// ── sanitizeMarkerKey — accepts ───────────────────────────────────
assert('clean key passes through', sanitizeMarkerKey('biochemistry.glucose') === 'biochemistry.glucose');
assert('strips disallowed chars from each part',
  sanitizeMarkerKey("bio'chem.glu cose") === 'biochem.glucose');
assert('preserves underscore', sanitizeMarkerKey('diabetes.insulin_d') === 'diabetes.insulin_d');

// ── sanitizeMarkerKey — rejects ───────────────────────────────────
assert('null when no dot', sanitizeMarkerKey('biochemistryglucose') === null);
assert('null when leading dot', sanitizeMarkerKey('.glucose') === null);
assert('null when trailing dot', sanitizeMarkerKey('biochemistry.') === null);
assert('null on null input', sanitizeMarkerKey(null) === null);
assert('null on number input', sanitizeMarkerKey(42) === null);
assert('null when category becomes empty after strip',
  sanitizeMarkerKey("'\"<>.glucose") === null);
assert('null when marker becomes empty after strip',
  sanitizeMarkerKey("biochemistry.'\"<>") === null);

// ── sanitizeMarkerKey — proto guards ──────────────────────────────
assert('null on __proto__ category', sanitizeMarkerKey('__proto__.bar') === null);
assert('null on __proto__ marker', sanitizeMarkerKey('foo.__proto__') === null);
assert('null on constructor', sanitizeMarkerKey('foo.constructor') === null);
assert('null on prototype', sanitizeMarkerKey('prototype.foo') === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
