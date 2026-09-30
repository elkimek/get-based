/** Patch known callbacks and return a restorable snapshot; explicit non-functions clear a slot. */
export function configureRuntimeCallbacks<T extends { [K in keyof T]: ((...args: never[]) => unknown) | null }>(
  current: T, updates: Partial<T> = {},
): T {
  const previous = { ...current };
  for (const key of Object.keys(current) as Array<keyof T>) {
    if (Object.hasOwn(updates, key)) {
      current[key] = (typeof updates[key] === 'function' ? updates[key] : null) as T[typeof key];
    }
  }
  return previous;
}
