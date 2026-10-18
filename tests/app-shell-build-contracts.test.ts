import fs from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';
import {createSvelteFacadePlugin} from '../scripts/svelte-facade-plugin.mjs';
import {HYDRATABLE_COMPONENTS} from '../scripts/build-svelte.mjs';
it('exports hydrate for every actual native SSR owner in optimized and Kit modes',async()=>{
 const root=process.cwd();
 for(const mode of ['compile','kit'] as const){const plugin=createSvelteFacadePlugin({root,client:mode});for(const name of HYDRATABLE_COMPONENTS){const code=await plugin.load(path.join(root,'js/components',name+'.svelte.native.js'));expect(typeof code).toBe('string');expect(code).toContain('hydrate');}}
 const nativeImports=fs.readdirSync(path.join(root,'js')).filter(file=>file.endsWith('.ts')).flatMap(file=>{const text=fs.readFileSync(path.join(root,'js',file),'utf8');return [...text.matchAll(/import[^;]*\bhydrate\b[^;]*from\s*['"]\.\/components\/([^'"]+)\.svelte\.native\.js['"]/g)].map(match=>match[1]!);});
 expect(nativeImports).toContain('AppShell');expect(nativeImports).toContain('DesktopDashboardPage');expect(nativeImports).toContain('ChatEmptyState');for(const name of nativeImports)expect(HYDRATABLE_COMPONENTS.has(name)).toBe(true);
});
