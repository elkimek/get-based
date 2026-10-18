import {describe, expect, it} from 'vitest';
import {JSDOM} from 'jsdom';
import {
  projectActiveShare, projectCreateShare, projectResultShare, projectShareShell,
  renderActiveShare, renderCreateShare, renderResultShare, renderLoadShare, renderShareShell,
} from '../js/profile-share-presentation.js';
import type {ShareRecord, ShareResultReader} from '../types/profile-share.js';

function parse(html: string): DocumentFragment {
  const document = new JSDOM('<!doctype html><html><head></head><body></body></html>').window.document;
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}
// Genuine child components split existing whitespace with explicit inert anchors.
// Keep every original whitespace byte and check the complete intervening comment list.
function boundary(element: Element, direction: 'previousSibling' | 'nextSibling') {
  const text: string[] = [], comments: string[] = [];
  for (let node = element[direction]; node && node.nodeType !== 1; node = node[direction]) {
    expect([3, 8]).toContain(node.nodeType);
    const target = node.nodeType === 3 ? text : comments;
    if (direction === 'previousSibling') target.unshift(node.nodeValue || '');
    else target.push(node.nodeValue || '');
  }
  return {text: text.join(''), comments};
}
const empty = () => projectActiveShare([], () => '', () => 'p');
const result = (overrides: Partial<ShareResultReader> = {}): ShareResultReader => ({
  profileName: 'Alice', shareUrl: 'https://example.invalid/#share=abcdefghijabcdefghij',
  password: 'separate-password', expiresAt: '2030-01-01T00:00:00Z', ...overrides,
});

