import {compileSettingsChatLayoutStyles} from '../scripts/settings-chat-layout-style-ownership.mjs';
import {compileStartupBannerStyles} from '../scripts/startup-banner-style-ownership.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postcss, {type ChildNode, type Container, type Declaration, type Rule, type AtRule} from 'postcss';
import {expect, it} from 'vitest';
import {buildRedesignShellStyles} from '../scripts/build-styles.mjs';
import {tweaksClasses} from '../js/tweaks-classes.js';

type Decl = {property: string; value: string; important: boolean};
interface OriginalRule {source: string; selectors: string[]; ancestry: string[]; declarations: Decl[]}
interface Mapping {token: string; utility: string; variant: string; receiver: Parameters<typeof tweaksClasses>[1]; lane: string;
  selector: string; source: string; atRules: string[]; declarations: Decl[]; nestedSupports: {orderedDeclarations: Decl[]} | null}
interface Fixture {originalFiles: {path: string; css: string; sha256: string}[]; rules: OriginalRule[]; mapping: Mapping[]}
const fixture = JSON.parse(await fs.readFile('tests/fixtures/tweaks-styles-original.json', 'utf8')) as Fixture;
function declarations(container: Container): Decl[] {
  return (container.nodes ?? []).filter((node): node is Declaration => node.type === 'decl')
    .map(node => ({property: node.prop, value: node.value, important: !!node.important}));
}
function foreignTree(css: string, owned: Set<string>): unknown[] {
  function node(child: ChildNode): unknown | null {
    if (child.type === 'rule' && child.selectors.every(selector => owned.has(selector))) return null;
    if (child.type === 'atrule' && child.name === 'supports' && child.params === '(height: 100dvh)'
      && child.nodes?.length === 1 && child.nodes[0]?.type === 'rule'
      && child.nodes[0].selectors.every(selector => owned.has(selector))) return null;
    if (child.type === 'rule') return {type: child.type, selector: child.selector, nodes: child.nodes.map(node)};
    if (child.type === 'atrule') return {type: child.type, name: child.name, params: child.params,
      nodes: child.nodes?.map(node).filter(value => value !== null)};
    if (child.type === 'decl') return {type: child.type, prop: child.prop, value: child.value, important: !!child.important};
    return {type: child.type, text: child.text};
  }
  return postcss.parse(css).nodes.map(node).filter(value => value !== null);
}
function syntax(selector: string): string {
  // CSS selector formatting only; descendant combinators and every token remain.
  return selector.trim().replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1');
}
function decode(selector: string): string {return selector.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi,
  (_match, hex: string | undefined, character: string | undefined) => hex ? String.fromCodePoint(parseInt(hex, 16)) : character!);}

