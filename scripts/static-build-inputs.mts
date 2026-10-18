import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {generatedInlineStyleMapOutputs} from './inline-style-map-owners.mjs';
const GENERATED_INLINE_MAPS = new Set(generatedInlineStyleMapOutputs);

const SOURCE_INPUT = /\.(?:ts|mts|svelte|css|html|json)$/;
// Maintained coverage producers own exactly these report coordinates:
// vitest.config.ts, vitest.critical.config.ts and playwright-coverage.mts.
// Their changing results must not become authored application cache inputs.
const GENERATED_COVERAGE_DIRECTORIES = [
  'tests/.vitest-coverage/',
  'tests/.critical-coverage/',
  'tests/.playwright-coverage/',
] as const;
const GENERATED_COVERAGE_FILES = new Set(['tests/.coverage.json', 'tests/.coverage.html']);
function generatedCoverageReport(relative: string): boolean {
  return GENERATED_COVERAGE_FILES.has(relative)
    || GENERATED_COVERAGE_DIRECTORIES.some(directory => relative.startsWith(directory));
}
const OUTPUT_DIRECTORIES = new Set(['.git', 'node_modules', '.local-notes', '.svelte-check', '.svelte-kit', '.cache', '.vite', 'artifacts', 'coverage', 'dist', 'build', 'test-results', 'playwright-report']);
function eligible(relative:string):boolean {
  const parts=relative.split('/');
  if(path.isAbsolute(relative)||parts.some(part=>!part||part==='.'||part==='..')) throw new Error('Static build input must be relative to its source root');
  return !GENERATED_INLINE_MAPS.has(relative)&&!generatedCoverageReport(relative)&&SOURCE_INPUT.test(relative)&&!parts.some(part=>OUTPUT_DIRECTORIES.has(part));
}
/** Git can report no files for an ignored evaluation checkout. Discover its real
 * authored inputs too; output, dependency and local-journal trees never version the app. */
export async function staticBuildInputFiles(root:string,gitInventory:readonly string[]):Promise<string[]> {
  const files=new Set<string>();
  for(const relative of gitInventory){
    if(!relative||!eligible(relative))continue;
    const stat=await fs.lstat(path.join(root,relative)).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error;});
    if(stat?.isFile())files.add(relative);
  }
  async function visit(directory:string){
    for(const entry of await fs.readdir(path.join(root,directory),{withFileTypes:true})){
      const relative=directory?directory+'/'+entry.name:entry.name;
      if(entry.isDirectory()){if(!OUTPUT_DIRECTORIES.has(entry.name)&&!generatedCoverageReport(relative+'/'))await visit(relative);}
      else if(entry.isFile()&&eligible(relative))files.add(relative);
    }
  }
  await visit('');
  return [...files].sort();
}
/** The complete authored inventory remains conservative: Vite may consume even
 * test files as inline assets without exposing a supported dependency closure.
 * The caller adds copied public asset bytes before finalizing app identity.
 * Revision and complete source verification are recorded separately. */
export async function createStaticBuildFingerprint(root:string,revision:string,buildTag:string,gitInventory:readonly string[]){
  const sourceFiles=await staticBuildInputFiles(root,gitInventory);
  const fingerprint=createHash('sha256').update('getbased-static-application-v2\0').update(buildTag).update('\0');
  const verification=createHash('sha256').update(revision).update('\0').update(buildTag).update('\0');
  for(const relative of sourceFiles){
    const body=await fs.readFile(path.join(root,relative));
    verification.update(relative).update('\0').update(body).update('\0');
    fingerprint.update(relative).update('\0').update(body).update('\0');
  }
  return {fingerprint,sourceFiles,verificationDigest:verification.digest('hex')};
}