describe('profile sharing owned presentation', () => {
  it('retains required consent and native create-form defaults', () => {
    const root = parse(renderCreateShare(() => 'Alice', () => 'p', 'native-secret', empty));
    const password = root.querySelector<HTMLInputElement>('#profile-share-password')!;
    const consent = root.querySelector<HTMLInputElement>('#profile-share-consent')!;
    const expiry = root.querySelector<HTMLSelectElement>('#profile-share-expires')!;
    expect([password.type, password.value, password.defaultValue, password.autocomplete, password.getAttribute('spellcheck')])
      .toEqual(['text', 'native-secret', 'native-secret', 'off', 'false']);
    expect([consent.type, consent.checked, consent.defaultChecked, consent.required, consent.validity.valueMissing])
      .toEqual(['checkbox', false, false, true, true]);
    expect([expiry.value, expiry.selectedIndex, ...[...expiry.options].map(option => option.defaultSelected)])
      .toEqual(['7', 0, false, false, false]);
    expect(root.querySelector('#profile-share-status')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('button[data-profile-share-action="create"]')!.getAttribute('type')).toBe('submit');
  });
  it('retains password-only load form, cancellation, and native empty defaults', () => {
    const root = parse(renderLoadShare('abcdefghijabcdefghij'));
    const input = root.querySelector<HTMLInputElement>('#profile-share-load-password')!;
    expect([input.type, input.value, input.defaultValue, input.autocomplete, input.required])
      .toEqual(['password', '', '', 'current-password', false]);
    expect(root.querySelector('form')!.getAttribute('data-share-id')).toBe('abcdefghijabcdefghij');
    expect(root.querySelector('[data-profile-share-action="close"]')!.textContent).toBe('Cancel');
  });
  it('escapes arbitrary metadata in both text and native attributes', () => {
    const value = '<img src=x onerror=alert(1)>"&\'\u2603';
    const root = parse(renderCreateShare(() => value, () => value, value, empty));
    expect(root.querySelector('b')!.textContent).toBe(value);
    expect(root.querySelector('form')!.getAttribute('data-profile-id')).toBe(value);
    expect(root.querySelector<HTMLInputElement>('input')!.defaultValue).toBe(value);
    expect(root.querySelectorAll('img,[onerror],script')).toHaveLength(0);
  });
  it('preserves result read-only defaults and separate copy targets', () => {
    const root = parse(renderResultShare(result(), () => 'original formatted expiry', empty));
    expect([...root.querySelectorAll<HTMLInputElement>('input')].map(input => [input.id, input.readOnly, input.value, input.defaultValue]))
      .toEqual([['profile-share-link', true, result().shareUrl, result().shareUrl], ['profile-share-result-password', true, 'separate-password', 'separate-password']]);
    expect([...root.querySelectorAll('[data-copy-target]')].map(node => node.getAttribute('data-copy-target')))
      .toEqual(['profile-share-link', 'profile-share-result-password']);
    expect(root.querySelector('.profile-share-note')!.textContent).toBe('Expires original formatted expiry. Recipients import this as a new profile.');
  });
  it('retains active link actions, safe attributes, and literal SVG', () => {
    const record: ShareRecord = {id: 'id"<', profileId: 'p', profileName: 'Alice', shareUrl: 'https://example.invalid/?a="&b=<', manageToken: 'not-presented', createdAt: '', expiresAt: 'expiry'};
    const root = parse(renderActiveShare([record], value => String(value), () => 'p'));
    expect(root.querySelector('[data-profile-share-record]')!.getAttribute('data-profile-share-record')).toBe(record.id);
    expect(root.querySelector('[data-copy-value]')!.getAttribute('data-copy-value')).toBe(record.shareUrl);
    expect(root.querySelector('[data-share-id]')!.getAttribute('data-share-id')).toBe(record.id);
    expect(root.querySelectorAll('svg')).toHaveLength(1);
    expect(root.textContent).not.toContain('not-presented');
  });
  it('keeps empty links and shell native dialog/header/close attributes', () => {
    const root = parse(renderShareShell('Share Profile', 'Encrypted Link', {kind: 'active', view: empty()}));
    expect(root.querySelector('#profile-share-overlay')!.className).toBe('modal-overlay');
    expect(root.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('Share Profile');
    expect(root.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    expect(root.querySelector('.modal-close')!.textContent).toBe('×');
    expect(root.querySelector('.profile-share-active-empty')!.textContent).toBe('No active links created on this device.');
  });
  it('retains create projection read/coercion order and stops at throws', () => {
    const trace: string[] = [];
    const value = (label: string) => ({toString() {trace.push(`string:${label}`); return label;}});
    projectCreateShare(() => {trace.push('name'); return value('name');}, () => {trace.push('id'); return value('id');}, value('secret'), () => {trace.push('active'); return empty();});
    expect(trace).toEqual(['name', 'string:name', 'id', 'string:id', 'string:secret', 'active']);
    trace.length = 0;
    expect(() => projectCreateShare(() => {throw new Error('name failed');}, () => {trace.push('id'); return '';}, '', empty)).toThrow('name failed');
    expect(trace).toEqual([]);
  });
  it('retains result getter order without coercing profileId ahead of active list', () => {
    const trace: string[] = [];
    const input: ShareResultReader = {
      get profileName() {trace.push('name'); return 'Alice';},
      get shareUrl() {trace.push('url'); return 'link';},
      get password() {trace.push('password'); return 'secret';},
      get expiresAt() {trace.push('expiry'); return 'date';},
    };
    projectResultShare(input, () => {trace.push('format'); return 'formatted';}, () => {trace.push('active'); return empty();});
    expect(trace).toEqual(['name', 'url', 'password', 'expiry', 'format', 'active']);
  });
  it('retains two independent row ID coercions before section profile-id read', () => {
    const trace: string[] = [];
    const record: ShareRecord = {
      get id() {trace.push('id'); return 'id';}, get expiresAt() {trace.push('expiry'); return 'expiry';},
      get shareUrl() {trace.push('url'); return 'url';}, profileId: 'p', profileName: 'name', manageToken: '', createdAt: '',
    };
    projectActiveShare([record], () => {trace.push('format'); return 'formatted';}, () => {trace.push('profile'); return 'p';});
    expect(trace).toEqual(['id', 'expiry', 'format', 'url', 'id', 'profile']);
  });
  it('retains title attribute/kicker/title coercion and nullish/Symbol metadata law', () => {
    const trace: string[] = [];
    const title = {toString() {trace.push('title'); return 'title';}};
    const kicker = {toString() {trace.push('kicker'); return 'kicker';}};
    projectShareShell(title, kicker, {kind: 'active', view: empty()});
    expect(trace).toEqual(['title', 'kicker', 'title']);
    expect(parse(renderLoadShare(null)).querySelector('form')!.getAttribute('data-share-id')).toBe('');
    expect(parse(renderLoadShare(Symbol('safe'))).querySelector('form')!.getAttribute('data-share-id')).toBe('Symbol(safe)');
  });
});


describe('profile sharing native composition boundaries', () => {
  it('preserves every native whitespace byte and exact genuine child boundary around active links', () => {
    const create = parse(renderCreateShare(() => 'Alice', () => 'p', 'secret', empty));
    const active = create.querySelector('.profile-share-active')!;
    expect(boundary(active, 'previousSibling'))
      .toEqual({text: '\n      \n    ', comments: ['']});
    expect(boundary(active, 'nextSibling'))
      .toEqual({text: '\n  \n    ', comments: ['']});
    const ready = parse(renderResultShare(result(), () => 'formatted', empty));
    const links = ready.querySelector('.profile-share-active')!;
    expect(boundary(links, 'previousSibling'))
      .toEqual({text: '\n      \n    ', comments: ['']});
    expect(boundary(links, 'nextSibling'))
      .toEqual({text: '\n  \n      ', comments: ['']});
  });
  it('preserves literal marker-like metadata and native shell whitespace with exact genuine boundaries', () => {
    const value = '<!---->getbased-profile-share-private-owned-slot<!---->';
    const body = {kind: 'load' as const, view: {id: value}};
    const root = parse(renderShareShell(value, value, body));
    const formBody = root.querySelector('.profile-share-body')!;
    expect(boundary(formBody, 'previousSibling'))
      .toEqual({text: '\n        \n    ', comments: ['[-1', '']});
    expect(boundary(formBody, 'nextSibling'))
      .toEqual({text: '\n  \n      ', comments: [']', '']});
    expect(root.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe(value);
    expect(root.querySelector('.gb-modal-title')!.textContent).toBe(value);
    expect(root.querySelector('form')!.getAttribute('data-share-id')).toBe(value);
  });
});
