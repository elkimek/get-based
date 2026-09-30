/** Install a test value with the same descriptor used by browser runtime shims. */
export function setRuntimeValue(key: PropertyKey, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  });
}

/** Snapshot descriptors now; restore them in the caller's original key order. */
export function captureRuntimeGlobals(runtimeKeys: readonly PropertyKey[]): () => void {
  const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  return function restoreRuntime(): void {
    for (const key of runtimeKeys) {
      const descriptor = savedDescriptors.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<PropertyKey, unknown>)[key];
    }
  };
}
