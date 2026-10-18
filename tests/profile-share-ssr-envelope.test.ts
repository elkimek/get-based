// @vitest-environment jsdom
import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {projectShareShell, renderLoadShare, renderShareShell, type ShareBodyView} from '../js/profile-share-presentation.js';

const slot = '<!---->getbased-profile-share-private-owned-slot<!---->';
const checksumSlot = '<!--bjcsq5-->getbased-profile-share-private-owned-slot<!---->';
const rawBody = (value: unknown) => value as ShareBodyView;
const rejectsRaw = (value: unknown) => {
  expect(() => projectShareShell('name', 'kicker', rawBody(value)))
    .toThrow('Profile share body must be a typed owner view');
  expect(() => renderShareShell('name', 'kicker', rawBody(value)))
    .toThrow('Profile share body must be a typed owner view');
};

describe('profile sharing typed composition boundaries', () => {
  it('rejects raw root envelope strings instead of accepting them as child owners', () => {
    for (const html of ['<div></div>', '<!--[--><div></div><!--]-->', '<!--[--><!----><div></div>', '<!--[--><!----><div></div><!--wrong-->']) rejectsRaw(html);
    for (const invalid of [null, undefined, {}, {kind: 'unknown'}, 1, false]) rejectsRaw(invalid);
  });
  it('rejects missing and repeated former HTML slots before rendering a child', () => {
    for (const content of ['', slot, slot + slot]) rejectsRaw(content);
    const host = document.createElement('template');
    host.innerHTML = renderShareShell('name', 'kicker', {kind: 'load', view: {id: 'p'}});
    expect(host.content.querySelectorAll('[data-profile-share-form="load"]')).toHaveLength(1);
    expect(host.content.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.content.querySelectorAll('[data-share-id="p"]')).toHaveLength(1);
  });
  it('renders a genuine child once and preserves literal comments and sentinel collisions as data', () => {
    const child = `<!--literal-->${slot}<!--[-->text<!--]--><img data-probe src=x>`;
    const host = document.createElement('template');
    host.innerHTML = renderShareShell(child, child, {kind: 'load', view: {id: child}});
    expect(host.content.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(child);
    expect(host.content.querySelector('.gb-modal-title')?.textContent).toBe(child);
    expect(host.content.querySelector('.gb-modal-kicker')?.textContent).toBe(child);
    expect(host.content.querySelector('[data-share-id]')?.getAttribute('data-share-id')).toBe(child);
    expect(host.content.querySelectorAll('[data-profile-share-form="load"]')).toHaveLength(1);
    expect(host.content.querySelectorAll('img,[data-probe]')).toHaveLength(0);
    const comments: string[] = [];
    const walker = document.createTreeWalker(host.content, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) comments.push(walker.currentNode.nodeValue ?? '');
    expect(comments).not.toContain('literal');
    expect(comments.every(value => ['', '[', ']', '[-1'].includes(value))).toBe(true);
    const standalone = document.createElement('template'); standalone.innerHTML = renderLoadShare(child);
    expect(standalone.content.querySelector('[data-share-id]')?.getAttribute('data-share-id')).toBe(child);
    expect(standalone.content.querySelectorAll('img,[data-probe]')).toHaveLength(0);
  });
  it('rejects mixed or invented checksum slots and has no raw HTML composition path', () => {
    for (const content of [checksumSlot, slot + checksumSlot, checksumSlot + checksumSlot,
      '<!--wrong-->getbased-profile-share-private-owned-slot<!---->']) rejectsRaw(content);
    const source = readFileSync('js/profile-share-presentation.ts', 'utf8');
    expect(source).not.toMatch(/getbased-profile-share-private-owned-slot|compilerHash|nativeOwnedHTML|composeOwnedHTML|bodyHtml/);
    for (const name of ['ProfileShareShell', 'ProfileShareBody', 'ProfileShareCreate', 'ProfileShareResult'])
      expect(readFileSync(`js/components/${name}.svelte`, 'utf8')).not.toContain('{@html');
    expect(readFileSync('js/components/ProfileShareShell.svelte', 'utf8')).toContain('<ProfileShareBody body={view.body} />');
  });
});
