import {readFileSync} from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';
import {compileWearablePresentationStyles,wearablePresentationOwnership} from '../scripts/wearable-presentation-style-ownership.mjs';
import {restoreWearablePresentationBodies} from './helpers/wearable-presentation-style-inverse.js';
const inputPath=path.resolve('css/wearables.base.css'),input=readFileSync(inputPath,'utf8'),prior=readFileSync('tests/fixtures/wearable-presentation-prior.css','utf8');
it('qualifies all213recipes/810declarations and restores180 disjoint current bodies to the exact manual-entry epoch',async()=>{const out=await compileWearablePresentationStyles(input,inputPath,process.cwd());expect(wearablePresentationOwnership.receivers).toHaveLength(213);expect(wearablePresentationOwnership.declarationCount).toBe(810);expect(out.receivers).toHaveLength(213);expect(restoreWearablePresentationBodies(out.css,'all')).toBe(prior);});
it('rejects a changed actual Strip body before a detail-only prior projection',async()=>{const out=await compileWearablePresentationStyles(input,inputPath,process.cwd());const changed=out.css.replace('border-style: dashed;','border-style: solid;');expect(changed).not.toBe(out.css);expect(()=>restoreWearablePresentationBodies(changed,'detail')).toThrow();});
it('rejects a changed actual Detail body before a strip-only prior projection',async()=>{const out=await compileWearablePresentationStyles(input,inputPath,process.cwd());const changed=out.css.replace('margin-top: 14px','margin-top: 15px');expect(changed).not.toBe(out.css);expect(()=>restoreWearablePresentationBodies(changed,'strip')).toThrow();});
