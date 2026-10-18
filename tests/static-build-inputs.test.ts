import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {afterEach,expect,it} from 'vitest';
import {staticBuildInputFiles,createStaticBuildFingerprint} from '../scripts/static-build-inputs.mjs';
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'getbased-static-inputs-'));roots.push(root);return root;}
async function put(root:string,file:string,body='source'){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),body);}
async function identity(root:string,inventory:readonly string[]=[],revision='rev',tag='tag'){
 const {fingerprint,sourceFiles,verificationDigest}=await createStaticBuildFingerprint(root,revision,tag,inventory);
 return {hash:fingerprint.digest('hex'),sourceFiles,verificationDigest};
}
it('discovers actual authored inputs when an ignored checkout has zero Git inventory',async()=>{
 const root=await fixture();for(const file of ['js/feature.ts','scripts/build.mts','js/components/Card.svelte','css/app.css','index.html','package.json'])await put(root,file);
 for(const file of ['js/feature.js','scripts/build.mjs','js/components/Card.svelte.native.js','README.md'])await put(root,file);
 expect(await staticBuildInputFiles(root,[])).toEqual(['css/app.css','index.html','js/components/Card.svelte','js/feature.ts','package.json','scripts/build.mts']);
});
it.each(['js/feature.ts','js/components/Card.svelte','css/app.css','package.json'])('actual %s byte changes version the app even with no Git metadata',async file=>{
 const root=await fixture();await put(root,file,'before');const before=await identity(root);await put(root,file,'after');const after=await identity(root);
 expect(after.sourceFiles).toEqual(before.sourceFiles);expect(after.hash).not.toBe(before.hash);
});
it('does not version generated outputs, local journals or dependency caches',async()=>{
 const root=await fixture();await put(root,'js/feature.ts');const before=await identity(root);
 for(const file of ['.local-notes/run.json','.svelte-check/config.json','.svelte-kit/output/a.json','node_modules/pkg/package.json','tooling/svelte/node_modules/pkg/package.json','artifacts/report.json','coverage/report.json','dist/app.html','build/app.html','test-results/result.json','playwright-report/report.html','.git/config.json','js/feature.js'])await put(root,file);
 expect(await identity(root)).toEqual(before);
});
it('deduplicates Git and filesystem discovery and ignores deleted tracked inputs',async()=>{
 const root=await fixture();await put(root,'js/feature.ts');await put(root,'css/app.css');
 expect(await identity(root,['js/feature.ts','js/feature.ts','deleted.ts'])).toEqual(await identity(root,['css/app.css']));
});
it('is deterministic across creation order, versions renames/build tag and separately records revision',async()=>{
 const a=await fixture(),b=await fixture();await put(a,'b.ts','b');await put(a,'a.ts','a');await put(b,'a.ts','a');await put(b,'b.ts','b');
 expect(await identity(a)).toEqual(await identity(b));const before=await identity(a);
 const revised=await identity(a,[],'new revision');expect(revised.hash).toBe(before.hash);expect(revised.verificationDigest).not.toBe(before.verificationDigest);expect((await identity(a,[],'rev','new tag')).hash).not.toBe(before.hash);
 await rm(path.join(a,'a.ts'));await put(a,'renamed.ts','a');expect((await identity(a)).hash).not.toBe(before.hash);
});
it('does not follow symlinked dependencies or files outside the build source',async()=>{
 const root=await fixture(),outside=await fixture();await put(root,'js/feature.ts');await put(outside,'private.json');
 await symlink(outside,path.join(root,'linked'));await symlink(path.join(outside,'private.json'),path.join(root,'linked.json'));
 expect(await staticBuildInputFiles(root,['linked.json'])).toEqual(['js/feature.ts']);
});
it.each(['../outside.ts','/outside.ts','js/../outside.ts'])('rejects a Git inventory escape: %s',async relative=>{
 const root=await fixture();await expect(staticBuildInputFiles(root,[relative])).rejects.toThrow('relative to its source root');
});

it.each(['tests/flow.spec.ts','tests/helper.ts','tests/fixture.json','tests/original.css','tests/page.html'])('conservatively versions test input %s while retaining complete verification provenance',async file=>{
 const root=await fixture();await put(root,'js/feature.ts');await put(root,file,'before');const before=await identity(root);await put(root,file,'after');const after=await identity(root);
 expect(after.hash).not.toBe(before.hash);expect(after.verificationDigest).not.toBe(before.verificationDigest);
 expect(after.sourceFiles).toEqual(before.sourceFiles);expect(after.sourceFiles).toContain(file);
 await rm(path.join(root,file));const removed=await identity(root);expect(removed.hash).not.toBe(before.hash);expect(removed.verificationDigest).not.toBe(before.verificationDigest);expect(removed.sourceFiles).not.toContain(file);
});
it.each(['scripts/build.mts','tooling/svelte/build-static.mts','tooling/svelte/package-lock.json','service-worker.ts','js/kit/routes/+page.ts','js/public.d.ts','unknown.ts','test-like.ts','tests-like/file.ts'])('conservatively versions application/build/unknown input %s',async file=>{
 const root=await fixture();await put(root,file,'before');const before=await identity(root);await put(root,file,'after');const after=await identity(root);
 expect(after.hash).not.toBe(before.hash);expect(after.verificationDigest).not.toBe(before.verificationDigest);
});


it.each([
  'tests/.vitest-coverage/coverage-final.json',
  'tests/.vitest-coverage/coverage-summary.json',
  'tests/.critical-coverage/coverage-final.json',
  'tests/.critical-coverage/coverage-summary.json',
  'tests/.playwright-coverage/chromium/shard.json',
  'tests/.coverage.json',
  'tests/.coverage.html',
])('does not version generated coverage results at the exact maintained output %s', async file => {
  const root = await fixture();
  await put(root, 'js/feature.ts', 'actual authored source');
  const before = await identity(root);
  await put(root, file, 'first generated result');
  expect(await identity(root, [file])).toEqual(before);
  await put(root, file, 'different generated result');
  expect(await identity(root, [file])).toEqual(before);
  await rm(path.join(root, file));
  expect(await identity(root, [file])).toEqual(before);
});

it.each([
  'tests/.coverage-baseline.json',
  'tests/.a11y-baseline.json',
  'tests/.vitest-coverage-fixtures/source.json',
  'tests/.critical-coverage-helpers/source.ts',
  'tests/.playwright-coverage-fixture/source.html',
  'tests/.coverage.json/source.ts',
  'fixtures/tests/.vitest-coverage/source.json',
  '.coverage.json',
  'vitest.config.ts',
  'vitest.critical.config.ts',
  'scripts/playwright-coverage.mts',
])('retains authored inputs with similar names or other ownership: %s', async file => {
  const root = await fixture();
  await put(root, file, 'first authored source');
  const before = await identity(root);
  expect(before.sourceFiles).toContain(file);
  await put(root, file, 'changed authored source');
  const changed = await identity(root);
  expect(changed.hash).not.toBe(before.hash);
  expect(changed.verificationDigest).not.toBe(before.verificationDigest);
});
