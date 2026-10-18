import {expectedOwnedLoading} from './helpers/dashboard-loading-insights-owned-receipts.js';
// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createDashboardWidgetRenderers} from '../js/dashboard-widget-renderers.js';
import {captureLoading,loadingOwners,loadingScenarios} from './helpers/dashboard-loading-state-receipts.js';
const receipts=JSON.parse(readFileSync(path.join(import.meta.dirname,'fixtures/dashboard-loading-state-native.json'),'utf8')) as Awaited<ReturnType<typeof captureLoading>>[];
for(const scenario of loadingScenarios)it('preserves complete native loading chronology '+scenario,async()=>{
 const original=receipts.find(r=>r.scenario===scenario);expect(original).toBeDefined();
 const actual=await captureLoading(createDashboardWidgetRenderers,scenario);expect(actual).toEqual(expectedOwnedLoading(original));
 if(scenario==='pending'){expect(actual.beforeSettlement).toEqual(['ready','load','ready','ready','ready','ready']);expect(actual.outputs).toHaveLength(5);expect(actual.outputs.map(x=>x.owner)).toEqual([...loadingOwners]);expect(actual.outputs.every(x=>x.raw===actual.outputs[0]!.raw)).toBe(true);expect(actual.outputs[0]!.raw).toContain('Loading Light &amp; Sun…');}
 if(scenario==='resolve'){expect(actual.afterSettlement.at(-1)).toBe('rerender');expect(actual.trace.filter(x=>x==='load')).toHaveLength(2);}
 if(scenario==='reject'){expect(actual.logs).toEqual(['Failed to load Light & Sun dashboard modules:RangeError:rejected','Failed to load Light & Sun dashboard modules:RangeError:rejected']);expect(actual.trace.filter(x=>x==='load')).toHaveLength(2);}
 if(scenario==='rerender-throw')expect(actual.logs).toEqual(['Failed to load Light & Sun dashboard modules:RangeError:rerender','Failed to load Light & Sun dashboard modules:RangeError:rerender']);
 if(scenario==='ready')expect(actual.trace).not.toContain('load');
});
