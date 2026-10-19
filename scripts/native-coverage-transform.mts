import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import MagicString from 'magic-string';
import {moduleRunnerTransform} from 'vite';
import * as ts from 'typescript/unstable/ast';
import type {EncodedSourceMap} from '@jridgewell/trace-mapping';
import {withParsedSource} from './native-typescript-ast.js';
import {nativeDigest, readNativeRegular} from './native-coverage-storage.mjs';
import type {NativeEnvironment, NativeGeometry, NativeObservation, NativeSnapshot, NativeTransform} from './native-coverage-types.mjs';
export const NATIVE_WRAPPER_PREFIX = "'use strict';async (__vite_ssr_exports__,__vite_ssr_import_meta__,__vite_ssr_import__,__vite_ssr_dynamic_import__,__vite_ssr_exportAll__,__vite_ssr_exportName__,__filename,__dirname,module,exports,require)=>{{";
const SUFFIX = '\n}}', HELPER = 'import { injectQuery as __vite__injectQuery } from "/@vite/client";';
interface Literal {kind: string; variant: string; start: number; end: number; value: string; original: string;}
interface Dynamic {start: number; end: number; original: string; value: string | null; kind: string; closedArrow: boolean;}
interface Asset {start: number; end: number; literal: string; binding: string; text: string;}
interface ModuleFacts {literals: Literal[]; dynamics: Dynamic[]; assets: Asset[]; urlShadowed: boolean;}
function syntax(source: string, file: string, post = false): ModuleFacts {
  return withParsedSource(source, file, (ast, project) => {
    assert.equal(project.program.getSyntacticDiagnostics().length, 0, 'Malformed transform source');
    const literals: Literal[] = [], dynamics: Dynamic[] = [], assets: Asset[] = []; let urlShadowed = false;
    function asset(node: ts.Node, parents: ts.Node[]): void {
      if (!ts.isNewExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== 'URL' || node.arguments?.length !== 2 || !ts.isStringLiteral(node.arguments[0]!)) return;
      const second = node.arguments[1]!;
      if (!post) {if (!ts.isPropertyAccessExpression(second) || second.name.text !== 'url' || !ts.isMetaProperty(second.expression) || second.expression.keywordToken !== ts.SyntaxKind.ImportKeyword) return;}
      else if (!ts.isBinaryExpression(second) || second.operatorToken.kind !== ts.SyntaxKind.PlusToken || !ts.isStringLiteral(second.left) || second.left.text !== '' || !ts.isPropertyAccessExpression(second.right) || !ts.isIdentifier(second.right.expression) || second.right.expression.text !== 'self' || second.right.name.text !== 'location') return;
      const prop = parents.at(-1), declaration = parents.at(-2), list = parents.at(-3), statement = parents.at(-4);
      assert(prop && declaration && list && statement && ts.isPropertyAccessExpression(prop) && prop.expression === node && prop.name.text === 'href' && ts.isVariableDeclaration(declaration) && declaration.initializer === prop && ts.isIdentifier(declaration.name) && ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0 && ts.isVariableStatement(statement) && parents.at(-5) === ast, 'Unsupported static asset scope');
      assets.push({start: node.getStart(ast), end: node.end, literal: node.arguments[0]!.text, binding: declaration.name.text, text: source.slice(node.getStart(ast), node.end)});
    }
    function visit(node: ts.Node, parents: ts.Node[]): void {
      if (ts.isImportDeclaration(node)) {
        assert(ts.isStringLiteral(node.moduleSpecifier), 'Nonliteral import'); const clause = node.importClause, binding = clause?.namedBindings;
        const variant = !clause ? 'bare' : binding ? (ts.isNamespaceImport(binding) ? 'namespace' : 'named') + (clause.name ? '+default' : '') : 'default';
        literals.push({kind: 'import', variant, start: node.moduleSpecifier.getStart(ast), end: node.moduleSpecifier.end, value: node.moduleSpecifier.text, original: source.slice(node.moduleSpecifier.getStart(ast), node.moduleSpecifier.end)});
        urlShadowed ||= clause?.name?.text === 'URL' || !!(binding && (ts.isNamespaceImport(binding) ? binding.name.text === 'URL' : binding.elements.some(element => element.name.text === 'URL')));
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        assert(ts.isStringLiteral(node.moduleSpecifier)); literals.push({kind: 'reexport', variant: node.exportClause ? ts.isNamedExports(node.exportClause) ? 'named' : 'namespace' : 'star', start: node.moduleSpecifier.getStart(ast), end: node.moduleSpecifier.end, value: node.moduleSpecifier.text, original: source.slice(node.moduleSpecifier.getStart(ast), node.moduleSpecifier.end)});
      }
      if (parents.at(-1) === ast) {
        if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === 'URL') urlShadowed = true;
        if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.name.text === 'URL') urlShadowed = true;
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        assert.equal(node.arguments.length, 1, 'Unsupported dynamic import options'); const arg = node.arguments[0]!;
        const literal = ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg), identifier = ts.isIdentifier(arg), parent = parents.at(-1);
        const parameter = parent && ts.isArrowFunction(parent) && parent.body === node && parent.parameters.length === 1 ? parent.parameters[0] : undefined;
        const closedArrow = !!(identifier && parameter && ts.isIdentifier(parameter.name) && parameter.name.text === arg.text && !parameter.dotDotDotToken && !parameter.initializer);
        dynamics.push({start: arg.getStart(ast), end: arg.end, original: source.slice(arg.getStart(ast), arg.end), value: literal || identifier ? arg.text : null, kind: literal ? 'literal' : identifier ? 'identifier' : 'unsupported', closedArrow});
      }
      asset(node, parents); node.forEachChild(child => visit(child, [...parents, node]));
    }
    visit(ast, []); return {literals, dynamics, assets, urlShadowed};
  });
}
function resolvedLiteral(root: string, file: string, specifier: string, environment: NativeEnvironment): string {
  if (specifier.startsWith('node:')) {assert.equal(environment.consumer, 'client', 'SSR builtin import must remain unchanged'); return '/@id/__vite-browser-external:' + specifier;}
  assert(specifier.startsWith('.'), 'Unsupported import resolution'); const relative = path.relative(root, path.resolve(path.dirname(file), specifier));
  assert(relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Import escapes repository'); return '/' + relative.split(path.sep).join('/');
}
function decode64(value: string, max: number): Buffer {
  assert(value.length > 0 && value.length <= max && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), 'Malformed native inline record');
  const bytes = Buffer.from(value, 'base64'); assert.equal(bytes.toString('base64'), value); return bytes;
}
/** Reconstruct the complete observed transform, then ask Vite's public transform for exact runtime bytes and map. */
export async function replayNativeTransform(root: string, relative: string, canonical: string, runtime: string, snapshot: NativeSnapshot, offset: number, geometry: NativeGeometry, observation: NativeObservation, environment: NativeEnvironment): Promise<NativeTransform> {
  const file = path.join(root, relative), {ordering, ownIndex, analysisIndex} = observation;
  assert.equal(geometry.file, relative); assert.equal(observation.file, relative);
  for (const proof of [geometry, observation]) {assert.equal(proof.environment, environment.viteEnvironment); assert.equal(proof.consumer, environment.consumer);}
  assert.equal(geometry.originalHash, nativeDigest(canonical));
  assert.equal(ordering.filter(plugin => plugin.name === 'getbased-native-coverage-observer').length, 1);
  assert.equal(ordering.filter(plugin => plugin.name === 'vite:import-analysis').length, 1);
  assert.equal(ownIndex, analysisIndex + 1); assert.equal(ownIndex, ordering.length - 1); assert.equal(ordering[ownIndex]?.name, 'getbased-native-coverage-observer'); assert.equal(ordering[ownIndex]?.order, 'post'); assert.equal(ordering[analysisIndex]?.name, 'vite:import-analysis');
  const edited = new MagicString(canonical); let projection = canonical;
  if (/\.svelte\.(?:native|html)\.js$/.test(relative)) {
    const matches = [...canonical.matchAll(/\/\/# sourceMappingURL=[^\r\n]*/g)]; assert.equal(matches.length, 1); const trailer = matches[0]!;
    assert.equal(trailer[0], '//# sourceMappingURL=' + path.basename(relative) + '.map'); assert.equal(canonical.slice(trailer.index + trailer[0].length).trim(), ''); assert(canonical.slice(0, trailer.index).endsWith('\n'));
    projection = canonical.slice(0, trailer.index) + canonical.slice(trailer.index + trailer[0].length); edited.remove(trailer.index, trailer.index + trailer[0].length);
  }
  assert.equal(geometry.code, projection, 'Unqualified pre-transform projection');
  const post = observation.code, helper = post.startsWith(HELPER), before = syntax(canonical, file), after = syntax(helper ? post.slice(HELPER.length) : post, file + '.post.js', true);
  assert.equal(before.literals.length, after.literals.length, 'Changed import structure');
  for (let index = 0; index < before.literals.length; index++) {
    const a = before.literals[index]!, b = after.literals[index]!; assert(a.kind === b.kind && a.variant === b.variant, 'Changed import form');
    if (a.original === b.original) continue;
    assert.equal(b.value, resolvedLiteral(root, file, a.value, environment)); const replacement = JSON.stringify(b.value); assert.equal(b.original, replacement); edited.overwrite(a.start, a.end, replacement);
  }
  assert.equal(before.dynamics.length, after.dynamics.length, 'Changed dynamic import structure'); let wrapped = 0;
  for (let index = 0; index < before.dynamics.length; index++) {
    const a = before.dynamics[index]!, b = after.dynamics[index]!; if (a.original === b.original) continue;
    if (a.kind === 'literal') {assert(a.value); assert.equal(b.value, resolvedLiteral(root, file, a.value, environment)); const replacement = JSON.stringify(b.value); assert.equal(b.original, replacement); edited.overwrite(a.start, a.end, replacement);}
    else {assert(environment.consumer === 'client' && a.kind === 'identifier' && a.closedArrow && helper, 'Unsupported dynamic import rewrite'); assert.equal(b.original, '__vite__injectQuery(' + a.original + ", 'import')"); edited.appendLeft(a.start, '__vite__injectQuery('); edited.appendLeft(a.end, ", 'import')"); wrapped++;}
  }
  assert.equal(helper, wrapped > 0); if (helper) edited.prepend(HELPER);
  if (before.assets.length || after.assets.length) {
    assert.equal(environment.consumer, 'client'); assert(!before.urlShadowed); assert.equal(before.assets.length, after.assets.length);
    const names = ordering.map(plugin => plugin.name), asset = names.indexOf('vite:asset-import-meta-url'), normalize = names.indexOf('vitest:normalize-url');
    assert(asset >= 0 && names.lastIndexOf('vite:asset-import-meta-url') === asset && normalize > asset && names.lastIndexOf('vitest:normalize-url') === normalize && ownIndex > normalize);
    for (let index = 0; index < before.assets.length; index++) {
      const a = before.assets[index]!, b = after.assets[index]!; assert(a.binding === b.binding && a.literal.startsWith('.') && !/[?#]/.test(a.literal));
      const target = path.resolve(path.dirname(file), a.literal), resource = path.relative(root, target); assert(resource && !resource.startsWith('..' + path.sep) && !path.isAbsolute(resource)); assert.equal(fs.realpathSync(target), target); readNativeRegular(target);
      const url = '/' + resource.split(path.sep).join('/'), replacement = `new URL(${JSON.stringify(url)}, '' + ${'self.location'.padEnd(15, ' ')})`;
      assert.equal(b.literal, url); assert.equal(b.text, replacement); assert(!before.literals.some(edit => a.start < edit.end && edit.start < a.end) && !before.dynamics.some(edit => a.start < edit.end && edit.start < a.end)); edited.overwrite(a.start, a.end, replacement);
    }
  }
  assert.equal(edited.toString(), post, 'Whole observed module differs from finite source reconstruction');
  if (environment.consumer === 'server') assert(!helper && !post.includes('__vite__injectQuery'), 'SSR received client-only rewrite');
  assert.equal(offset, NATIVE_WRAPPER_PREFIX.length); assert(runtime.startsWith(NATIVE_WRAPPER_PREFIX) && runtime.endsWith(SUFFIX));
  const body = runtime.slice(offset, -SUFFIX.length), marker = '\n//# vitestCache=', cacheAt = body.lastIndexOf(marker); assert(cacheAt >= 0 && body.indexOf(marker) === cacheAt);
  const cache = body.slice(cacheAt); decode64(cache.slice(marker.length), 65536);
  const url = snapshot.metadata.sourceMapURL; assert(typeof url === 'string' && url.startsWith('data:application/json;base64,'));
  const inline: unknown = JSON.parse(decode64(url.slice('data:application/json;base64,'.length), 2 * 1024 * 1024).toString('utf8')); assert(inline && typeof inline === 'object' && 'version' in inline && inline.version === 3 && 'mappings' in inline && typeof inline.mappings === 'string');
  const trailer = '\n//# sourceMappingSource=vite-generated\n//# sourceMappingURL=' + url + '\n', withoutCache = body.slice(0, cacheAt); assert(withoutCache.endsWith(trailer) && withoutCache.indexOf('\n//# sourceMappingSource=') === withoutCache.length - trailer.length);
  const generated = edited.generateMap({hires: true, includeContent: true, source: file, file: path.basename(file) + '.post-import.js'});
  assert(generated.sourcesContent);
  const initialMap = {file: generated.file, version: generated.version, sources: generated.sources, sourcesContent: generated.sourcesContent, names: generated.names, mappings: generated.mappings, toString: () => generated.toString(), toUrl: () => generated.toUrl()};
  const result = await moduleRunnerTransform(post, initialMap, file, post); assert(result?.map && 'version' in result.map && result.map.version === 3);
  assert.equal(NATIVE_WRAPPER_PREFIX + result.code.trimEnd() + trailer + cache + SUFFIX, runtime, 'Whole public Vite runtime reconstruction failed');
  assert(result.map.sources.length === 1 && result.map.sources[0] === file && result.map.sourcesContent?.[0] === canonical, 'Public transform source map provenance failed');
  return {file, canonical, runtime, offset, code: result.code, map: result.map as EncodedSourceMap};
}
