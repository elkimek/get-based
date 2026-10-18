import { expect, it } from 'vitest';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { renderCompareDatesPage } from '../js/compare-dates-presentation.js';
import { renderCorrelationsPage, renderCorrelationsOptions, renderCorrelationsChips } from '../js/correlations-selection-presentation.js';

it('retains compare-correlations delegated-action source contracts', () => {
  const { assert, results: legacyAssertions } = createLegacyAssertions();
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const compareSrc = read('js/compare-correlations.js');
  // The authored Svelte owners now emit these controls directly. Inspect their
  // real compiled output instead of requiring retired template-helper calls.
  const markerKey='biochemistry.marker<&"';
  const markup=renderCompareDatesPage({kind:'dates',first:[{value:'first',label:'First'}],second:[{value:'second',label:'Second'}]})
    +renderCorrelationsPage({kind:'page',presets:[{ariaLabel:'Preset',index:'7',disabled:false,label:'Preset',names:'Marker',available:'1',total:'1'}]})
    +renderCorrelationsOptions([{kind:'marker',selected:false,key:markerKey,name:'Marker',category:'Labs',label:'Marker',categoryLabel:'Labs',count:'2'}])
    +renderCorrelationsChips([{kind:'marker',background:'red',border:'red',color:'white',label:'Marker',ariaLabel:'Marker',key:markerKey}]);
  const dom=new JSDOM(markup);
  try {
  const document=dom.window.document;
  const eventNames = ['click', 'keydown', 'change', 'input', 'submit', 'blur', 'toggle'];
  const inlineEventPattern = new RegExp(`\\bon(?:${eventNames.join('|')})=["']`);
  console.log('=== Compare Correlations Delegated Actions Tests ===');
  assert('compare-correlations renderer emits no inline event attributes', !inlineEventPattern.test(compareSrc+markup));
  assert('compare-correlations imports escapeAttr for delegated data attributes', /import\s*\{[^}]*\bescapeAttr\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/.test(compareSrc));
  assert('compare action attribute helper is exported', /export function compareActionAttrs\(action, attrs = \{\}\)/.test(compareSrc)
      && compareSrc.includes('data-compare-action'));
  assert('compare delegates install click keydown change input and focusin listeners', compareSrc.includes("root.addEventListener('click', handleCompareClick)")
      && compareSrc.includes("root.addEventListener('keydown', handleCompareKeydown)")
      && compareSrc.includes("root.addEventListener('change', handleCompareChange)")
      && compareSrc.includes("root.addEventListener('input', handleCompareInput)")
      && compareSrc.includes("root.addEventListener('focusin', handleCompareFocus)")
      && compareSrc.includes('installCompareCorrelationDelegates();'));
  assert('compare date controls use delegated change actions',
    document.querySelectorAll('select[data-compare-change-action="set-date"]').length===2
      && document.querySelector('#compare-select-1')?.getAttribute('data-compare-index')==='1'
      && document.querySelector('#compare-select-2')?.getAttribute('data-compare-index')==='2'
      && document.querySelectorAll('button[data-compare-action="swap-dates"]').length===1
      && compareSrc.includes("actionEl.dataset.compareChangeAction !== 'set-date'"));
  assert('correlation search uses delegated input and focus actions',
    document.querySelector('#corr-search')?.getAttribute('data-compare-input-action')==='filter-options'
      && document.querySelector('#corr-search')?.getAttribute('data-compare-focus-action')==='show-dropdown'
      && compareSrc.includes("actionEl.dataset.compareInputAction !== 'filter-options'")
      && compareSrc.includes("actionEl.dataset.compareFocusAction !== 'show-dropdown'"));
  assert('correlation preset AI option and chip controls use delegated click actions',
    document.querySelectorAll('.corr-preset-btn[data-compare-action="apply-preset"][data-compare-index="7"]').length===1
      && document.querySelectorAll('.corr-ask-ai-btn[data-compare-action="ask-ai-correlations"]').length===1
      && document.querySelectorAll('.corr-option[data-compare-action="toggle-marker"]').length===1
      && document.querySelector('.corr-option')?.getAttribute('data-compare-key')===markerKey
      && document.querySelectorAll('.chip-remove[data-compare-action="toggle-marker"]').length===1
      && document.querySelector('.chip-remove')?.getAttribute('data-compare-key')===markerKey);
  assert('compare click delegate routes all rendered actions', compareSrc.includes("action === 'swap-dates'")
      && compareSrc.includes("action === 'apply-preset'")
      && compareSrc.includes("action === 'toggle-marker'")
      && compareSrc.includes("action === 'ask-ai-correlations'"));
  assert('compare keydown delegate activates non-native action elements', /event\.preventDefault\(\);\s*actionEl\.click\(\);/.test(compareSrc.split('function handleCompareKeydown(event) {')[1]?.split('function handleCompareChange')[0] || '')
      && compareSrc.includes("['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(actionEl.tagName)"));
  console.log(`\nCompare correlations delegated actions tests: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed`);

  expect(legacyAssertions.fail).toBe(0);
  } finally {dom.window.close();}
});
