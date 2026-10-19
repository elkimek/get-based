import {afterEach, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {wearableChartExpectedQualifier, type NativeArtifact} from './helpers/wearable-pwa-chart-functions.js';
import {materializeWearableNativeFixture, verifyWearableNativeArchive, wearableNativeFixtureManifestSHA256} from '../scripts/wearable-native-fixture.mjs';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {for (const cleanup of cleanups.splice(0)) await cleanup();});
function fixture(options: {file?: string; body?: Buffer; trailing?: Buffer; header?: unknown; duplicate?: boolean; payloadBytes?: number; memberSHA?: string} = {}) {
  const body = options.body ?? Buffer.from('synthetic native receipt');
  const member = {file: options.file ?? 'original/receipt.json', bytes: body.length, sha256: options.memberSHA ?? sha(body)};
  const files = options.duplicate ? [member, member] : [member];
  const header = Buffer.from(JSON.stringify(options.header ?? {version: 1, files}));
  const prefix = Buffer.alloc(4); prefix.writeUInt32BE(header.length);
  const payload = Buffer.concat([prefix, header, body, ...(options.duplicate ? [body] : []), ...(options.trailing ? [options.trailing] : [])]);
  const archive = gzipSync(payload);
  const manifest = Buffer.from(JSON.stringify({version: 1, archive: {file: 'receipts.bin.gz', bytes: archive.length, sha256: sha(archive), payloadBytes: options.payloadBytes ?? payload.length}, files}));
  return {archive, manifest, pin: sha(manifest)};
}
it('verifies every exact original member before extraction', () => {
  const sample = fixture();
  expect(verifyWearableNativeArchive(sample.archive, sample.manifest, sample.pin)).toEqual([{file: 'original/receipt.json', bytes: Buffer.from('synthetic native receipt'), sha256: sha(Buffer.from('synthetic native receipt'))}]);
});
it.each(['../escape.json', 'original/../escape.json', '/absolute.json', 'C:/absolute.json', 'original\\escape.json', 'original//receipt.json', './receipt.json', 'original/\0receipt.json'])('rejects unsafe fixture member %j', file => {
  const sample = fixture({file});
  expect(() => verifyWearableNativeArchive(sample.archive, sample.manifest, sample.pin)).toThrow();
});
it('rejects a changed manifest even when it claims a matching archive', () => {
  const sample = fixture();
  expect(() => verifyWearableNativeArchive(sample.archive, Buffer.concat([sample.manifest, Buffer.from(' ')]), sample.pin)).toThrow('Pinned Wearables fixture manifest');
});
it('rejects changed compressed bytes', () => {
  const sample = fixture(); const changed = Buffer.from(sample.archive); changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
  expect(() => verifyWearableNativeArchive(changed, sample.manifest, sample.pin)).toThrow('Pinned compressed fixture bytes');
});
it('rejects a changed member under an otherwise requalified container', () => {
  const sample = fixture({memberSHA: 'a'.repeat(64)});
  expect(() => verifyWearableNativeArchive(sample.archive, sample.manifest, sample.pin)).toThrow('Exact original fixture member');
});
it('rejects duplicate paths', () => {
  const sample = fixture({duplicate: true});
  expect(() => verifyWearableNativeArchive(sample.archive, sample.manifest, sample.pin)).toThrow('Unique fixture member paths');
});
it('rejects a header that differs from the qualified inventory', () => {
  const sample = fixture({header: {version: 1, files: []}});
  expect(() => verifyWearableNativeArchive(sample.archive, sample.manifest, sample.pin)).toThrow('Exact container member inventory');
});
it('rejects undeclared trailing bytes', () => {
  const sample = fixture({trailing: Buffer.from('unqualified')});
  expect(() => verifyWearableNativeArchive(sample.archive, sample.manifest, sample.pin)).toThrow('No undeclared fixture bytes');
});
it('rejects an oversized decompressed declaration before inflation', () => {
  const sample = fixture({payloadBytes: 25 * 1024 * 1024});
  expect(() => verifyWearableNativeArchive(sample.archive, sample.manifest, sample.pin)).toThrow('Bounded decompressed fixture');
});
it('materializes the pinned portable inputs without historical local notes and preserves the original native manifest identities', async () => {
  const fixture = await materializeWearableNativeFixture(); cleanups.push(fixture.cleanup);
  const manifestBytes = await fs.readFile(fixture.manifestFile);
  expect(sha(manifestBytes)).toBe('b32fbd595d3a08e323335c3d15a8c07cea729dcb02721e183ca55ff96d1e817e');
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as {cases: Array<{project: string; capture: {file: string; bytes: number; sha256: string}; warmBaseline: {file: string; bytes: number; sha256: string}}>};
  expect(manifest.cases.map(value => value.project)).toEqual(['kit-chromium', 'kit-firefox', 'kit-webkit', 'kit-mobile-webkit']);
  for (const value of manifest.cases) for (const member of [value.capture, value.warmBaseline]) {
    const bytes = await fs.readFile(path.join(fixture.directory, member.file));
    expect(bytes.byteLength).toBe(member.bytes); expect(sha(bytes)).toBe(member.sha256);
  }
  const chunks = path.join(fixture.directory, 'clone/.local-notes/original-kit-artifact/_app/immutable/chunks');
  expect((await fs.readdir(chunks)).sort()).toEqual(['CtdYO843.js', 'CtdYO843.js.map', 'Pietaq_b.js', 'Pietaq_b.js.map', 'sx8fdhZF.js', 'sx8fdhZF.js.map']);
  expect(wearableNativeFixtureManifestSHA256).toBe('17e5510d4b52a27d023a644dc130d6e59afa09394b79523791ddefda3249d49b');
  await fixture.cleanup(); await expect(fs.stat(fixture.directory)).rejects.toThrow();
});

