// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { renderHTML } from '../js/components/LightDevicePresentation.svelte.html.js';
import { renderHTML as renderAffiliate } from '../js/components/LightDeviceAffiliate.svelte.html.js';
import { projectDeviceLibrary, projectDevicePicker } from '../js/light-device-library-presentation.js';
import { projectDeviceChannelChips, renderDeviceChannelChips, relativeTimeShort } from '../js/light-device-view-formatters.js';
import { getLightDeviceAffiliateView, renderLightDeviceAffiliateRow, setProductRecsEnabled } from '../js/recommendations-products.js';
import { CHANNEL_DISPLAY } from '../js/sun.js';
import { state } from '../js/state.js';
import type { LightDeviceRecord, DeviceSessionRecord } from '../js/light-devices-store.js';
import type { ProductCatalog } from '../js/recommendations-products.js';
interface Sample { name: string; devices: LightDeviceRecord[]; sessions: DeviceSessionRecord[]; html: string }
const original = JSON.parse(readFileSync('tests/fixtures/light-device-library-original.json', 'utf8')) as {
  now: number; catalog: ProductCatalog; types: Record<string, {icon?: string;label?: string}>; cases: Sample[]; pickerDevices: LightDeviceRecord[]; pickerHTML: string;
};
const imported = state.importedData;
afterEach(() => { state.importedData = imported; localStorage.clear(); vi.unstubAllGlobals(); });
function semantic(html: string, picker = false) {
  const root = document.createElement('div'); root.innerHTML = html;
  if (picker) {
    // Explicit button types prevent accidental submission if this shared modal is embedded.
    root.querySelectorAll('[data-device-picker-close]').forEach(element => element.setAttribute('type', 'button'));
    const actions = root.querySelector<HTMLElement>('.modal-actions'); actions?.removeAttribute('style');
  }
  const tree = (node: Element): unknown => ({ tag: node.tagName,
    classes: [...node.classList].filter(name => !name.startsWith('gb:')).sort(),
    attrs: Object.fromEntries([...node.attributes].filter(attr => !['class', 'data-light-device-presentation'].includes(attr.name)).map(attr => [attr.name, attr.value])),
    text: [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join('').replace(/\s+/g, ' ').trim(), children: [...node.children].map(tree),
  });
  return [...root.children].map(tree);
}
for (const sample of original.cases) it(`preserves the original device library: ${sample.name}`, () => {
  setProductRecsEnabled(true);
  const cards = projectDeviceLibrary({ devices: sample.devices, sessions: sample.sessions, types: original.types, channels: CHANNEL_DISPLAY, affiliateFor: slug => getLightDeviceAffiliateView(original.catalog, slug), now: original.now });
  expect(semantic(renderHTML({ kind: 'library', cards }))).toEqual(semantic(sample.html));
});
it('preserves the original most-recent-first picker and explicit cancel controls', () => {
  const rows = projectDevicePicker(original.pickerDevices);
  expect(semantic(renderHTML({ kind: 'picker', rows }), true)).toEqual(semantic(original.pickerHTML, true));
  expect(rows.map(row => row.id)).toEqual(original.pickerDevices.map(device => device.id));
  const root = document.createElement('div'); root.innerHTML = renderHTML({ kind: 'picker', rows });
  expect([...root.querySelectorAll('button')].every(button => button.type === 'button')).toBe(true);
});
it('projects canonical chip order, deduplicates known signals and preserves empty HTML exports', () => {
  expect(projectDeviceChannelChips(['pbm_nir','vitamin_d','pbm_nir','unsupported'], CHANNEL_DISPLAY).map(chip => chip.label)).toEqual([CHANNEL_DISPLAY.vitamin_d!.label, CHANNEL_DISPLAY.pbm_nir!.label]);
  for (const value of [null, undefined, {}, [], ['unsupported']]) expect(renderDeviceChannelChips(value, CHANNEL_DISPLAY)).toBe('');
});
it('escapes literal device, picker, signal and affiliate metadata without raw HTML slots', () => {
  const literal = '<img src=x onerror=alert(1)> & "';
  const device: LightDeviceRecord = { id: literal, brand: literal, model: literal, type: literal, channels: ['circadian'] };
  const cards = projectDeviceLibrary({ devices: [device], sessions: [], types: {[literal]:{icon:literal,label:literal}}, channels: {circadian:{icon:literal,label:literal,what:literal}}, affiliateFor: () => null, now: original.now });
  const root = document.createElement('div'); root.innerHTML = renderHTML({kind:'library',cards}) + renderHTML({kind:'picker',rows:projectDevicePicker([device])}) + renderAffiliate({view:{href:'https://www.mitochondriak.com/',event:literal,label:literal,vendor:literal}});
  expect(root.querySelector('img,script,[onerror]')).toBeNull();
  expect(root.querySelector('.light-device-icon')?.textContent).toBe(literal);
  expect(root.querySelector('.light-device-feed-label')?.textContent).toBe(literal);
  expect(root.querySelector<HTMLElement>('[data-id]')?.dataset.id).toBe(literal);
  expect(root.querySelector('.rec-light-device-link')?.getAttribute('aria-label')).toBe(literal);
});
it('retains recommendation consent, regional filtering, trusted hosts and attribution', () => {
  setProductRecsEnabled(false); expect(getLightDeviceAffiliateView(original.catalog, 'fixture-panel')).toBeNull(); expect(renderLightDeviceAffiliateRow(original.catalog, 'fixture-panel')).toBe('');
  setProductRecsEnabled(true);
  for (const [catalog,slug] of [[null,'fixture-panel'],[original.catalog,'missing'],[original.catalog,'']] as const) expect(getLightDeviceAffiliateView(catalog,slug)).toBeNull();
  const view = getLightDeviceAffiliateView(original.catalog, 'fixture-panel')!;
  expect(view).not.toBeNull(); expect(new URL(view.href).searchParams.get('utm_campaign')).toBe('light-devices'); expect(new URL(view.href).searchParams.get('utm_content')).toBe('light-device-fixture-panel'); expect(view.event).toBe('light-device-rec-fixture-panel');
  const blocked = {...original.catalog,products:{'_internal.lightDevices':[{key:'bad',url:'javascript:alert(1)',regions:['INTL']}]}};
  expect(getLightDeviceAffiliateView(blocked,'bad')).toBeNull();
  const regionOnly = {...original.catalog,products:{'_internal.lightDevices':[{...original.catalog.products!['_internal.lightDevices']![0],regions:['CZ']}]}};
  expect(getLightDeviceAffiliateView(regionOnly,'fixture-panel')).toBeNull();
});
it('keeps captured records immutable and counts only matching device histories', () => {
  const sample = original.cases[0]!; const before = JSON.stringify(sample);
  const calls: string[] = []; const cards = projectDeviceLibrary({devices:sample.devices,sessions:sample.sessions,types:original.types,channels:CHANNEL_DISPLAY,affiliateFor:slug=>{calls.push(slug);return null;},now:original.now});
  expect(cards[0]!.stats).toBe('2 sessions · last 2 days ago'); expect(JSON.stringify(sample)).toBe(before); expect(calls).toEqual([]);
  for (const [days,copy] of [[0,'today'],[1,'yesterday'],[6,'6 days ago'],[7,'1 week ago'],[14,'2 weeks ago'],[30,'1 month ago'],[365,'1 year ago']] as const) expect(relativeTimeShort(original.now-days*86400000,original.now)).toBe(copy);
});
