import {describe, expect, it} from 'vitest';
import {JSDOM} from 'jsdom';
import type {ProfileRecord} from '../js/profile.js';
import {clientListText, projectClientListRow, projectClientListTag, renderClientListMenuButton, renderClientListOverview} from '../js/client-list-presentation.js';

const profile = (overrides: Partial<ProfileRecord> = {}): ProfileRecord => ({
  id: 'ada', name: 'Ada', avatar: null, lastUpdated: 123, notes: 'line one\nline two',
  status: 'active', pinned: false, tags: ['one'], sex: null, dob: null,
  location: {country: '', zip: ''}, height: null, heightUnit: 'cm', createdAt: 1,
  ...overrides,
});
const renderOneRow = (
  p: ProfileRecord, activeId: string | null,
  timeAgo: (timestamp: number | null | undefined) => string, avatarColor: (id: string) => string,
): string => renderClientListOverview({
  activeCount: 1, search: '', sort: 'lastUpdated', status: 'active',
  showTags: false, tags: [], clearTag: false, archivedCount: 0, empty: false,
  rows: [projectClientListRow(p, activeId, timeAgo, avatarColor)], archivedRows: null,
});
const parseRow = (p: ProfileRecord) => {
  const document = new JSDOM('').window.document;
  document.body.innerHTML = renderOneRow(p, 'ada', () => 'just now', () => '#4f8cff');
  return document;
};

describe('Client List presentation boundaries', () => {
  it('retains the original getter order around time, tags, avatar, and three action IDs', () => {
    const trace: string[] = [];
    const source = profile();
    const p = new Proxy(source, {get(target, key, receiver) {
      trace.push(String(key));
      return Reflect.get(target, key, receiver);
    }});
    projectClientListRow(p, 'ada', ts => {trace.push(`time:${ts}`); return 'just now';}, id => {trace.push(`color:${id}`); return '#4f8cff';});
    expect(trace).toEqual([
      'id', 'lastUpdated', 'time:123', 'notes', 'id', 'name', 'status', 'pinned',
      'tags', 'tags', 'tags', 'id', 'avatar', 'id', 'color:ada', 'name', 'name', 'id', 'id',
    ]);
  });
  it('reads safe avatar three times and skips the initial/color branch', () => {
    const trace: string[] = [];
    const p = profile();
    Object.defineProperty(p, 'avatar', {get() {trace.push('avatar'); return 'data:image/png;base64,AA';}});
    const view = projectClientListRow(p, 'ada', () => '', () => {throw new Error('unexpected color');});
    expect(trace).toEqual(['avatar', 'avatar', 'avatar']);
    expect(view.avatar).toEqual({kind: 'image', source: 'data:image/png;base64,AA'});
  });
  it('rejects unsupported avatar URLs via the original initial branch', () => {
    expect(projectClientListRow(profile({avatar: 'https://example.invalid/avatar'}), 'ada', () => '', () => '#4f8cff').avatar)
      .toEqual({kind: 'initial', color: '#4f8cff', initial: 'A'});
  });
  it('retains nullish-only escaping and the two independent tag String conversions', () => {
    expect([null, undefined, false, 0, ''].map(clientListText)).toEqual(['', '', 'false', '0', '']);
    const trace: string[] = [];
    const tag = {toString() {trace.push('String'); return 'x<&';}};
    expect(projectClientListTag(tag, false)).toEqual({active: false, value: 'x<&', text: 'x<&'});
    expect(trace).toEqual(['String', 'String']);
  });
  it('preserves fallback labels, note truncation before newline replacement, and bad numeric names throwing', () => {
    const view = projectClientListRow(profile({name: '', notes: 'x'.repeat(59) + '\ny'}), null, () => '', () => '#4f8cff');
    expect(view.label).toBe('client');
    expect(view.note).toBe('x'.repeat(59) + ' ');
    expect(view.avatar).toEqual({kind: 'initial', color: '#4f8cff', initial: '?'});
    expect(() => projectClientListRow(profile({name: 42 as unknown as string}), null, () => '', () => '#4f8cff')).toThrow(TypeError);
  });
  it('retains native buttons, actionable row attributes, accessible labels, and omitted button defaults', () => {
    const document = parseRow(profile({name: 'A<&"', tags: ['<b>x</b>'], pinned: true, status: 'flagged'}));
    const row = document.querySelector('.cl-row')!;
    expect([...row.attributes].map(attr => [attr.name, attr.value])).toEqual([
      ['class', 'cl-row cl-row-active'], ['data-id', 'ada'], ['data-cl-action', 'select-profile'],
      ['data-cl-profile-id', 'ada'], ['data-cl-key-action', 'select-profile'], ['role', 'button'], ['tabindex', '0'],
    ]);
    expect(document.querySelector('.cl-row-name')!.textContent).toBe('A<&"');
    expect(document.querySelector('.cl-row-tag')!.textContent).toBe('<b>x</b>');
    expect(document.querySelector('.cl-row-tag b')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('.cl-row-edit')!.type).toBe('button');
    expect(document.querySelector('.cl-row-edit')!.getAttribute('aria-label')).toBe('Edit A<&"');
    expect([...document.querySelectorAll('.cl-badge')].map(node => node.textContent)).toEqual(['flagged', 'pinned']);
  });
  it('hardens only the formerly raw uppercase initial against element injection', () => {
    const value = {0: {toUpperCase() {return '<img data-injected="true">';}}};
    const document = parseRow(profile({name: value as unknown as string}));
    expect(document.querySelector('.cl-avatar')!.textContent).toBe('<img data-injected="true">');
    expect(document.querySelector('[data-injected]')).toBeNull();
  });
  it('retains template-literal Symbol failure and conversion hints for initial/palette results', () => {
    const value = {0: {toUpperCase() {return Symbol('initial');}}};
    expect(() => projectClientListRow(profile({name: value as unknown as string}), null, () => '', () => '#4f8cff')).toThrow(TypeError);
    const trace: string[] = [];
    const color = {[Symbol.toPrimitive](hint: string) {trace.push(hint); return '#4f8cff';}};
    projectClientListRow(profile(), null, () => '', () => color as unknown as string);
    expect(trace).toEqual(['string']);
  });
  it('menu omits nullish action IDs, preserves falsy nonnull IDs, and inserts only owned literal SVG', () => {
    const document = new JSDOM('').window.document;
    for (const id of [null, undefined, false, 0, '']) {
      document.body.innerHTML = renderClientListMenuButton('trash', '<img onerror=x>', 'delete-profile', id, true);
      const button = document.querySelector('button')!;
      expect(button.getAttribute('data-cl-profile-id')).toBe(id == null ? null : String(id));
      expect(button.type).toBe('button');
      expect(button.className).toBe('cl-menu-item cl-menu-danger');
      expect(button.querySelector('span')!.textContent).toBe('<img onerror=x>');
      expect(button.querySelectorAll('svg')).toHaveLength(1);
      expect(button.querySelector('img')).toBeNull();
    }
  });
  it('projects all coercions before a caller can replace an existing DOM transaction', () => {
    const document = new JSDOM('<div id="host"><button>Retain</button></div>').window.document;
    const host = document.getElementById('host')!;
    const previous = host.firstChild;
    const p = profile();
    Object.defineProperty(p, 'name', {get() {throw new Error('name');}});
    expect(() => {host.innerHTML = renderOneRow(p, null, () => '', () => '#4f8cff');}).toThrow('name');
    expect(host.firstChild).toBe(previous);
  });
});