it.each(['kit-chromium', 'kit-firefox', 'kit-webkit', 'kit-mobile-webkit'])('retains every original %s callback source and imported binding with only the three qualified chunk/map pairs', async project => {
  const fixture = await materializeWearableNativeFixture(); cleanups.push(fixture.cleanup);
  const originalDirectory = path.join(fixture.directory, 'clone/.local-notes/original-kit-artifact');
  const sourceRoot = path.join(fixture.directory, 'source');
  const sourceBodies = new Map<string, string>();
  const chunks = path.join(originalDirectory, '_app/immutable/chunks');
  for (const file of (await fs.readdir(chunks)).filter(file => file.endsWith('.map'))) {
    const map = JSON.parse(await fs.readFile(path.join(chunks, file), 'utf8')) as {sources: string[]; sourcesContent: string[]};
    for (let index = 0; index < map.sources.length; index++) {
      const mapped = map.sources[index]!;
      const marker = mapped.lastIndexOf('/js/');
      if (marker < 0) continue;
      const module = mapped.slice(marker + 1), body = map.sourcesContent[index]!;
      expect(module.split('/')).not.toContain('..');
      if (sourceBodies.has(module)) expect(sourceBodies.get(module)).toBe(body);
      sourceBodies.set(module, body);
    }
  }
  for (const [module, body] of sourceBodies) {
    await fs.mkdir(path.dirname(path.join(sourceRoot, module)), {recursive: true});
    await fs.writeFile(path.join(sourceRoot, module), body);
  }
  for (const file of ['chart.min.js', 'chartjs-adapter-native.js']) {
    await fs.mkdir(path.join(originalDirectory, 'vendor'), {recursive: true});
    await fs.copyFile(new URL('../vendor/' + file, import.meta.url), path.join(originalDirectory, 'vendor', file));
  }
    const capture = JSON.parse(await fs.readFile(path.join(fixture.directory, 'clone/.local-notes/original-browser-capture', project + '.json'), 'utf8')) as {artifact: NativeArtifact; rawStates: Record<string, {chart: unknown}>};
    const originals = Object.values(capture.rawStates).map(value => value.chart);
    const qualified = await wearableChartExpectedQualifier(fixture.directory, originalDirectory, sourceRoot, capture.artifact, originals);
    expect(qualified.proofs.map(proof => [proof.sourceModule, proof.owner, proof.original.functionName])).toEqual([
      ['js/wearables-detail-modal.js', 'renderWearableChart', 'borderDash'],
      ['js/wearables-detail-modal.js', 'renderWearableChart', 'borderColor'],
      ['js/wearables-detail-modal.js', 'renderWearableChart', 'N'],
      ['js/wearables-detail-modal.js', 'renderWearableChart', 'label'],
      ['js/wearables-detail-modal.js', 'renderWearableChart', ''],
      ['js/wearables-bp-detail-chart.js', 'renderBloodPressureChart', 'title'],
      ['js/wearables-bp-detail-chart.js', 'renderBloodPressureChart', 'label'],
      ['js/charts.js', '(module)', 'E'],
    ]);
    expect(originals.map(value => qualified.qualify(value))).toEqual(originals);
    expect(qualified.proofs.every(proof => proof.replacements.length === 0)).toBe(true);
}, 30000);


