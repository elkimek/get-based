import assert from 'node:assert/strict';
import postcss from 'postcss';
import owned from '../fixtures/dashboard-biometric-style-bodies.json' with {type:'json'};

/** Restore only exact reviewed Biometrics declaration bodies for prior full CSS assertions. */
export function restoreDashboardBiometricBodies(current:string,original:string):string {
 const source=postcss.parse(current),target=postcss.parse(original);
 const edits:Array<{start:number;end:number;after:string}>=[];
 for(const row of owned){
  const matches=(tree:postcss.Root)=>{const found:postcss.Rule[]=[];tree.walkRules(rule=>{const media=rule.parent?.type==='atrule'?rule.parent.params:null;if(rule.selector===row.selector&&media===row.media)found.push(rule);});return found;};
  const live=matches(source),native=matches(target);if(live.length!==1||native.length!==1)throw new Error('Exact single Biometrics receiver required');
  const signature=(rule:postcss.Rule)=>rule.nodes.map(node=>{if(node.type!=='decl')throw new Error('Only reviewed Biometrics declarations');return{property:node.prop,value:node.value,important:!!node.important};});
  if(JSON.stringify(signature(live[0]!))!==JSON.stringify(row.declarations)||JSON.stringify(signature(native[0]!))!==JSON.stringify(row.declarations))throw new Error('Exact ordered Biometrics declarations required');
  const body=(rule:postcss.Rule,text:string)=>{const start=rule.source?.start?.offset,end=rule.source?.end?.offset;if(typeof start!=='number'||typeof end!=='number'||text.slice(start,end)!==rule.toString())throw new Error('Exact Biometrics source coordinates required');const open=start+rule.selector.length+(rule.raws.between||'').length;if(text[open]!=='{'||text[end-1]!=='}')throw new Error('Exact Biometrics body framing required');return{start:open+1,end:end-1};};
  const at=body(live[0]!,current),from=body(native[0]!,original);edits.push({...at,after:original.slice(from.start,from.end)});
 }
 let result=current;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.after+result.slice(edit.end);return result;
}

const readableCtaUtility = 'dashboard-biometric-db-biometric-manual-empty-wearable-empty-cta';
const readableCtaSelector = '.db-biometric-manual-empty .wearable-empty-cta';
const readableCtaDeclarations = [
  {property: 'color', value: 'var(--text-primary)', important: false},
  {property: 'font-size', value: '11px', important: false},
  {property: 'font-weight', value: '600', important: false},
  {property: 'letter-spacing', value: '0.02em', important: false},
];

/** Qualify the single readable CTA correction before immutable legacy parity.
 * Every other declaration, receiver, priority, order and byte stays untouched. */
function restoreReadableCta(input: string, authored: boolean): string {
  const tree = postcss.parse(input), matches: Array<postcss.AtRule | postcss.Rule> = [];
  if (authored) tree.walkAtRules('utility', node => { if (node.params === readableCtaUtility) matches.push(node); });
  else tree.walkRules(node => { if (node.selector === readableCtaSelector) matches.push(node); });
  assert.equal(matches.length, 1, 'Exactly one readable Biometric CTA owner');
  const owner = matches[0]!;
  assert.equal(owner.parent, tree, 'Readable Biometric CTA root ancestry stays exact');
  const nodes = owner.nodes;
  assert.ok(nodes, 'Readable CTA owner has declarations');
  const declarations = nodes.map(node => {
    assert.equal(node.type, 'decl', 'Only exact readable CTA declarations');
    if (node.type !== 'decl') throw new Error('Expected readable CTA declaration');
    return {property: node.prop, value: node.value, important: !!node.important};
  });
  assert.deepEqual(declarations, readableCtaDeclarations, 'Exact current readable CTA color/order/priority/geometry');
  const color = nodes[0]!;
  assert.equal(color.type, 'decl');
  if (color.type !== 'decl') throw new Error('Expected readable CTA foreground');
  color.value = 'var(--accent)';
  return tree.toString();
}

export function restoreReadableBiometricCtaSource(input: string): string { return restoreReadableCta(input, true); }
export function restoreReadableBiometricCtaCss(input: string): string { return restoreReadableCta(input, false); }

const manualRemoveUtility = 'dashboard-biometric-manual-empty-remove-placement';
const manualRemoveSelector = '.db-biometric-manual-empty + .db-biometric-remove';
const manualRemoveDeclarations = [
  {property: 'top', value: 'auto', important: false},
  {property: 'bottom', value: '8px', important: false},
];

/** Remove only the exact reviewed manual-empty sibling correction. The shared
 * remove control, coarse hitbox, CTA and all foreign stylesheet bytes stay exact. */