// ProfileButton moved these three foreign declarations to its named scoped
// utilities before the whole-CSS migration. Verify their actual complete output
// and component membership before comparing the remaining native foreign tree.
function currentForeignOracle(original:Fixture['originalFiles'][number],currentCSS:string,component:string):string {
  if(original.path!=='css/redesign-shell.css')return original.css;
  const native=postcss.parse(original.css),previous:Rule[]=[];
  native.walkRules(rule=>{if(rule.selector==='.profile-compact-btn')previous.push(rule);});
  expect(previous).toHaveLength(3);expect(previous.map(rule=>declarations(rule).length)).toEqual([4,1,4]);
  const actual:Rule[]=[];postcss.parse(currentCSS).walkRules(rule=>{if(rule.selector.includes('profile-button-redesign'))actual.push(rule);});expect(actual).toHaveLength(3);
  const variants=['button','button-small','button-touch'];
  const groups=(rule:Rule)=>{const values:string[]=[];for(let parent:Rule['parent']|postcss.Document=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule'){expect(parent.name).toBe('media');values.unshift(parent.params);}return values;};
  for(const [index,before] of previous.entries()){
    const variant='profile-button-redesign-'+variants[index]!,token='gb:'+variant+':'+variant+'-block';
    const selector=':where(.'+token.replaceAll(':','\\:')+'):where(#profile-selector *):is(.profile-compact-btn)';
    expect(actual[index]!.selector).toBe(selector);expect(groups(actual[index]!)).toEqual(groups(before));
    expect(actual[index]!.nodes.every(node=>node.type==='decl')).toBe(true);
    expect(declarations(actual[index]!)).toEqual(declarations(before));
    expect(component).toContain("'"+token+"'");
  }
  for(const rule of previous)rule.remove();
  return native.toString();
}

// Native assertions consume each actual compiled base; authored inputs now contain
// checked semantic recipes. All original fixture hashes and comparisons stay exact.
async function currentNativeBase(target:string):Promise<string> {
  const input=await fs.readFile(target,'utf8'),file=path.resolve(target),root=path.resolve('.');
  if(target==='css/redesign-shell.base.css')return (await compileStartupBannerStyles('redesign-shell',input,file,root)).css;
  if(target==='css/settings.base.css')return (await compileSettingsChatLayoutStyles('settings',input,file,root)).css;
  throw new Error('Unknown Tweaks native base: '+target);
}

it('preserves every original Tweaks declaration block, foreign rule and literal node receiver', async () => {
  expect(fixture.rules).toHaveLength(37);
  expect(fixture.rules.reduce((count, rule) => count + rule.declarations.length, 0)).toBe(146);
  expect(fixture.mapping).toHaveLength(40);
  for (const original of fixture.originalFiles) {
    expect(createHash('sha256').update(original.css).digest('hex')).toBe(original.sha256);
    const owned = new Set(fixture.rules.filter(rule => rule.source === original.path).flatMap(rule => rule.selectors));
    const target = original.path === 'css/redesign-shell.css' ? 'css/redesign-shell.base.css' : original.path;
    const base = await currentNativeBase(target);
    expect(foreignTree(base, owned)).toEqual(foreignTree(currentForeignOracle(original,await fs.readFile('css/redesign-shell.css','utf8'),await fs.readFile('js/components/ProfileButtonPresentation.svelte','utf8')), owned));
    const remaining: string[] = []; postcss.parse(base).walkRules(rule => {remaining.push(...rule.selectors);});
    expect(remaining.some(selector => owned.has(selector))).toBe(false);
  }
  for (const lane of ['eager', 'settings']) {
    const root = postcss.parse(await fs.readFile(`css/tweaks-${lane}.tailwind.css`, 'utf8'));
    const utilities = new Map<string, AtRule>(), variants = new Map<string, AtRule>();
    root.walkAtRules('utility', rule => {utilities.set(rule.params, rule);});
    root.walkAtRules('custom-variant', rule => {variants.set(rule.params, rule);});
    for (const record of fixture.mapping.filter(record => record.lane === lane)) {
      const utility = utilities.get(record.utility), variant = variants.get(record.variant);
      expect(utility, record.token).toBeDefined(); expect(variant, record.token).toBeDefined();
      expect(declarations(utility!)).toEqual(record.declarations);
      const media: string[] = []; variant!.walkAtRules('media', rule => {media.push('@media ' + rule.params);});
      expect(media).toEqual(record.atRules);
      const scoped: string[] = []; variant!.walkRules(rule => {scoped.push(rule.selector);});
      expect(scoped).toEqual([`:where(&):where(#tweaks-panel-overlay, #tweaks-panel-overlay *):is(${record.selector})`]);
      expect(tweaksClasses('', record.receiver).split(/\s+/).filter(Boolean)).toContain(record.token);
      if (record.nestedSupports) {
        const supports: AtRule[] = []; utility!.walkAtRules('supports', rule => {supports.push(rule);});
        expect(supports).toHaveLength(1); expect(supports[0]!.params).toBe('(height: 100dvh)');
        expect(declarations(supports[0]!)).toEqual(record.nestedSupports.orderedDeclarations);
        expect(utility!.nodes?.at(-1)).toBe(supports[0]);
      }
    }
  }
});

it('keeps the eager runtime URL, native selector strengths and ordered phone fallback without a reset', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-tweaks-style-'));
  try {
    const outputPath = path.join(directory, 'redesign-shell.css');
    await buildRedesignShellStyles({outputPath});
    const css = await fs.readFile(outputPath, 'utf8'), base = (await currentNativeBase('css/redesign-shell.base.css')).trimEnd();
    expect(css).toContain(base);
    const utilities = postcss.parse(css.slice(css.indexOf(base) + base.length));
    const rules: Rule[] = []; utilities.walkRules(rule => {rules.push(rule);});
    for (const record of fixture.mapping.filter(record => record.lane === 'eager')) {
      const actual = rules.filter(rule => decode(rule.selector).includes('.' + record.token));
      expect(actual, record.token).toHaveLength(1);
      for (const rule of actual) {
        const zeros = rule.selector.match(/:where\([^)]*\)/g) ?? [];
        expect(zeros).toHaveLength(2);
        expect(zeros.some(zero => syntax(zero) === ':where(#tweaks-panel-overlay,#tweaks-panel-overlay *)')).toBe(true);
        expect(syntax(rule.selector.replace(/:where\([^)]*\)/g, ''))).toBe(`:is(${syntax(record.selector)})`);
        const media: string[] = [];
        for (let parent: Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent)
          if (parent.type === 'atrule' && parent.name === 'media') media.unshift('@media ' + parent.params);
        expect(media.map(condition => condition.replace(/\s+/g, ''))).toEqual(record.atRules.map(condition => condition.replace(/\s+/g, '')));
      }
      if (record.nestedSupports) {
        const fallback = actual[0]!;
        const supported = fallback.nodes.filter((node): node is AtRule => node.type === 'atrule' && node.name === 'supports');
        expect(supported).toHaveLength(1);
        expect(supported[0]!.params).toBe('(height: 100dvh)');
        expect(declarations(supported[0]!)).toEqual(record.nestedSupports.orderedDeclarations);
        expect(fallback.nodes.at(-1)).toBe(supported[0]);
        expect(declarations(fallback).some(field => field.property === 'height' && field.value.includes('100vh'))).toBe(true);
      }
      if (record.receiver === 'head') {
        // Tailwind's supported color-mix lowering: retain exact source value under its literal native condition.
        const head = actual[0]!;
        const supported = head.nodes.filter((node): node is AtRule => node.type === 'atrule' && node.name === 'supports');
        expect(supported).toHaveLength(1);
        expect(supported[0]!.params).toBe('(color: color-mix(in lab, red, red))');
        expect(declarations(head).find(field => field.property === 'background')?.value).toBe('var(--bg-secondary)');
        expect(declarations(supported[0]!)).toEqual(record.declarations.filter(field => field.property === 'background'));
        expect(head.nodes.at(-1)).toBe(supported[0]);
      }
      if (record.receiver === 'theme-button' || record.receiver === 'action-button') {
        const original = record.declarations.findIndex(field => field.property === 'font');
        if (original >= 0) for (const rule of actual) {
          const fields = declarations(rule);
          expect(fields.findIndex(field => field.property === 'font')).toBeLessThan(fields.findIndex(field => field.property === 'font-size'));
          expect(fields.find(field => field.property === 'font')?.value).toBe('inherit');
          expect(fields.find(field => field.property === 'font-size')?.value).toBe('13px');
        }
      }
    }
    utilities.walkAtRules(rule => {expect(['media', 'supports']).toContain(rule.name);});
    utilities.walkDecls(declaration => {expect(declaration.important).toBeFalsy(); expect(declaration.prop.startsWith('--')).toBe(false);});
    expect(rules.every(rule => !['body', 'html', ':root', '*', 'button,input,optgroup,select,textarea'].includes(rule.selector))).toBe(true);
    const index = await fs.readFile('index.html', 'utf8');
    expect(index.indexOf('href="css/chat-panel.css"')).toBeLessThan(index.indexOf('href="css/redesign-shell.css"'));
    expect(index.indexOf('href="css/redesign-shell.css"')).toBeLessThan(index.indexOf('href="css/chat-redesign.css"'));
    await buildRedesignShellStyles({outputPath, check: true});
    await fs.writeFile(outputPath, css + '/* stale */');
    await expect(buildRedesignShellStyles({outputPath, check: true})).rejects.toThrow('Redesign shell CSS is stale');
    expect(await fs.readFile(outputPath, 'utf8')).toBe(css + '/* stale */');
  } finally {await fs.rm(directory, {recursive: true, force: true});}
});

