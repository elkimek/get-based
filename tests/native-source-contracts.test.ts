import { describe, expect, it } from 'vitest';
import { sourceCallsNamespacedActionAttributes, sourceFunctionHasCatchStatement, sourceFunctionHasInitializer, sourceFunctionHasStatement, sourceFunctionHasVariable } from './helpers/native-source-contracts.js';

describe('native source contracts', () => {
  it('tracks imported serializer namespaces and rejects dead strings or unrelated helpers', () => {
    const source = "import { actionAttributes as attrs } from './action-attributes.js'; function build() { return attrs('wearable', action, data); }";
    expect(sourceCallsNamespacedActionAttributes(source, 'wearable')).toBe(true);
    expect(sourceCallsNamespacedActionAttributes(source, 'lens')).toBe(false);
    for (const changed of [
      source.replace('./action-attributes.js', './other.js'),
      source.replace('actionAttributes as attrs', 'other as attrs'),
      source.replace("return attrs('wearable', action, data);", "return 'attrs(\"wearable\", action, data)';"),
      source.replace('attrs(', 'other('),
    ]) expect(sourceCallsNamespacedActionAttributes(changed, 'wearable')).toBe(false);
    expect(sourceCallsNamespacedActionAttributes(source.replace("'wearable', action", 'dynamicNamespace, action'), 'lens')).toBe(true);
    expect(sourceCallsNamespacedActionAttributes(source.replace('action, data)', "action, data, 'lens')"), 'lens')).toBe(true);
    expect(sourceCallsNamespacedActionAttributes('function broken(', 'wearable')).toBe(false);
  });
  it('keeps sanitized manual notes in both writers and rejects changed guards or assignments', () => {
    const source = "async function logManualMetric() { const noteClean = _sanitizeNote(note); if (noteClean) patch.note = noteClean; } async function logManualBP() { const noteClean = _sanitizeNote(note); if (noteClean) row.note = noteClean; } function _sanitizeNote(note) { if (typeof note !== 'string') return ''; }";
    const check = (input: string) => sourceFunctionHasInitializer(input, 'logManualMetric', 'noteClean', '_sanitizeNote(note)')
      && sourceFunctionHasStatement(input, 'logManualMetric', 'if (noteClean) patch.note = noteClean;')
      && sourceFunctionHasInitializer(input, 'logManualBP', 'noteClean', '_sanitizeNote(note)')
      && sourceFunctionHasStatement(input, 'logManualBP', 'if (noteClean) row.note = noteClean;')
      && sourceFunctionHasStatement(input, '_sanitizeNote', "if (typeof note !== 'string') return '';");
    expect(check(source)).toBe(true);
    expect(check(source.replaceAll(') ', ')\n    '))).toBe(true);
    for (const [before, after] of [
      ['_sanitizeNote(note)', '_sanitizeNote(other)'], ['if (noteClean)', 'if (!noteClean)'],
      ['patch.note = noteClean', 'patch.note = note'], ['row.note = noteClean', 'row.note = note'],
      ["typeof note !== 'string'", "typeof note === 'string'"], ["return ''", 'return note'],
      ['const noteClean = _sanitizeNote(note);', 'if (enabled) { const noteClean = _sanitizeNote(note); }'],
    ]) expect(check(source.replace(before!, after!))).toBe(false);
  });
  it('keeps notes outside conditional blocks and requires the final context return', () => {
    const source = 'function build() { const notes = []; if (hasLabs) { useLabs(); } return ctx; }';
    expect(sourceFunctionHasVariable(source, 'build', 'notes')).toBe(true);
    expect(sourceFunctionHasVariable('function build() { if (hasLabs) { const notes = []; } }', 'build', 'notes')).toBe(false);
    expect(sourceFunctionHasStatement(source, 'build', 'return ctx;', 'last')).toBe(true);
    expect(sourceFunctionHasStatement(source.replace('return ctx;', 'return other;'), 'build', 'return ctx;', 'last')).toBe(false);
    expect(sourceFunctionHasStatement(source.replace('return ctx;', 'return ctx; cleanup();'), 'build', 'return ctx;', 'last')).toBe(false);
  });
  it('accepts compiler parentheses but preserves the complete local-date formatter', () => {
    const formatter = "d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })";
    for (const arrow of [formatter, formatter.replace('d =>', '(d) =>')]) {
      const source = `function build() { const fmtDate = ${arrow}; }`;
      expect(sourceFunctionHasInitializer(source, 'build', 'fmtDate', formatter)).toBe(true);
      for (const [before, after] of [['T00:00:00', 'T00:00:00Z'], ['en-US', 'en-GB'], ["day: 'numeric'", "day: '2-digit'"]]) {
        expect(sourceFunctionHasInitializer(source.replace(before!, after!), 'build', 'fmtDate', formatter)).toBe(false);
      }
    }
  });
  it('requires both family-history early-return guards in their handler', () => {
    const allowlist = 'if (!FAMILY_RELATIVES.some(r => r.key === relative)) return;';
    const empty = 'if (!relative || !condition) return;';
    for (const separator of [' ', '\n    ']) {
      const source = `function add() { ${allowlist.replace(' return', separator + 'return')} ${empty.replace(' return', separator + 'return')} }`;
      expect(sourceFunctionHasStatement(source, 'add', allowlist)).toBe(true);
      expect(sourceFunctionHasStatement(source, 'add', empty)).toBe(true);
      expect(sourceFunctionHasStatement(source.replace('!FAMILY_RELATIVES', 'FAMILY_RELATIVES'), 'add', allowlist)).toBe(false);
      expect(sourceFunctionHasStatement(source.replace('||', '&&'), 'add', empty)).toBe(false);
      expect(sourceFunctionHasStatement(source.replace('r.key === relative', 'r.key === condition'), 'add', allowlist)).toBe(false);
    }
    expect(sourceFunctionHasStatement(`function elsewhere() { ${allowlist} } function add() {}`, 'add', allowlist)).toBe(false);
  });
  it('retains the callable check and exact injected callback assignment', () => {
    const statement = "if (typeof renderProfileButton === 'function') _renderProfileButton = renderProfileButton;";
    expect(sourceFunctionHasStatement(`function configure() { ${statement.replace(' _render', '\n    _render')} }`, 'configure', statement)).toBe(true);
    for (const changed of [statement.replace("=== 'function'", "!== 'function'"), statement.replace('= renderProfileButton;', '= other;'), '_renderProfileButton = renderProfileButton;']) {
      expect(sourceFunctionHasStatement(`function configure() { ${changed} }`, 'configure', statement)).toBe(false);
    }
  });
  it('expands a forwarding overlay helper without accepting changed fields or branches', () => {
    const source = "function setOverlayMode(field, key, mode) { state[field] = mode === 'off' ? 'off' : 'on'; localStorage.setItem(key, state[field]); } function setPhaseOverlay(mode) { setOverlayMode('phaseOverlayMode', 'phaseOverlay', mode); }";
    const statement = "state.phaseOverlayMode = mode === 'off' ? 'off' : 'on';";
    const check = (input: string) => sourceFunctionHasStatement(input, 'setPhaseOverlay', statement, 'direct', ['setOverlayMode']);
    expect(check(source)).toBe(true);
    for (const [before, after] of [["'phaseOverlayMode'", "'noteOverlayMode'"], ["? 'off' : 'on'", "? 'on' : 'off'"], ['state[field] =', 'state.field ='], ['function setOverlayMode', 'async function setOverlayMode']]) {
      const changed = source.replace(before!, after!);
      expect(check(changed)).toBe(false);
    }
    const shadowed = source.replace("state[field] = mode === 'off' ? 'off' : 'on';", "{ const field = 'noteOverlayMode'; state[field] = mode === 'off' ? 'off' : 'on'; }");
    expect(check(shadowed)).toBe(false);
    expect(check(source.replace("'phaseOverlayMode'", 'getField()'))).toBe(false);
  });
  it('rejects malformed source and absent or differently scoped declarations', () => {
    expect(sourceFunctionHasStatement('function broken( { return ctx;', 'broken', 'return ctx;', 'last')).toBe(false);
    expect(sourceFunctionHasVariable('function other() { const notes = []; }', 'build', 'notes')).toBe(false);
    expect(sourceFunctionHasInitializer('function build() {}', 'build', 'fmtDate', 'd => d')).toBe(false);
  });
  it('keeps cancellation guards in the named catch with the correct error binding and timeout order', () => {
    const guard = "if (getErrorName(error) === 'AbortError') { if (outerSignal?.aborted) throw error; if (timeoutCtl.signal.aborted) throw new Error('timeout'); }";
    const source = `async function query() { try { await fetch(); } catch (error) { ${guard} throw error; } }`;
    const check = (input: string) => sourceFunctionHasCatchStatement(input, 'query', 'error', guard);
    expect(check(source)).toBe(true);
    expect(check(source.replace('throw error;', '\n      throw error;'))).toBe(true);
    for (const changed of [
      source.replace('catch (error)', 'catch (other)'),
      source.replace("=== 'AbortError'", "!== 'AbortError'"),
      source.replace('throw error;', 'return null;'),
      source.replace("throw new Error('timeout')", "throw new Error('cancelled')"),
      source.replace("if (outerSignal?.aborted) throw error; if (timeoutCtl.signal.aborted) throw new Error('timeout');", "if (timeoutCtl.signal.aborted) throw new Error('timeout'); if (outerSignal?.aborted) throw error;"),
      `async function other() { try {} catch (error) { ${guard} } } async function query() {}`,
      `async function query() { ${guard} }`,
      `async function query() { try {} catch (error) { function elsewhere() { ${guard} } } }`,
    ]) expect(check(changed)).toBe(false);
  });
});
