import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import postcss, {type AtRule, type ChildNode} from 'postcss';

// These are the existing independently reviewed Utils prompt additions, bound
// to their exact native receivers rather than the Knowledge Base allowlist.
const receivers = [
  ['.confirm-dialog', 'confirm-dialog', ['gb:utils-dialog-panel:utils-dialog-panel', 'gb:utils-dialog-panel:utils-dialog-phone:[padding:22px_18px]']],
  ['.confirm-dialog > .confirm-message', 'confirm-message', ['gb:utils-dialog-message:utils-dialog-message']],
  ['.confirm-dialog > #prompt-dialog-input', 'confirm-input', ['gb:utils-dialog-input:utils-dialog-input', 'gb:utils-dialog-input-focus:utils-dialog-input-focus']],
  ['.confirm-dialog > .confirm-actions', 'confirm-actions', ['gb:utils-dialog-actions:utils-dialog-actions']],
  ['.confirm-actions > #prompt-cancel', 'confirm-btn confirm-btn-cancel', ['gb:utils-dialog-cancel:utils-dialog-cancel', 'gb:utils-dialog-cancel-hover:utils-dialog-cancel-hover']],
  ['.confirm-actions > #prompt-ok', 'confirm-btn confirm-btn-primary', ['gb:utils-dialog-primary:utils-dialog-primary', 'gb:utils-dialog-primary-hover:utils-dialog-primary-hover']],
] as const;
const ownerHashes: Readonly<Record<string, string>> = {
  'js/utils-dialog-classes.ts': 'eb4ed11c65b91d27ab3ee99b05443fd62c62b049ef4e2c41974a17d0a317554b',
  'js/components/UtilsPromptPresentation.svelte': '80ec831d48cf9908cb6b17a009a9a3ffd5d4c0c2237e8bc7eb9af920c1e773bd',
  'js/utils-dialog-rendering.ts': '23528c9aa480f0042ffd675825608f13427b1e6c4cbac795cbc29bce22c43d9c',
  'css/utils-dialog.tailwind.css': 'd32179b296d42bdd6b5e96f0839ab91d9ced4a4f8643bc5cfc6c64251855d49e',
  'tests/fixtures/modal-shared-remaining-base-original.css': '274e3689ad31cb4d39851f72f273888152c6d29ef1f81885df4c2b096c119bd6',
};

type Declaration = readonly [string, string, boolean];
function declarations(nodes: readonly ChildNode[]): Declaration[] {
  return nodes.filter(node => node.type !== 'comment').map(node => {
    assert(node.type === 'decl', 'Only native declarations');
    return [node.prop, node.value, !!node.important] as const;
  });
}
/** Compare ordered declarations, duplicates and priorities with frozen native CSS. */
export function qualifySharedUtilsNativeDeclarations(tailwind: string, native: string): void {
  const authored = postcss.parse(tailwind), original = postcss.parse(native);
  const utility = (name: string): Declaration[] => {
    const matches: AtRule[] = [];
    authored.walkAtRules('utility', node => {if (node.params === name) matches.push(node);});
    assert.equal(matches.length, 1, 'Single Utils utility: ' + name);
    return matches[0]!.nodes!.flatMap(node => {
      if (node.type === 'comment') return [];
      if (node.type === 'atrule') { assert.equal(node.name, 'apply'); assert.equal(node.params, 'gb:utils-dialog-button-base'); return utility('utils-dialog-button-base'); }
      return declarations([node]);
    });
  };
  const rule = (selector: string, phone = false): Declaration[] => {
    const found: Declaration[][] = [];
    original.walkRules(node => {
      const parent = node.parent;
      if (node.selector === selector && (phone ? parent?.type === 'atrule' && parent.name === 'media' && parent.params === '(max-width: 480px)' : parent?.type === 'root')) found.push(declarations(node.nodes));
    });
    assert.equal(found.length, 1, 'Single native Utils receiver: ' + selector);
    return found[0]!;
  };
  for (const [name, selector] of [['panel', '.confirm-dialog'], ['message', '.confirm-message'], ['input', '.confirm-input'], ['input-focus', '.confirm-input:focus'], ['actions', '.confirm-actions'], ['cancel-hover', '.confirm-btn-cancel:hover'], ['primary-hover', '.confirm-btn-primary:hover']] as const) {
    assert.deepEqual(utility('utils-dialog-' + name), rule(selector), 'Exact native Utils declarations: ' + name);
  }
  for (const tone of ['cancel', 'primary']) assert.deepEqual(utility('utils-dialog-' + tone), [...rule('.confirm-btn'), ...rule('.confirm-btn-' + tone)], 'Exact native Utils button cascade: ' + tone);
  assert.deepEqual(rule('.confirm-dialog', true), [['padding', '22px 18px', false]], 'Exact native phone padding');
  assert(tailwind.includes('@custom-variant utils-dialog-phone (@media (max-width: 480px));'), 'Exact phone breakpoint owner');
}
export function qualifySharedUtilsOwners(read: (file: string) => string = file => readFileSync(file, 'utf8')): void {
  for (const [file, hash] of Object.entries(ownerHashes)) assert.equal(createHash('sha256').update(read(file)).digest('hex'), hash, 'Reviewed shared Utils owner changed: ' + file);
  assert(read('css/report-builder.tailwind.css').includes('@import "./utils-dialog.tailwind.css";'), 'Utils recipes remain in the shared modal build');
  assert(read('scripts/build-styles.mts').includes("{ name: 'report-builder.tailwind.css', minify: true }"), 'Shared modal build retains the real recipe entry');
  qualifySharedUtilsNativeDeclarations(read('css/utils-dialog.tailwind.css'), read('tests/fixtures/modal-shared-remaining-base-original.css'));
}
export function sharedUtilsPromptReceivers(current: Element, original: Element): Map<Element, readonly string[]> {
  const result = new Map<Element, readonly string[]>();
  if (original.childElementCount !== 1 || !original.firstElementChild?.matches('.confirm-dialog[role="dialog"][aria-modal="true"][aria-label="Prompt"]')) return result;
  qualifySharedUtilsOwners();
  for (const [selector, native, tokens] of receivers) {
    const before = original.querySelectorAll(selector), after = current.querySelectorAll(selector);
    assert.equal(before.length, 1, 'Exact original Utils prompt receiver: ' + selector);
    assert.equal(after.length, 1, 'Exact current Utils prompt receiver: ' + selector);
    assert.equal(before[0]!.getAttribute('class'), native, 'Exact original Utils classes');
    assert.equal(after[0]!.getAttribute('class'), native + ' ' + tokens.join(' '), 'Exact receiver-specific Utils classes: ' + selector);
    result.set(after[0]!, tokens);
  }
  return result;
}
