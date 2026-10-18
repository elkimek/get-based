import fs from 'node:fs';
import {expect, it} from 'vitest';
import {restorePreviousSharedButtonSelectors} from './helpers/shared-button-specificity-inverse.js';
const current = () => fs.readFileSync('css/app-shell.css', 'utf8');
it('admits only the four zero-specificity exclusions and mobile receiver while leaving the frozen sheet exact', () => {
  expect(restorePreviousSharedButtonSelectors('app-shell', current())).toBe(fs.readFileSync('tests/fixtures/shared-app-shell-original.css', 'utf8'));
});
it.each(['missing', 'duplicate', 'old-priority', 'declaration', 'media'] as const)('rejects %s corruption in the explicit selector correction', kind => {
  let css = current();
  const selector = '.import-btn:not(:where([data-chat-empty-view] *))';
  if (kind === 'missing') css = css.replace(selector, '.unreviewed-button');
  if (kind === 'duplicate') css += '\n' + selector + ' {color:red;}';
  if (kind === 'old-priority') css = css.replace(selector, '.import-btn:not([data-chat-empty-view] *)');
  if (kind === 'declaration') css = css.replace(selector + ' {', selector + ' { color:red;');
  if (kind === 'media') {
    const start = css.indexOf(selector);
    const end = css.indexOf('}', start) + 1;
    css = css.slice(0, start) + '@media print {' + css.slice(start, end) + '}' + css.slice(end);
  }
  expect(css).not.toBe(current());
  expect(() => restorePreviousSharedButtonSelectors('app-shell', css)).toThrow();
});

it.each(['missing','declaration','media'] as const)('rejects mobile sidebar %s corruption while retaining native shell bytes', kind=>{
 let css=current();
 if(kind==='missing')css=css.replace('#sidebar-nav.sidebar','#unreviewed.sidebar');
 if(kind==='declaration')css=css.replace('#sidebar-nav.sidebar {','#sidebar-nav.sidebar { z-index:0;');
 if(kind==='media'){const position=css.lastIndexOf('(max-width: 1024px)',css.indexOf('#sidebar-nav.sidebar'));expect(position).toBeGreaterThan(0);css=css.slice(0,position)+css.slice(position).replace('(max-width: 1024px)','(max-width: 999px)');}
 expect(css).not.toBe(current());expect(()=>restorePreviousSharedButtonSelectors('app-shell',css)).toThrow();
});