// Renderer portability keeps a byte-exact original app and strict raw comparison.
import {verifyWearableOriginalAppArchive} from '../scripts/wearable-native-fixture.mjs';
import {assertWearableChartFrame,assertWearableReferenceInventory,historicalWearableDatasetMetadata,wearableExpectedEventChronology,wearableReferenceKeys,type WearableChartFrame} from './helpers/wearable-chart-reference.js';
function referenceFrame(key=wearableReferenceKeys[0]!) : WearableChartFrame {
  const rgba=Buffer.from([10,20,30,255]);return {key,width:1,height:1,rgba,paint:{bytes:4,alphaPixels:1,distinctRGBAColors:1,sha256:sha(rgba)},datasetMetadata:[{index:0,type:'line',hidden:false,points:[{x:1,y:2}]}]};
}
it('accepts the complete exact chronological eighteen-state reference and full raw paint pair',()=>{
 const frames=wearableReferenceKeys.map(key=>referenceFrame(key));assertWearableReferenceInventory(frames);assertWearableChartFrame(frames[0]!,referenceFrame());
});
it.each(['missing','duplicate','reordered'] as const)('rejects %s original chart states',kind=>{
 const frames=wearableReferenceKeys.map(key=>referenceFrame(key));
 if(kind==='missing')frames.pop();else if(kind==='duplicate')frames[1]=frames[0]!;else [frames[0],frames[1]]=[frames[1]!,frames[0]!];
 expect(()=>assertWearableReferenceInventory(frames)).toThrow();
});
it.each(['key','rgba','dimensions','paint','observer-sha','dataset-coordinate'] as const)('rejects corrupted candidate %s without tolerance',kind=>{
 const expected=referenceFrame(),actual=referenceFrame();
 if(kind==='key')actual.key=wearableReferenceKeys[1]!;
 if(kind==='rgba'){actual.rgba[0]=11;actual.paint.sha256=sha(actual.rgba);}
 if(kind==='dimensions')actual.width=2;
 if(kind==='paint')actual.paint.alphaPixels=0;
 if(kind==='observer-sha')actual.paint.sha256='0'.repeat(64);
 if(kind==='dataset-coordinate')actual.datasetMetadata[0]!.points[0]!.x+=0.00000762939453125;
 expect(()=>assertWearableChartFrame(expected,actual)).toThrow();
});
it('authenticates the whole frozen original app and rejects archive or binding corruption before extraction',async()=>{
 const directory=path.resolve('tests/fixtures/wearable-native-parity');const bytes=await fs.readFile(path.join(directory,'original-artifact.gborig1.gz')),binding=await fs.readFile(path.join(directory,'fixture-binding.json'));
 const original=verifyWearableOriginalAppArchive(bytes,binding);expect(original.files).toHaveLength(769);expect(original.files.reduce((sum,row)=>sum+row.bytes.length,0)).toBe(42783073);
 const corrupt=Buffer.from(bytes);corrupt[100]=corrupt[100]!^1;
 expect(()=>verifyWearableOriginalAppArchive(corrupt,binding)).toThrow('Pinned complete original application');
 expect(()=>verifyWearableOriginalAppArchive(Buffer.concat([bytes,Buffer.from([0])]),binding)).toThrow();
 expect(()=>verifyWearableOriginalAppArchive(bytes,Buffer.concat([binding,Buffer.from(' ')]))).toThrow('Pinned original application binding');
});

