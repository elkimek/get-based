// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { LightDeviceRecord } from '../js/light-devices-store.js';
import { renderHTML } from '../js/components/LightDeviceSetup.svelte.html.js';
import { projectDevicePresets, projectDeviceCustomSetup, formatDevicePresetSpecification, deviceTypeOptions } from '../js/light-device-setup-presentation.js';
interface OriginalCase {
  kind: 'custom' | 'presets'; name: string; hasAI: boolean; hasVision?: boolean; unit?: string;
  presets?: LightDeviceRecord[]; types?: Record<string, { icon?: string; label?: string }>; html: string;
}
const original = JSON.parse(readFileSync('tests/fixtures/light-device-setup-original.json','utf8')) as { cases: OriginalCase[] };
function semantic(html: string) {
  const root = document.createElement('div'); root.innerHTML = html;
  // Declared improvements: button types and an explicit accessible URL name.
  for (const button of root.querySelectorAll('button')) button.type = 'button';
  root.querySelector('#custom-dev-url')?.setAttribute('aria-label','Product page URL');
  const tree = (element: Element): unknown => ({
    tag: element.tagName,
    classes: [...element.classList].filter(name => !name.startsWith('gb:')).sort(),
    attrs: Object.fromEntries([...element.attributes].filter(attr => !['class','style','data-light-device-setup'].includes(attr.name)).map(attr => [attr.name,attr.value])),
    text: [...element.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').replace(/\s+/g,' ').trim(),
    children: [...element.children].map(tree),
  });
  return [...root.children].map(tree);
}
for (const sample of original.cases) it(`preserves original setup semantics: ${sample.name}`, () => {
  const html = sample.kind === 'presets'
    ? renderHTML({kind:'presets',view:projectDevicePresets({presets:sample.presets!,types:sample.types!,hasAI:sample.hasAI})})
    : renderHTML({kind:'custom',view:projectDeviceCustomSetup({hasAI:sample.hasAI,hasVision:!!sample.hasVision,unitSystem:sample.unit})});
  expect(semantic(html)).toEqual(semantic(sample.html));
  const root = document.createElement('div'); root.innerHTML = html;
  expect(root.querySelector('[style]')).toBeNull();
  expect([...root.querySelectorAll('button')].every(button => button.type === 'button')).toBe(true);
});
it('retains curated type order, per-group record order, safe labels and immutable input', () => {
  const sample = original.cases.find(sample => sample.name === 'presets-manual-full')!;
  const input = {presets:sample.presets!.slice().reverse(),types:sample.types!,hasAI:false};
  const before = JSON.stringify(input); const view = projectDevicePresets(input);
  expect(view.groups.map(group => group.id)).toEqual(['uvb','uva','combined','pbm-targeted','sad','dawn-sim','full-spectrum'].map(type => `add-device-group-${type}`));
  expect(JSON.stringify(input)).toBe(before);
  const root = document.createElement('div'); root.innerHTML = renderHTML({kind:'presets',view});
  expect(root.querySelector('img,script,[onerror]')).toBeNull();
  expect(root.querySelector('#add-device-group-full-spectrum')?.textContent).toBe('☀ Literal <group> & "label"');
  expect(root.querySelector('[data-preset-id="unsupported"]')).toBeNull();
  expect(root.querySelector('.light-device-preset-name')?.textContent).toBe('Saved Reference uvb');
  const duplicates = projectDevicePresets({presets:[{id:'b',type:'uvb'},{id:'a',type:'uvb'}],types:{},hasAI:false});
  expect(duplicates.groups[0]!.rows.map(row => row.id)).toEqual(['b','a']);
});
it('retains numeric display guards and irradiance, photopic and melanopic priority', () => {
  expect(formatDevicePresetSpecification({peakWavelengths:[850,660],mwPerCm2At15cm:20,lux:10000,melanopicEdiLux:500,recommendedDistanceCm:25})).toBe('850/660 nm · 20 mW/cm² · 25 cm');
  expect(formatDevicePresetSpecification({mwPerCm2At15cm:0,lux:10000,melanopicEdiLux:500})).toBe(`${(10000).toLocaleString()} lux`);
  expect(formatDevicePresetSpecification({lux:-1,melanopicEdiLux:425})).toBe('425 lx M-EDI');
  expect(formatDevicePresetSpecification({mwPerCm2At15cm:NaN,recommendedDistanceCm:-1,peakWavelengths:[]})).toBe('');
});
it('keeps provider visibility, unit defaults and all seven native type options', () => {
  expect(projectDeviceCustomSetup({hasAI:false,hasVision:true,unitSystem:'US'})).toEqual({hasAI:false,hasVision:false,unit:'in',distancePlaceholder:'e.g. 6'});
  expect(projectDeviceCustomSetup({hasAI:true,hasVision:false,unitSystem:'SI'})).toEqual({hasAI:true,hasVision:false,unit:'cm',distancePlaceholder:'e.g. 15'});
  expect(deviceTypeOptions.map(option => option.value)).toEqual(['combined','uvb','uva','pbm-targeted','sad','dawn-sim','full-spectrum']);
});
