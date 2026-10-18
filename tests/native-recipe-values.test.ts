import path from 'node:path';
import {expect,it} from 'vitest';
import {compileNativeStyleBodies,nativeRecipeValueProof,type NativeStyleOwnership} from '../scripts/native-recipe-styles.mjs';
const root=process.cwd(),inputPath=path.join(root,'css/native-recipe-values-fixture.css');
const gradient='linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),\n    linear-gradient(135deg, var(--text-muted) 50%, transparent 50%)';
const source=`@import "tailwindcss" prefix(gb) source(none) reference;
@utility value-fixture { background-image: ${gradient}; }

.target { @apply gb:value-fixture; }`;
const ownership:NativeStyleOwnership={receivers:[['value-fixture','.target',null,{preserveFormatting:true}]],declarationCount:1,isolateRecipes:true,compactMetadataPrefix:true};
it('proves native multi-line comma layout and retains every original body byte after Tailwind compilation',async()=>{
 const result=await compileNativeStyleBodies(source,inputPath,root,ownership);
 expect(result.css).toBe(`.target { background-image: ${gradient}; }`);
 expect(result.expanded).toContain('), linear-gradient(');
});
it('retains the original literal-value guard for legacy receivers',async()=>{
 await expect(compileNativeStyleBodies(source,inputPath,root,{...ownership,receivers:[['value-fixture','.target',null]]})).rejects.toMatchObject({code:'ERR_ASSERTION'});
});
it.each(['a, b','a,\nb','a , b','a,\t b','a,b'])('permits only comma-adjacent layout in %s',value=>{
 expect(nativeRecipeValueProof(value)).toEqual(nativeRecipeValueProof('a,b'));
});
it.each([
 ['color','linear-gradient(red, blue)','linear-gradient(green, blue)'],
 ['stop','linear-gradient(red 50%, blue)','linear-gradient(red 51%, blue)'],
 ['function','linear-gradient(red, blue)','radial-gradient(red, blue)'],
 ['quoted whitespace','"a, b"','"a,b"'],
 ['quoted newline','"a\\a b"','"a b"'],
 ['comment','a,/* retained */b','a,/* changed */b'],
 ['comment removal','a,/* retained */b','a,b'],
 ['non-comma whitespace','a  b,c','a b,c'],
 ['missing token','a,b,c','a,c'],
 ['reordered token','a,b,c','b,a,c'],
 ['missing comma','a,b','a b'],
 ['number lexeme','0px,1px','0,1px'],
 ['escaped lexeme','r\\65 d,blue','red,blue'],
] as const)('rejects %s changes in the comma-layout proof',(_name,original,changed)=>{
 expect(nativeRecipeValueProof(changed)).not.toEqual(nativeRecipeValueProof(original));
});