function restoreManualRemove(input: string, authored: boolean): string {
  const tree = postcss.parse(input), rules: postcss.Rule[] = [], utilities: postcss.AtRule[] = [];
  tree.walkRules(rule => { if (rule.selector === manualRemoveSelector) rules.push(rule); });
  tree.walkAtRules('utility', node => { if (node.params === manualRemoveUtility) utilities.push(node); });
  assert.equal(rules.length, 1, 'Exactly one manual-empty remove sibling receiver');
  assert.equal(utilities.length, authored ? 1 : 0, 'Exact manual-empty remove metadata count');
  const receiver = rules[0]!, recipe = authored ? utilities[0]! : receiver;
  assert.equal(receiver.parent, tree, 'Manual-empty remove receiver stays root-only');
  assert.equal(recipe.parent, tree, 'Manual-empty remove recipe stays root-only');
  assert.ok(recipe.nodes);
  assert.deepEqual(recipe.nodes.map(node => {
    assert.equal(node.type, 'decl', 'Only exact manual-empty remove declarations');
    if (node.type !== 'decl') throw new Error('Expected manual-empty remove declaration');
    return {property: node.prop, value: node.value, important: !!node.important};
  }), manualRemoveDeclarations, 'Exact manual-empty remove position/order/priority');
  if (authored) {
    assert.equal(recipe.toString(), '@utility ' + manualRemoveUtility + ' {\n  top: auto;\n  bottom: 8px;\n}');
    assert.equal(receiver.toString(), manualRemoveSelector + ' { @apply gb:' + manualRemoveUtility + '; }');
  }
  const edits = (authored ? [recipe, receiver] : [receiver]).map(node => {
    const start = node.source?.start?.offset, end = node.source?.end?.offset;
    assert.ok(typeof start === 'number' && typeof end === 'number');
    assert.equal(input.slice(start, end), node.toString(), 'Exact manual-empty remove source coordinates');
    assert.equal(input[end], '\n', 'Only the added receiver/metadata trailing LF is removed');
    return {start, end: end + 1};
  });
  let restored = input;
  for (const edit of edits.sort((a, b) => b.start - a.start)) restored = restored.slice(0, edit.start) + restored.slice(edit.end);
  return restored;
}
export function restoreManualBiometricRemoveSource(input: string): string { return restoreManualRemove(input, true); }
export function restoreManualBiometricRemoveCss(input: string): string { return restoreManualRemove(input, false); }
const inlineRemoveUtility = 'dashboard-biometric-inline-edit-remove';
const inlineRemoveSelector = '.db-biometric-manual-empty:has(.wearable-log-form) + .db-biometric-remove';
/** Qualify the one editing-only sibling hide before retaining every original
 * stylesheet byte, rule scope, generic Remove geometry and cascade assertion. */
function restoreInlineRemove(input: string, authored: boolean): string {
  const tree = postcss.parse(input), rules: postcss.Rule[] = [], utilities: postcss.AtRule[] = [];
  tree.walkRules(rule => { if (rule.selector === inlineRemoveSelector) rules.push(rule); });
  tree.walkAtRules('utility', rule => { if (rule.params === inlineRemoveUtility) utilities.push(rule); });
  assert.equal(rules.length, 1, 'Exactly one inline-edit Remove sibling receiver');
  assert.equal(utilities.length, authored ? 1 : 0, 'Exact inline-edit Remove metadata count');
  const receiver = rules[0]!, recipe = authored ? utilities[0]! : receiver;
  assert.ok(receiver.parent === tree, 'Inline-edit Remove receiver stays root-only');
  assert.ok(recipe.parent === tree, 'Inline-edit Remove recipe stays root-only');
  assert.ok(recipe.nodes);
  assert.deepEqual(recipe.nodes.map(node => {
    assert.equal(node.type, 'decl', 'Only the reviewed inline-edit Remove declaration');
    if (node.type !== 'decl') throw new Error('Expected inline-edit Remove declaration');
    return [node.prop, node.value, !!node.important];
  }), [['display', 'none', false]], 'Exact inline-edit Remove value/property/priority');
  if (authored) {
    assert.equal(recipe.toString(), '@utility ' + inlineRemoveUtility + ' {\n  display: none;\n}');
    assert.equal(receiver.toString(), inlineRemoveSelector + ' { @apply gb:' + inlineRemoveUtility + '; }');
  }
  const edits = (authored ? [recipe, receiver] : [receiver]).map(node => {
    const start = node.source?.start?.offset, end = node.source?.end?.offset;
    assert.ok(typeof start === 'number' && typeof end === 'number');
    assert.equal(input.slice(start, end), node.toString(), 'Exact inline-edit Remove source coordinates');
    assert.equal(input[end], '\n', 'Remove only the added owner and its trailing LF');
    return {start, end: end + 1};
  });
  let restored = input;
  for (const edit of edits.sort((a, b) => b.start - a.start)) restored = restored.slice(0, edit.start) + restored.slice(edit.end);
  return restored;
}
export function restoreInlineBiometricRemoveSource(input: string): string { return restoreInlineRemove(input, true); }
export function restoreInlineBiometricRemoveCss(input: string): string { return restoreInlineRemove(input, false); }
export function restoreReviewedBiometricSource(input: string): string { return restoreReadableBiometricCtaSource(restoreManualBiometricRemoveSource(restoreInlineBiometricRemoveSource(input))); }
export function restoreReviewedBiometricCss(input: string): string { return restoreReadableBiometricCtaCss(restoreManualBiometricRemoveCss(restoreInlineBiometricRemoveCss(input))); }
