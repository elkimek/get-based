// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
const fault=vi.hoisted(()=>({change:null as null|((raw:string)=>string)}));
vi.mock('../js/dashboard-biometric-presentation.js',async importOriginal=>{const original=await importOriginal<typeof import('../js/dashboard-biometric-presentation.js')>();return {...original,renderDashboardBiometricPresentation:(view:Parameters<typeof original.renderDashboardBiometricPresentation>[0])=>{const raw=original.renderDashboardBiometricPresentation(view);return fault.change?fault.change(raw):raw;}};});
import {renderDashboardBiometricPresentation} from '../js/dashboard-biometric-presentation.js';
import {expectedOwnedBiometricRaw} from './helpers/dashboard-biometric-owned-receipts.js';
import originals from './fixtures/dashboard-biometric-presentation-original.json' with {type:'json'};
const native=originals.find(row=>row.name==='one-populated')!.original;
const view={kind:'wearables' as const,count:'1',pluralSuffix:'',sync:null,rows:[{kind:'populated' as const,remove:{id:'weight',label:'Weight'},id:'weight',accessibleLabel:'Weight: 72 <&> " kg',label:'Weight',value:'72 <&> "',unit:'kg',change:'-1 <&>'}]};
function semantic(raw:string){const host=document.createElement('template');host.innerHTML=raw;return host.innerHTML;}
afterEach(()=>{fault.change=null;});
it('genuine Biometrics SSR matches the independent native-field skeleton',()=>{expect(renderDashboardBiometricPresentation(view)).toBe(expectedOwnedBiometricRaw(native.dom));});
it('same-DOM production quote corruption cannot change the independent expected raw',()=>{const before=expectedOwnedBiometricRaw(native.dom);fault.change=raw=>raw.replace('type="button"',"type='button'");const actual=renderDashboardBiometricPresentation(view);expect(semantic(actual)).toBe(semantic(before));expect(actual).not.toBe(before);expect(expectedOwnedBiometricRaw(native.dom)).toBe(before);expect(()=>expect(actual).toBe(expectedOwnedBiometricRaw(native.dom))).toThrow();});
it('same-DOM greater-than entity corruption cannot pass the independent text-context serializer',()=>{const before=expectedOwnedBiometricRaw(native.dom);fault.change=raw=>raw.replace('&amp;>','&amp;&gt;');const actual=renderDashboardBiometricPresentation(view);expect(semantic(actual)).toBe(semantic(before));expect(actual).not.toBe(before);expect(()=>expect(actual).toBe(expectedOwnedBiometricRaw(native.dom))).toThrow();});
