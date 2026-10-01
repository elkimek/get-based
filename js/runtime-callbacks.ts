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

export type RuntimeDependencyUpdates<T> = { [Key in keyof T]?: T[Key] | undefined };

/** Patch injected hooks in declaration order; only nullable slots clear invalid overrides. */
export function configureRuntimeDependencies<T extends { [K in keyof T]: ((...args: never[]) => unknown) | null }>(
  current: T, updates: RuntimeDependencyUpdates<T> = {}, nullableKeys: ReadonlyArray<keyof T> = [],
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


/** Accept own function/null overrides, leaving invalid values and inherited slots untouched. */
export function configureValidRuntimeCallbacks<T extends { [K in keyof T]: ((...args: never[]) => unknown) | null }>(
  current: T, updates: Partial<T> = {},
): T {
  const previous = { ...current };
  for (const key of Object.keys(current) as Array<keyof T>) {
    if (Object.hasOwn(updates, key) && (updates[key] === null || typeof updates[key] === 'function')) {
      current[key] = updates[key] as T[typeof key];
    }
  }
  return previous;
}

/** Schedule with the browser receiver, then global timers, then immediate execution. */
export function scheduleRuntimeTask(callback: () => void, delayMs = 0): number | ReturnType<typeof setTimeout> | null {
  const runtime = typeof window !== 'undefined' ? window : null;
  const schedule = runtime && typeof runtime.setTimeout === 'function'
    ? runtime.setTimeout.bind(runtime)
    : (typeof setTimeout === 'function' ? setTimeout : null);
  if (!schedule) {
    callback();
    return null;
  }
  return schedule(callback, delayMs);
}
