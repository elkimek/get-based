#!/usr/bin/env node
// test-dashboard-genetics-empty.js — Genetics empty-state CTA (v1.3.28)
//
// Run: node tests/test-dashboard-genetics-empty.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Genetics empty-state CTA tests ===\n');

const dna = await import('../js/dna.js');
const { state } = await import('../js/state.js');
// context-cards.js exposes window.triggerDNAFilePicker.
await import('../js/context-cards.js');
  if (!state.importedData) state.importedData = {};
  const savedGenetics = state.importedData.genetics;

  try {
    // ─── 1. No genetics → empty-state CTA renders ───
    {
      delete state.importedData.genetics;
      const html = dna.renderGeneticsSection();
      assert('no DNA: returns non-empty HTML', html.length > 50);
      assert('no DNA: HTML uses .genetics-empty-stub class',
        html.includes('genetics-empty-stub'));
      assert('no DNA: CTA copy mentions adding DNA',
        /Add your DNA data/i.test(html));
      assert('no DNA: CTA mentions privacy assurance',
        /stay on this device|locally/i.test(html));
      assert('no DNA: click target wired to triggerDNAFilePicker',
        html.includes('triggerDNAFilePicker()'));
      assert('no DNA: keyboard-activatable (role + tabindex)',
        /role="button"/.test(html) && /tabindex="0"/.test(html));
    }

    // ─── 2. Empty genetics object (no snps, no mtdna) → CTA still renders ───
    {
      state.importedData.genetics = { source: null, snps: {}, effects: {} };
      const html = dna.renderGeneticsSection();
      assert('empty genetics object: still shows empty stub',
        html.includes('genetics-empty-stub'));
    }

    // ─── 3. mtDNA-only profile → real genetics section, NO empty stub ───
    {
      state.importedData.genetics = {
        snps: {},
        mtdna: { haplogroup: 'H', date: '2025-01-01' },
        source: null,
        coverage: { found: 0, total: 0 },
        effects: {},
      };
      const html = dna.renderGeneticsSection();
      assert('mtDNA-only: empty stub does NOT render',
        !html.includes('genetics-empty-stub'));
    }

    // ─── 4. window.triggerDNAFilePicker exists (used by stub onclick) ───
    {
      assert('window.triggerDNAFilePicker is a function',
        typeof window.triggerDNAFilePicker === 'function');
    }
  } finally {
    state.importedData.genetics = savedGenetics;
  }

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