// Guard the exact foreign-owner transition itself; none of these mutations can
// be hidden by the original Tweaks foreign-tree comparison.
it.each(['value','media','scope','component token','extra receiver','foreign child'] as const)('rejects ProfileButton foreign-owner %s drift',async(kind)=>{
  const original=fixture.originalFiles.find(row=>row.path==='css/redesign-shell.css');expect(original).toBeDefined();
  const css=await fs.readFile('css/redesign-shell.css','utf8'),component=await fs.readFile('js/components/ProfileButtonPresentation.svelte','utf8');
  currentForeignOracle(original!,css,component);
  const tree=postcss.parse(css),rules:Rule[]=[];tree.walkRules(rule=>{if(rule.selector.includes('profile-button-redesign'))rules.push(rule);});
  let changedComponent=component;
  if(kind==='value'){const decl=rules[0]!.nodes[0];expect(decl?.type).toBe('decl');if(decl?.type!=='decl')throw new Error('Expected Profile declaration');decl.value+='__changed';}
  if(kind==='media'){const parent=rules[1]!.parent;expect(parent?.type).toBe('atrule');if(parent?.type!=='atrule')throw new Error('Expected Profile media');parent.params='(max-width:481px)';}
  if(kind==='scope')rules[0]!.selector=rules[0]!.selector.replace('#profile-selector *','#foreign *');
  if(kind==='component token')changedComponent=component.replace("'gb:profile-button-redesign-button:profile-button-redesign-button-block'","'foreign-profile-owner'");
  if(kind==='extra receiver')tree.append(rules[0]!.clone());
  if(kind==='foreign child')rules[0]!.append(postcss.atRule({name:'media',params:'(min-width:0px)',nodes:[postcss.rule({selector:'.foreign',nodes:[postcss.decl({prop:'color',value:'red'})]})]}));
  const changed=tree.toString();expect(changed!==css||changedComponent!==component).toBe(true);
  expect(()=>currentForeignOracle(original!,changed,changedComponent)).toThrow();
});
