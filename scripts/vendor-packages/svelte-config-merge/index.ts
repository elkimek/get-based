// Derived from deepmerge 4.3.1 (MIT; see LICENSE). This private replacement
// preserves the plugin's merge API while blocking prototype keys in BOTH input
// loops, including null-prototype targets and nested/array clones.
type MergeRecord = Record<PropertyKey, unknown>;
type MergeFunction = (target: unknown, source: unknown, options?: MergeOptions) => unknown;
export interface MergeOptions {
  clone?: boolean;
  arrayMerge?: (target: unknown[], source: unknown[], options: ResolvedOptions) => unknown;
  isMergeableObject?: (value: unknown) => boolean;
  customMerge?: (key: PropertyKey) => MergeFunction | undefined;
}
interface ResolvedOptions extends MergeOptions {
  arrayMerge: NonNullable<MergeOptions['arrayMerge']>;
  isMergeableObject: NonNullable<MergeOptions['isMergeableObject']>;
  cloneUnlessOtherwiseSpecified: typeof cloneValue;
}

function forbidden(key: PropertyKey): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

function mergeable(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const tag = Object.prototype.toString.call(value);
  return tag !== '[object RegExp]' && tag !== '[object Date]'
    && (value as MergeRecord)['$$typeof'] !== Symbol.for('react.element');
}

function keys(value: unknown): PropertyKey[] {
  return [...Object.keys(value as object), ...Object.getOwnPropertySymbols(value)
    .filter(key => Object.prototype.propertyIsEnumerable.call(value, key))];
}

function cloneValue(value: unknown, options: ResolvedOptions): unknown {
  return options.clone !== false && options.isMergeableObject(value)
    ? merge(Array.isArray(value) ? [] : {}, value, options) : value;
}

function mergeArrays(target: unknown[], source: unknown[], options: ResolvedOptions): unknown[] {
  return target.concat(source).map(value => cloneValue(value, options));
}

function unsafe(target: unknown, key: PropertyKey): boolean {
  if (forbidden(key)) return true;
  try {
    return key in (target as object) && !(Object.hasOwn(target as object, key)
      && Object.prototype.propertyIsEnumerable.call(target, key));
  } catch {
    return true;
  }
}

function own(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

function merge(target: unknown, source: unknown, input: MergeOptions = {}): unknown {
  const options: ResolvedOptions = {
    ...input,
    arrayMerge: input.arrayMerge || mergeArrays,
    isMergeableObject: input.isMergeableObject || mergeable,
    cloneUnlessOtherwiseSpecified: cloneValue,
  };
  const sourceArray = Array.isArray(source), targetArray = Array.isArray(target);
  if (sourceArray !== targetArray) return cloneValue(source, options);
  if (sourceArray) return options.arrayMerge(target as unknown[], source, options);
  const result: MergeRecord = {};
  if (options.isMergeableObject(target)) {
    for (const key of keys(target)) {
      if (!forbidden(key)) own(result, key, cloneValue((target as MergeRecord)[key], options));
    }
  }
  for (const key of keys(source)) {
    if (unsafe(target, key)) continue;
    const value = (source as MergeRecord)[key];
    if (key in (target as object) && options.isMergeableObject(value)) {
      const custom = options.customMerge?.(key);
      own(result, key, (typeof custom === 'function' ? custom : merge)((target as MergeRecord)[key], value, options));
    } else own(result, key, cloneValue(value, options));
  }
  return result;
}

const deepmerge = Object.assign(merge, {
  all(values: unknown, options?: MergeOptions): unknown {
    if (!Array.isArray(values)) throw new TypeError('first argument should be an array');
    return values.reduce((target: unknown, source: unknown) => merge(target, source, options), {});
  },
});
export default deepmerge;
