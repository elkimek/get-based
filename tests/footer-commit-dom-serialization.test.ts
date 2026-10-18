import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {expect, it, vi} from 'vitest';
import * as anchorComponent from '../js/components/FooterCommitLink.svelte.html.js';
import {renderFooterCommitLink} from '../js/footer-commit-link-presentation.js';
import {renderHTML as renderAnchor} from '../js/components/FooterCommitLink.svelte.html.js';
import {renderHTML as renderFooter} from '../js/components/AppShell.svelte.html.js';

const before = fs.readFileSync(new URL('./fixtures/footer-commit-link-before-dom.js.txt', import.meta.url), 'utf8');
const context = vm.createContext({commitLinkHTML: renderAnchor});
vm.runInContext(before.replace(/^import[^;]*;\s*/gm, '').replace(/^export /gm, '') + '\nglobalThis.before = renderFooterCommitLink;', context);
const original: unknown = context['before'];
if (typeof original !== 'function') throw new Error('Original public footer serializer required');

function capture(full: unknown, short: unknown, candidate: boolean) {
  const dom = new JSDOM('<!doctype html>');
  try {
    const serializer: unknown = candidate ? renderFooterCommitLink : original;
    if (typeof serializer !== 'function') throw new Error('Real footer serializer required');
    const html: unknown = Reflect.apply(serializer, undefined, [full, short, dom.window.document]);
    expect(typeof html).toBe('string');
    if (typeof html !== 'string') throw new Error('Expected public HTML string');
    const host = dom.window.document.createElement('div'); host.innerHTML = html;
    const tree = (node: Node): unknown => ({type: node.nodeType, value: node.nodeValue,
      tag: node instanceof dom.window.Element ? node.tagName : null,
      namespace: node instanceof dom.window.Element ? node.namespaceURI : null,
      attrs: node instanceof dom.window.Element ? [...node.attributes].map(attr => [attr.name, attr.value]) : null,
      children: [...node.childNodes].map(tree)});
    return {tree: [...host.childNodes].map(tree)};
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {error: [error.name, error.message]};
  } finally {dom.window.close();}
}

it.each([
  '', 'abcdef123456789', '<>&"\'abc', '<img src=x onerror=alert(1)>',
  '<!--[--><!--]-->', '&lt;script&gt;literal&lt;/script&gt;',
  'before\r\nafter', 'before\rafter', 'before\u0000after',
  'αβγδεζηθ', null, undefined, false, 0, -0, 42, NaN, Infinity, 7n, Symbol('literal'),
])('retains complete original public anchor DOM for primitive %s', value => {
  expect(capture(value, value, true)).toEqual(capture(value, value, false));
});

it.each([Symbol('literal short'), 7n, null, undefined, false])('retains the independently coerced short primitive %s', short => {
  expect(capture('hash', short, true)).toEqual(capture('hash', short, false));
});

it.each(['none', 'full', 'short'] as const)('retains exact coercion hints/order and %s fault termination', fault => {
  const outputs = [false, true].map(candidate => {
    const trace: string[] = [];
    const value = (name: string) => ({[Symbol.toPrimitive](hint: string) {
      trace.push(name + ':' + hint);
      if (fault === name) throw new Error(name + ' coercion failed');
      return name + '<&"\r\n';
    }});
    return {result: capture(value('full'), value('short'), candidate), trace};
  });
  expect(outputs[1]).toEqual(outputs[0]);
  expect(outputs[0]!.trace).toEqual(fault === 'full' ? ['full:default'] : ['full:default', 'short:string']);
});

it('keeps public arity and complete AppShell SSR independent of the browser facade', () => {
  expect(renderFooterCommitLink.length).toBe(2);
  const html = renderFooter();
  expect(html).toContain('class="app-footer"');
  expect(html).toContain('id="app-commit-hash">···</span>');
  expect(html).toContain('id="main-content"');
});

it('accepts renderer-independent inert root annotations while retaining a literal single anchor', () => {
  const dom = new JSDOM('<!doctype html>');
  const real = anchorComponent.renderHTML;
  const spy = vi.spyOn(anchorComponent, 'renderHTML').mockImplementation(props => {
    const fragment = dom.window.document.createElement('template');
    fragment.innerHTML = real(props);
    const anchor = fragment.content.firstElementChild;
    if (!anchor) throw new Error('Real authored anchor required');
    return '<!--independent outer annotation-->' + anchor.outerHTML + '<!--different root annotation-->';
  });
  try {
    const result = renderFooterCommitLink('literal<&"', 'visible<&"', dom.window.document);
    const host = dom.window.document.createElement('div'); host.innerHTML = result;
    expect(host.childNodes).toHaveLength(1); expect(host.children).toHaveLength(1);
    expect(host.firstElementChild!.getAttribute('href')).toBe('https://github.com/elkimek/get-based/commit/literal<&"');
    expect(host.textContent).toBe('visible<&"');
    expect(host.querySelector('script,img,[onerror],[onclick]')).toBeNull();
  } finally {spy.mockRestore(); dom.window.close();}
});

it('contains no private renderer envelope or child expansion protocol', () => {
  const source = fs.readFileSync(new URL('../js/footer-commit-link-presentation.ts', import.meta.url), 'utf8');
  for (const token of ['<!--[-->', '<!--]-->', 'raw.slice(', 'raw.startsWith(', 'raw.endsWith(']) expect(source).not.toContain(token);
  const calls = fs.readFileSync(new URL('../js/commit-hash.ts', import.meta.url), 'utf8');
  expect(calls).toContain('renderFooterCommitLink(full, short, el.ownerDocument)');
  for (const name of ['AppFooter', 'AppShell']) {
    const component = fs.readFileSync(new URL('../js/components/' + name + '.svelte', import.meta.url), 'utf8');
    expect(component).not.toContain('renderFooterCommitLink');
  }
});
