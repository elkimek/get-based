import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {afterEach,expect,it} from 'vitest';
import {staticKitOutputDirectory,copyStaticPublicMetadata} from '../scripts/static-build-layout.mjs';
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'getbased-static-layout-'));roots.push(root);return root;}
it('allows the dedicated production distribution and existing evaluation artifact locations',()=>{
 const root='/fixture/getbased';expect(staticKitOutputDirectory(root,'dist')).toBe(root+'/dist');
 expect(staticKitOutputDirectory(root,'.local-notes/kit-build')).toBe(root+'/.local-notes/kit-build');
 expect(staticKitOutputDirectory(root,path.join(os.tmpdir(),'owned-kit-check'))).toBe(path.join(os.tmpdir(),'owned-kit-check'));
});
it.each(['.','.local-notes','js','dist/../js','../other-project'])('rejects destructive output target %s',target=>{
 expect(()=>staticKitOutputDirectory('/fixture/getbased',target)).toThrow('Static SvelteKit output must be');
});
it.each(['.','js','.local-notes'])('protects source target %s even when the source itself is under temporary storage',target=>{
 expect(()=>staticKitOutputDirectory(path.join(os.tmpdir(),'getbased-source'),target)).toThrow('Static SvelteKit output must be');
});
it('publishes exact public metadata without copying source, API implementations or local data',async()=>{
 const root=await fixture(),output=await fixture();await mkdir(path.join(root,'.well-known','agent-skills'),{recursive:true});
 await mkdir(path.join(root,'api'));await mkdir(path.join(root,'.local-notes'));
 const files={'robots.txt':'robots bytes\n','sitemap.xml':'<xml>public</xml>','.well-known/mcp.json':'{"public":true}', '.well-known/agent-skills/SKILL.md':'# public agent skill\n'};
 for(const [file,body] of Object.entries(files))await writeFile(path.join(root,file),body);
 await writeFile(path.join(root,'api','proxy.ts'),'private implementation');await writeFile(path.join(root,'.local-notes','data.json'),'local data');await writeFile(path.join(root,'package.json'),'tooling');
 await copyStaticPublicMetadata(root,output);
 for(const [file,body] of Object.entries(files))expect(await readFile(path.join(output,file),'utf8')).toBe(body);
 expect((await readdir(output)).sort()).toEqual(['.well-known','robots.txt','sitemap.xml']);
});
it('uses static SvelteKit as the default build and preserves explicit native budget validation',async()=>{
 const pkg=JSON.parse(await readFile('package.json','utf8')) as {scripts:Record<string,string>};
 expect(pkg.scripts['production:build']).toBe('node scripts/build-sveltekit.mjs --output dist');
 expect(pkg.scripts['production:check']).toBe('node scripts/build-sveltekit.mjs --check');
 expect(pkg.scripts['preproduction:build']).toBe('npm run typescript:build');
 expect(pkg.scripts['preproduction:check']).toBe('npm run typescript:build');
 expect(pkg.scripts['native:compatibility:check']).toBe('node scripts/build-production.mjs --check');
 const vercel=JSON.parse(await readFile('vercel.json','utf8')) as {buildCommand:string;outputDirectory:string;routes:Array<{src:string;dest?:string;headers?:Record<string,string>}>;functions:Record<string,unknown>};
 expect(vercel.buildCommand).toBe('node scripts/fetch-catalog.mjs && npm run production:build');expect(vercel.outputDirectory).toBe('dist');
 expect(vercel.routes.find(row=>row.src==='^/app/?$')?.dest).toBe('/index.html');
 expect(vercel.routes.find(row=>row.src==='^/_app/immutable/(.*)$')?.headers?.['Cache-Control']).toBe('public, max-age=31536000, immutable');
 expect(vercel.functions).toHaveProperty('api/proxy.ts');
});
