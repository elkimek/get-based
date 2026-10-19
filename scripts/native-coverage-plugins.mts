import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {encode} from '@jridgewell/sourcemap-codec';
import {isProductionSource} from './coverage-source.mjs';
import type {Plugin} from 'vite';
import type {} from 'vitest/config';
import type {NativeContext, NativeGeometry, NativeObservation} from './native-coverage-types.mjs';
import {nativeContext, nativeDigest, nativeSelected, readNativeRegular, writeNativeJSON} from './native-coverage-storage.mjs';
const OBSERVER = 'getbased-native-coverage-observer';
/** Identity geometry adds maps only; the observer returns null and records the final public pre-SSR input. */
export function nativeCoveragePlugins(): Plugin[] {
  let enabled = false, root = '', directory = '';
  function context(): NativeContext | null {
    if (!enabled) return null; const file = path.join(directory, 'context.json'); assert(fs.existsSync(file), 'Native coverage context is not initialized');
    const value = JSON.parse(readNativeRegular(file).toString('utf8')) as NativeContext; nativeContext(value); assert.equal(value.root, root); assert.equal(value.directory, directory); return value;
  }
  function selectedContext(id: string): {config: NativeContext; file: string} | null {
    if (!enabled || !path.isAbsolute(id)) return null;
    const relative = path.relative(root, id).split(path.sep).join('/');
    // Provider/tooling modules load before initialize; never ask them for the not-yet-created run context.
    if (!isProductionSource(relative, root)) return null;
    const config = context(); assert(config); const file = nativeSelected(config, id);
    return file ? {config, file} : null;
  }
  const geometry: Plugin = {name: 'getbased-native-coverage-geometry', enforce: 'pre', configureVitest({project}) {
    // This public hook runs after CLI options are merged into the resolved project.
    root = fs.realpathSync(project.config.root);
    const coverage = project.config.coverage;
    enabled = coverage.enabled && coverage.provider === 'custom'
      && path.resolve(root, coverage.customProviderModule ?? '') === path.join(root, 'scripts/native-coverage-runtime.mjs');
    directory = path.resolve(root, coverage.reportsDirectory);
  }, transform(code, id) {
    const selected = selectedContext(id); if (!selected) return null; const {config, file} = selected;
    const original = readNativeRegular(path.join(config.root, file)).toString('utf8'); let expected = original;
    if (/\.svelte\.(?:native|html)\.js$/.test(file)) {const trailers = [...original.matchAll(/^\/\/# sourceMappingURL=[^\r\n]*/gm)]; assert.equal(trailers.length, 1); const trailer = trailers[0]!; assert.equal(original.slice(trailer.index + trailer[0].length).trim(), ''); expected = original.slice(0, trailer.index) + original.slice(trailer.index + trailer[0].length);}
    assert.equal(code, expected, 'Unqualified transform before native source geometry'); const environment = this.environment.name, consumer = this.environment.config.consumer;
    assert((environment === 'ssr' && consumer === 'server') || (environment === 'client' && consumer === 'client'));
    const record: NativeGeometry = {file, environment, consumer, originalHash: nativeDigest(original), code}; writeNativeJSON(config.directory, `geometry-${nativeDigest(JSON.stringify(record))}.json`, record);
    const map = {version: 3 as const, file: path.join(config.root, file), sources: [path.join(config.root, file)], sourcesContent: [original], names: [], mappings: encode(code.split('\n').map((line, index) => Array.from({length: line.length + 1}, (_, column) => [column, 0, index, column])))};
    return {code, map};
  }};
  const observer: Plugin = {name: OBSERVER, enforce: 'post', transform: {order: 'post', handler(code, id) {
    const selected = selectedContext(id); if (!selected) return null; const {config, file} = selected;
    assert.equal(this.environment.mode, 'dev', 'Native coverage observer requires a dev transform environment');
    assert(this.environment.mode === 'dev');
    const ordering = this.environment.pluginContainer.getSortedPlugins('transform').map(plugin => ({name: plugin.name, order: typeof plugin.transform === 'object' ? plugin.transform.order ?? null : null}));
    const own = ordering.flatMap((plugin, index) => plugin.name === OBSERVER ? [index] : []), analysis = ordering.flatMap((plugin, index) => plugin.name === 'vite:import-analysis' ? [index] : []);
    assert(own.length === 1 && analysis.length === 1 && own[0] === analysis[0]! + 1 && own[0] === ordering.length - 1, 'Native observer is not the final post-import-analysis hook');
    const environment = this.environment.name, consumer = this.environment.config.consumer; assert((environment === 'ssr' && consumer === 'server') || (environment === 'client' && consumer === 'client'));
    const record: NativeObservation = {file, environment, consumer, code, ordering, ownIndex: own[0]!, analysisIndex: analysis[0]!}; writeNativeJSON(config.directory, `observation-${nativeDigest(JSON.stringify(record))}.json`, record); return null;
  }}};
  return [geometry, observer];
}
