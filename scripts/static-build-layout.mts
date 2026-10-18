import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Only dedicated artifacts may be replaced; never the working source or notes root. */
export function staticKitOutputDirectory(root:string,requested:string):string {
 const sourceRoot=path.resolve(root),output=path.resolve(sourceRoot,requested);
 const sourceChild=output===sourceRoot||output.startsWith(sourceRoot+path.sep);
 const allowed=output===path.join(sourceRoot,'dist')||output.startsWith(path.join(sourceRoot,'.local-notes')+path.sep)||!sourceChild&&output.startsWith(os.tmpdir()+path.sep);
 if(!allowed)
  throw new Error('Static SvelteKit output must be dist, an ignored notes child or a temporary directory');
 return output;
}
/** Public discovery metadata is served online, separately from the offline app shell. */
export async function copyStaticPublicMetadata(root:string,destination:string):Promise<void>{
 for(const file of ['robots.txt','sitemap.xml'])await fs.copyFile(path.join(root,file),path.join(destination,file));
 await fs.cp(path.join(root,'.well-known'),path.join(destination,'.well-known'),{recursive:true});
}
