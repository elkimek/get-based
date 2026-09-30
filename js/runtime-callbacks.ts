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
