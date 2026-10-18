import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { auditDomSinks, scanDomSinks, createDomSinkPolicy } from '../scripts/dom-sink-audit.mjs';

describe('DOM HTML sink audit', () => {
  it('tracks every production JavaScript module and reviewed sink fingerprint', () => {
    const report = auditDomSinks();

    expect(report.failures).toEqual([]);
    expect(report.current.scannedFiles).toBeGreaterThan(100);
    expect(report.current.sinkCount).toBe(Object.values(report.current.files).reduce((sum, file) => sum + file.count, 0));
    expect(Object.keys(report.current.files).length).toBeGreaterThan(31);
  }, 15_000);

  it('rejects altered fingerprints, omitted and stale entries, and discovery totals', () => {
    const { current } = auditDomSinks();
    const policy = structuredClone(current);
    const [changed, omitted] = Object.keys(policy.files);
    if (!changed || !omitted) throw new Error('Expected multiple reviewed sink-bearing modules');
    policy.files[changed]!.digest = 'unreviewed';
    delete policy.files[omitted];
    policy.files['js/stale-review.js'] = { count: 1, digest: 'stale', kinds: { innerHTML: 1 } };
    policy.scannedFiles -= 1;
    policy.sinkCount -= 1;
    const report = auditDomSinks(policy);
    expect(report.ok).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('scanned file count changed'),
      expect.stringContaining('HTML sink count changed'),
      expect.stringContaining(`reviewed sink surface changed in ${changed}`),
      `new sink-bearing file: ${omitted}`,
      'stale sink policy entry: js/stale-review.js',
    ]));
  }, 15_000);

  it('audits Svelte script sinks, raw HTML and editable HTML bindings without counting escaped text', () => {
    const source = `<script lang="ts">let value = '<b>unsafe</b>'; node.innerHTML = value;</script>
      <p>{value}</p>{@html value}<div contenteditable="true" bind:innerHTML={value}></div>
      <button onclick={() => { node.innerHTML = value; node.insertAdjacentHTML('beforeend', value); document.write(value); }}>Write</button>
      <iframe title="Preview" srcdoc={value}></iframe>`;
    const sinks = scanDomSinks(source, 'js/View.svelte');
    expect(sinks.map(sink => sink.kind)).toEqual(['innerHTML', 'svelte.html', 'svelte.bind.innerHTML', 'innerHTML', 'insertAdjacentHTML', 'document.write', 'svelte.attribute.srcdoc']);
    expect(sinks[1]!.source).toBe('{@html value}');
    expect(sinks[1]!.line).toBe(2);
  });

  it('recognizes assignment, insertion, fragment, unsafe-HTML, and document-write sinks', () => {
    const sinks = scanDomSinks(`
      node.innerHTML = html;
      node.outerHTML += more;
      frame['srcdoc'] = page;
      node.insertAdjacentHTML('beforeend', row);
      range.createContextualFragment(markup);
      shadow.setHTMLUnsafe(fragment);
      popup.document.write(report);
      popup.document.writeln(report);
    `);

    expect(sinks.map(sink => sink.kind)).toEqual([
      'innerHTML',
      'outerHTML',
      'srcdoc',
      'insertAdjacentHTML',
      'createContextualFragment',
      'setHTMLUnsafe',
      'document.write',
      'document.writeln',
    ]);
  });
});


describe('actual authored discovery and fail-closed policy controls',()=>{
 function fixture(run:(root:string)=>void){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'getbased-dom-sink-audit-'));
  try{fs.mkdirSync(path.join(root,'js'));fs.writeFileSync(path.join(root,'js/Owner.ts'),'export const text="literal";');fs.writeFileSync(path.join(root,'js/Panel.svelte'),'<p>{text}</p>');run(root);}
  finally{fs.rmSync(root,{recursive:true,force:true});}
 }
 it('discovers a new sink-free authored module even when no JavaScript sibling exists',()=>fixture(root=>{
  const policy=createDomSinkPolicy(root);expect(policy.scannedFiles).toBe(2);expect(auditDomSinks(policy,root).ok).toBe(true);
  fs.writeFileSync(path.join(root,'js/NewOwner.svelte'),'<button>New owner</button>');
  expect(auditDomSinks(policy,root).failures).toContain('scanned file count changed: 2 -> 3');
 }));
 it('rejects a balanced sink-free source swap even when the file and sink totals are unchanged',()=>fixture(root=>{
  const policy=createDomSinkPolicy(root);fs.unlinkSync(path.join(root,'js/Owner.ts'));fs.writeFileSync(path.join(root,'js/Unreviewed.ts'),'export const text="new owner";');
  const report=auditDomSinks(policy,root);expect(report.current.scannedFiles).toBe(policy.scannedFiles);expect(report.current.sinkCount).toBe(policy.sinkCount);expect(report.failures).toContain('authored source inventory changed');
 }));
 it('rejects an added imperative sink in an existing real authored TypeScript module',()=>fixture(root=>{
  const policy=createDomSinkPolicy(root);fs.appendFileSync(path.join(root,'js/Owner.ts'),'document.body.innerHTML = input;');
  expect(auditDomSinks(policy,root).failures).toEqual(expect.arrayContaining(['HTML sink count changed: 0 -> 1','new sink-bearing file: js/Owner.js']));
 }));
 it('rejects a raw Svelte child and keeps escaped text outside the sink policy',()=>fixture(root=>{
  const policy=createDomSinkPolicy(root);fs.appendFileSync(path.join(root,'js/Panel.svelte'),'{@html input}');
  expect(auditDomSinks(policy,root).failures).toEqual(expect.arrayContaining(['HTML sink count changed: 0 -> 1','new sink-bearing file: js/Panel.svelte.native.js']));
 }));
 it('detects a changed actual expression even if its file and sink count stay the same',()=>fixture(root=>{
  const file=path.join(root,'js/Owner.ts');fs.appendFileSync(file,'document.body.innerHTML = reviewedHTML;');const policy=createDomSinkPolicy(root);
  fs.writeFileSync(file,'document.body.innerHTML = unreviewedHTML;');const report=auditDomSinks(policy,root);
  expect(report.current.sinkCount).toBe(policy.sinkCount);expect(report.failures.some(value=>value.startsWith('reviewed sink surface changed in js/Owner.js'))).toBe(true);
 }));
 it('preserves the review rule, schema, scope and per-kind accounting rather than only total counts',()=>fixture(root=>{
  fs.appendFileSync(path.join(root,'js/Owner.ts'),'document.body.innerHTML = reviewedHTML;');const policy=createDomSinkPolicy(root);
  for(const field of ['scope','reviewRule']as const){const changed=structuredClone(policy);changed[field]='relaxed';expect(auditDomSinks(changed,root).failures).toContain('sink policy '+field+' changed');}
  const schema=structuredClone(policy);schema.schemaVersion++;expect(auditDomSinks(schema,root).failures).toContain('sink policy schemaVersion changed');
  const kinds=structuredClone(policy);kinds.files['js/Owner.js']!.kinds={outerHTML:1};expect(auditDomSinks(kinds,root).failures).toContain('reviewed sink kinds changed in js/Owner.js');
 }));
});
