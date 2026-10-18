import assert from 'node:assert/strict';
import postcss from 'postcss';
import {tokenize, TokenType} from '@csstools/css-tokenizer';

const prefix = 'gb:light-setup:';
const scope = ':is([data-light-setup-presentation],[data-light-setup-presentation] *)';
export interface LightSetupSelectorEdit {
  readonly start: number;
  readonly end: number;
  readonly before: string;
  readonly after: string;
  readonly utility: string;
  readonly hooks: readonly string[];
}
export interface LightSetupFactoredStyles {
  readonly css: string;
  readonly edits: readonly LightSetupSelectorEdit[];
  readonly rules: number;
  readonly utilities: number;
}

/** Verify against the original entire stylesheet, including every non-selector byte. */
export function verifyLightSetupSelectorEdits(original: string, candidate: string,
  edits: readonly LightSetupSelectorEdit[]): void {
  let previousEnd = 0;
  let delta = 0;
  const inverse: {start: number; end: number; before: string; after: string}[] = [];
  for (const edit of edits) {
    assert.ok(edit.start >= previousEnd && edit.end > edit.start, 'Ordered disjoint atomic selector edits');
    assert.ok(original.slice(edit.start, edit.end) === edit.before, 'Original atomic class bytes');
    inverse.push({start: edit.start + delta, end: edit.start + delta + edit.after.length,
      before: edit.after, after: edit.before});
    delta += edit.after.length - edit.before.length;
    previousEnd = edit.end;
  }
  let restored = candidate;
  for (const edit of inverse.toReversed()) {
    assert.ok(restored.slice(edit.start, edit.end) === edit.before, 'Exact candidate atomic replacement');
    restored = restored.slice(0, edit.start) + edit.after + restored.slice(edit.end);
  }
  assert.ok(restored === original, 'Complete original stylesheet inverse');
}

/** This one owner keeps normal Tailwind order; no declarations or CSS nodes are serialized. */
export function factorLightSetupStyles(original: string,
  recipes: Readonly<Record<string, string>>): LightSetupFactoredStyles {
  const utilityHooks = new Map<string, string[]>();
  for (const [hook, utilities] of Object.entries(recipes)) {
    assert.match(hook, /^[a-z][a-z0-9-]*$/, 'Closed original semantic hook names');
    assert.ok(utilities.length > 0, 'Complete readable build-only recipe');
    const ownUtilities = new Set<string>();
    for (const utility of utilities.split(/\s+/).filter(Boolean)) {
      assert.ok(utility.startsWith(prefix), 'Only the Light setup Tailwind owner');
      assert.ok(!ownUtilities.has(utility), 'No duplicate atomic utility within one hook');
      ownUtilities.add(utility);
      const hooks = utilityHooks.get(utility) || [];
      hooks.push(hook);
      utilityHooks.set(utility, hooks);
    }
  }
  assert.ok(utilityHooks.size > 0, 'Nonempty Light setup catalog');
  const edits: LightSetupSelectorEdit[] = [];
  const seen = new Set<string>();
  let rules = 0;
  postcss.parse(original).walkRules(rule => {
    const selector = rule.selector;
    const tokens = tokenize({css: selector}, {onParseError(error) {
      throw new Error(`Light setup selector tokenization failed: ${error.message}`);
    }});
    const arms: {start: number; end: number}[] = [];
    let start = 0;
    let parentheses = 0;
    let brackets = 0;
    for (const token of tokens) {
      if (token[0] === TokenType.Function || token[0] === TokenType.OpenParen) parentheses += 1;
      if (token[0] === TokenType.CloseParen) parentheses -= 1;
      if (token[0] === TokenType.OpenSquare) brackets += 1;
      if (token[0] === TokenType.CloseSquare) brackets -= 1;
      assert.ok(parentheses >= 0 && brackets >= 0, 'Balanced selector token delimiters');
      if (token[0] === TokenType.Comma && parentheses === 0 && brackets === 0) {
        arms.push({start, end: token[2]});
        start = token[3] + 1;
      }
    }
    assert.ok(parentheses === 0 && brackets === 0, 'Complete selector token delimiters');
    arms.push({start, end: selector.length});
    const ruleStart = rule.source?.start?.offset;
    assert.ok(typeof ruleStart === 'number'
      && original.slice(ruleStart, ruleStart + selector.length) === selector, 'Exact PostCSS selector offsets');
    const previousCount = edits.length;
    brackets = 0;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]!;
      if (token[0] === TokenType.OpenSquare) brackets += 1;
      if (token[0] === TokenType.CloseSquare) brackets -= 1;
      if (token[0] !== TokenType.Ident || !token[4].value.startsWith(prefix)) continue;
      const dot = tokens[index - 1];
      assert.ok(brackets === 0 && dot?.[0] === TokenType.Delim && dot[4].value === '.'
        && dot[3] + 1 === token[2], 'Qualified utility occurs only as a complete atomic class selector');
      const utility = token[4].value;
      const hooks = utilityHooks.get(utility);
      assert.ok(hooks && hooks.length > 0, 'Every atomic utility has a closed recipe association');
      const arm = arms.find(value => dot[2] >= value.start && token[3] < value.end);
      assert.ok(arm && selector.slice(arm.start, arm.end).includes(scope), 'Unchanged owner scope in this selector arm');
      const before = selector.slice(dot[2], token[3] + 1);
      const alternatives = hooks.map(hook => '.gb-ls-' + hook);
      // A class and :is(one-or-more classes) each have specificity (0,1,0).
      const after = alternatives.length === 1 ? alternatives[0]! : ':is(' + alternatives.join(',') + ')';
      edits.push({start: ruleStart + dot[2], end: ruleStart + token[3] + 1,
        before, after, utility, hooks: [...hooks]});
      seen.add(utility);
    }
    if (edits.length !== previousCount) rules += 1;
  });
  assert.ok(seen.size === utilityHooks.size && [...utilityHooks.keys()].every(key => seen.has(key)),
    'Every catalog utility has an actual compiled selector');
  edits.sort((left, right) => left.start - right.start);
  let css = original;
  for (const edit of edits.toReversed()) css = css.slice(0, edit.start) + edit.after + css.slice(edit.end);
  verifyLightSetupSelectorEdits(original, css, edits);
  return {css, edits, rules, utilities: utilityHooks.size};
}
