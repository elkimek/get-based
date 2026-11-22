// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {afterEach, expect, it} from 'vitest';
import {renderHTML} from '../js/components/LightCameraPresentation.svelte.html.js';
import {renderHTML as renderGuide} from '../js/components/LightCameraGuidePresentation.svelte.html.js';
import {projectAimingGuide, type CameraToolKey, type CameraMessageView, type CameraLockDisplay, type CameraToolPresentationProps, type CameraGuidePresentationProps} from '../js/light-camera-presentation.js';
import {aimingGuideHTML, dismissAimingGuide} from '../js/light-tool-camera.js';
import {expectNativeReview} from './helpers/native-review-dom.js';

const load = createRequire(import.meta.url);
function checkNativeCamera(props: CameraToolPresentationProps) {
  const native = load('../js/components/LightCameraPresentation.svelte.native.js') as typeof import('../js/components/LightCameraPresentation.svelte.native.js');
  const reference = host(renderHTML(props));
  const video = reference.querySelector('video');
  if (video) {
    // The client compiler sets the live media property. HTML carries the default.
    expect(video.defaultMuted).toBe(true);
    video.removeAttribute('muted');
  }
  return expectNativeReview(reference.innerHTML, root => {
    const mounted = native.mount(native.default, {target: root, props});
    native.flushSync();
    return () => native.unmount(mounted);
  }, root => {
    if (video) expect(root.querySelector('video')?.muted).toBe(true);
    else expect(root.querySelector('video')).toBeNull();
  });
}
function checkNativeGuide(props: CameraGuidePresentationProps) {
  const native = load('../js/components/LightCameraGuidePresentation.svelte.native.js') as typeof import('../js/components/LightCameraGuidePresentation.svelte.native.js');
  return expectNativeReview(renderGuide(props), root => {
    const mounted = native.mount(native.default, {target: root, props});
    native.flushSync();
    return () => native.unmount(mounted);
  });
}

const original = JSON.parse(readFileSync('tests/fixtures/light-camera-original.json','utf8')) as {
  shells: {key: CameraToolKey; initial: string; authored: string; denied: string}[]; guides: {key: string; html: string}[];
  locks: {lock: CameraLockDisplay; html: string}[]; messages: {view: CameraMessageView; html: string}[];
};
function host(html: string) {const element=document.createElement('div');element.innerHTML=html;return element;}
const text=(node: Element)=>node.textContent?.replace(/\s+/g,' ').trim();
interface Structure {tag: string; text: string | undefined; attributes: Record<string,string>; children: Structure[]}
function structure(node: Element): Structure {
  const attributes=Object.fromEntries([...node.attributes].filter(attr=>!['class','style','data-light-tool-view'].includes(attr.name) && !(node.tagName==='BUTTON' && attr.name==='type')).map(attr=>[attr.name,attr.value]));
  return {tag:node.tagName,text:text(node),attributes,children:[...node.children].map(structure)};
}
const zones = [...host(original.shells[0]!.initial).querySelectorAll('.lux-zone-marker')].map(node=>({max: Number(node.textContent?.match(/\d+/)?.[0]),label:text(node.querySelector('span')!)!}));
afterEach(()=>{localStorage.clear();document.body.innerHTML='';});
for(const sample of original.shells) it(`preserves the complete native ${sample.key} shell contract`,async ()=>{
  const props = {kind:'shell',view:{tool:sample.key,guide:projectAimingGuide(sample.key),zones}} as const;
  const current=host(renderHTML(props));
  expect(structure(current)).toEqual(structure(host(sample.authored)));
  expect([...current.querySelectorAll('button')].every(button=>button.type==='button')).toBe(true);
  expect(current.querySelectorAll('[data-light-tool-modal-action]')).toHaveLength(2);
  await checkNativeCamera(props);
});
for(const sample of original.guides) it(`preserves guide copy, emphasis and dismiss contract: ${sample.key}`,async ()=>{
  const props = {kind:'guide',guide:projectAimingGuide(sample.key)} as const;
  expect(structure(host(renderGuide(props)))).toEqual(structure(host(sample.html)));
  await checkNativeGuide(props);
});
for(const [index,sample] of original.locks.entries()) it(`preserves camera lock display: ${index}`,async ()=>{
  const props = {kind:'lock',lock:sample.lock} as const;
  expect(structure(host(renderGuide(props)))).toEqual(structure(host(sample.html)));
  await checkNativeGuide(props);
});
for(const [index,sample] of original.messages.entries()) it(`preserves result content and structure: ${sample.view.kind}/${index}`,async ()=>{
  const before=structuredClone(sample.view);
  expect(structure(host(renderHTML(sample.view)))).toEqual(structure(host(sample.html)));
  await checkNativeCamera(sample.view);
  expect(sample.view).toEqual(before);
});
it('preserves per-tool dismissal through the stable facade',()=>{
  document.body.innerHTML=aimingGuideHTML('lux');
  dismissAimingGuide('lux');
  expect(document.querySelector<HTMLElement>('.tool-aiming-guide')?.style.display).toBe('none');
  expect(localStorage.getItem('labcharts-aim-guide-lux')).toBe('dismissed');
  expect(aimingGuideHTML('lux')).toBe('');
  expect(aimingGuideHTML('cct')).not.toBe('');
  expect(projectAimingGuide('unknown')).toBeNull();
  expect(projectAimingGuide('__proto__')).toBeNull();
});
it('escapes literal guide and camera result fields without raw HTML slots',()=>{
  const literal='<img src=x onerror=alert(1)>"<&';
  const guide={key:literal,mode:literal,before:literal,emphasis:literal,after:literal,webcam:literal};
  const html=host(renderGuide({kind:'guide',guide}));
  expect(html.querySelector('img,[onerror],script')).toBeNull();
  expect(html.querySelector('[data-tool]')?.getAttribute('data-tool')).toBe(literal);
  const result=host(renderHTML({kind:'spectrum-reading',result:{label:literal,reason:literal,confidence:.4,melanopic:.2,circadian:'blue-poor'}}));
  expect(result.querySelector('img,[onerror],script')).toBeNull();expect(text(result)).toContain(literal);
});
it('removes native camera templates, guide HTML slots and ordinary camera CSS',()=>{
  for(const name of ['camera','lux-meter','flicker-detector','darkness-meter','cct-meter','spectrum-classifier','glass-transmission']) {
    const source=readFileSync(`js/light-tool-${name}.ts`,'utf8');
    expect(source).not.toMatch(/innerHTML\s*(?:\+?=)\s*[`'"]|return\s*`</);
  }
  for(const name of ['LightAimingGuide','LightCameraResult','LightCameraPresentation','LightCameraGuidePresentation','LightAuditWalkthrough']) expect(readFileSync(`js/components/${name}.svelte`,'utf8')).not.toContain('{@html');
  expect(readFileSync('css/light-tools.base.css','utf8')).not.toMatch(/\.lux-|\.flicker-|\.dark-|\.cct-|\.spec-|\.glass-|\.tool-aiming-guide/);
});
