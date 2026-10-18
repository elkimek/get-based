import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {qualifyWearableDetailExpectedReceipt,WEARABLE_DETAIL_ORIGINAL_FIXTURE_SHA256} from './helpers/wearable-detail-native-emission.js';
const bytes=readFileSync(new URL('./fixtures/wearable-detail-original.json',import.meta.url));
expect(createHash('sha256').update(bytes).digest('hex')).toBe(WEARABLE_DETAIL_ORIGINAL_FIXTURE_SHA256);
const originals=JSON.parse(new TextDecoder().decode(bytes)) as {name:string;original:unknown}[];
const raw=originals.find(row=>row.name==='HRV chart')!.original;
const titlePath=["chartCalls", 0, "config", 2, 3, 1, 3, 3, 1, 1, 3, 1, 5, 3, 1, 0, 3, 1] as const;
function callback(root:unknown){let value=root;for(const part of titlePath)value=(value as Record<string|number,unknown>)[part];return value as Record<string,unknown>;}
it('retains exact original fixture bytes and every non-chart receipt',()=>{
 expect(originals).toHaveLength(62);
 const empty=originals.find(row=>row.name==='HRV empty source')!;
 expect(qualifyWearableDetailExpectedReceipt(empty.name,empty.original)).toEqual(empty.original);
 expect(qualifyWearableDetailExpectedReceipt('HRV chart',raw)).not.toEqual(raw);
});
it('fails closed for unknown scenarios and missing qualified callback positions',()=>{
 expect(()=>qualifyWearableDetailExpectedReceipt('Unqualified new scenario',raw)).toThrow('Unknown');
 expect(()=>qualifyWearableDetailExpectedReceipt('HRV chart',{chartCalls:[]})).toThrow('path');
});
it.each(['source','name','length','order'] as const)('rejects unqualified original callback %s metadata rather than treating it as equivalent',kind=>{
 const corrupted=structuredClone(raw),value=callback(corrupted);
 if(kind==='source')value.source=String(value.source)+' /* unapproved */';
 if(kind==='name')value.name='otherCallback';
 if(kind==='length')value.length=2;
 if(kind==='order'){const keys=Object.keys(value);const values={...value};for(const key of keys)delete value[key];for(const key of [...keys].reverse())value[key]=values[key];}
 expect(()=>qualifyWearableDetailExpectedReceipt('HRV chart',corrupted)).toThrow('Unqualified');
});
it.each(['source','name','length','config-order','DOM','DOM-order','callback-results','stored-data'] as const)('keeps the full parity assertion sensitive to actual %s corruption',kind=>{
 const expected=qualifyWearableDetailExpectedReceipt('HRV chart',raw),actual=structuredClone(expected) as Record<string,unknown>;
 if(kind==='source')callback(actual).source=String(callback(actual).source).replace("return items?.[0]?.label || '';","return 'wrong';");
 if(kind==='name')callback(actual).name='different';
 if(kind==='length')callback(actual).length=3;
 if(kind==='config-order'){const calls=actual.chartCalls as {config:unknown[]}[];calls[0]!.config.reverse();}
 if(kind==='DOM')actual.dom={type:1,name:'wrong',attributes:[],children:[]};
 if(kind==='DOM-order'){const dom=actual.dom as {children:{attributes:unknown[]}[]};dom.children[1]!.attributes.reverse();}
 if(kind==='callback-results'){const calls=actual.chartCalls as {callbacks:{title:unknown[]}}[];calls[0]!.callbacks.title[2]='Wrong callback behavior';}
 if(kind==='stored-data')actual.storage=[['wearable-detail-foreign','changed']];
 expect(()=>expect(actual).toEqual(expected)).toThrow();
});
