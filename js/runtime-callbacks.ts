/** Patch known callbacks, clearing explicit non-functions; omitted slots retain their values. */
export function configureRuntimeCallbacks<T extends { [K in keyof T]: ((...args: never[]) => unknown) | null }>(
  current: T, updates: Partial<T> = {}, keyScope: 'own' | 'inherited' = 'own',
): T {
  const previous = { ...current };
  for (const key of Object.keys(current) as Array<keyof T>) {
    if (keyScope === 'inherited' ? key in updates : Object.hasOwn(updates, key)) {
      current[key] = (typeof updates[key] === 'function' ? updates[key] : null) as T[typeof key];
    }
  }
  return previous;
}

/** Patch injected hooks in declaration order; only nullable slots clear invalid overrides. */
export function configureRuntimeDependencies<T extends { [K in keyof T]: ((...args: never[]) => unknown) | null }>(
  current: T, updates: Partial<T> = {}, nullableKeys: ReadonlyArray<keyof T> = [],
): T {
  const previous = { ...current };
  for (const key of Object.keys(current) as Array<keyof T>) {
    if (nullableKeys.includes(key)) {
      if (key in updates) current[key] = (typeof updates[key] === 'function' ? updates[key] : null) as T[typeof key];
    } else if (typeof updates[key] === 'function') {
      current[key] = updates[key] as T[typeof key];
    }
  }
  return previous;
}