it('retains full historical dataset semantics while actual coordinates require exact same-browser equality',()=>{
 const original=referenceFrame(),platform=referenceFrame();platform.datasetMetadata[0]!.points[0]!.x+=0.00000762939453125;
 const before=JSON.stringify(platform.datasetMetadata);
 expect(historicalWearableDatasetMetadata(platform.datasetMetadata)).toEqual(historicalWearableDatasetMetadata(original.datasetMetadata));
 expect(JSON.stringify(platform.datasetMetadata)).toBe(before);
 expect(()=>assertWearableChartFrame(original,platform)).toThrow('Exact same-browser original/current native dataset metadata');
});
it.each(['index','type','hidden','missing-point','extra-point','nonfinite-x','nonfinite-y'] as const)('retains historical dataset rejection for %s corruption',kind=>{
 const original=referenceFrame(),changed=referenceFrame(),dataset=changed.datasetMetadata[0]!;
 if(kind==='index')dataset.index=1;
 if(kind==='type')dataset.type='foreign';
 if(kind==='hidden')dataset.hidden=true;
 if(kind==='missing-point')dataset.points.pop();
 if(kind==='extra-point')dataset.points.push({x:3,y:4});
 if(kind==='nonfinite-x')dataset.points[0]!.x=NaN;
 if(kind==='nonfinite-y')dataset.points[0]!.y=Infinity;
 if(kind.startsWith('nonfinite'))expect(()=>historicalWearableDatasetMetadata(changed.datasetMetadata)).toThrow('Finite actual native dataset coordinates');
 else expect(historicalWearableDatasetMetadata(changed.datasetMetadata)).not.toEqual(historicalWearableDatasetMetadata(original.datasetMetadata));
});


function historicalChordEvents():unknown[] {
 const rows:unknown[]=Array.from({length:110},(_,index)=>({type:'preserved',index}));
 for(const reverse of [2,56,84]){
  rows[reverse]={type:'keydown',action:'modal-close',metric:null,key:'Shift',trusted:true,focus:''};
  rows[reverse+1]={type:'keydown',action:'modal-close',metric:null,key:'Tab',trusted:true,focus:''};
  rows[reverse+2]={type:'keydown',action:'delete-detail-manual-entry',metric:'weight',key:'Tab',trusted:true,focus:''};
 }
 return rows;
}
it('expands only six fixed Cocoa WebKit chords and preserves every historical event unchanged',()=>{
 const historical=historicalChordEvents(),before=structuredClone(historical),expanded=wearableExpectedEventChronology(historical,'darwin','webkit');
 expect(expanded).toHaveLength(116);
 const positions=[2,5,58,61,88,91];
 expect(positions.map(index=>expanded[index])).toEqual([2,4,56,58,84,86].map(index=>({...historical[index] as object,key:'Alt'})));
 expect(expanded.filter((_,index)=>!positions.includes(index))).toEqual(historical);expect(historical).toEqual(before);
 for(const [platform,browser] of [['linux','webkit'],['darwin','chromium'],['darwin','firefox']])expect(wearableExpectedEventChronology(historical,platform!,browser!)).toEqual(historical);
});
it.each(['missing','extra','position','owner','metric','key','trust','focus','reverse-tab'] as const)('rejects corrupted frozen chord %s before Cocoa expansion',kind=>{
 const historical=historicalChordEvents();
 if(kind==='missing')historical.pop();else if(kind==='extra')historical.push({});
 else if(kind==='position')[historical[2],historical[1]]=[historical[1],historical[2]];
 else {
  const index=kind==='reverse-tab'?3:2;
  historical[index]={...historical[index] as object,...(kind==='owner'?{action:'foreign'}:kind==='metric'?{metric:'weight'}:kind==='key'?{key:'Alt'}:kind==='trust'?{trusted:false}:kind==='focus'?{focus:'foreign'}:{key:'Enter'})};
 }
 expect(()=>wearableExpectedEventChronology(historical,'darwin','webkit')).toThrow();
});
it('qualifies the exact six expansion positions in both authenticated frozen WebKit event arrays',async()=>{
 const materialized=await materializeWearableNativeFixture();cleanups.push(materialized.cleanup);
 for(const project of ['kit-webkit','kit-mobile-webkit']){
  const capture=JSON.parse(await fs.readFile(path.join(materialized.directory,'clone/.local-notes/original-browser-capture',project+'.json'),'utf8')) as {oracle:{eventChronology:unknown[]}};
  const historical=capture.oracle.eventChronology,expanded=wearableExpectedEventChronology(historical,'darwin','webkit');
  expect(expanded).toHaveLength(116);expect(expanded.filter((_,index)=>![2,5,58,61,88,91].includes(index))).toEqual(historical);
 }
});
