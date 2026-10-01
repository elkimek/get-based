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
  current: T, updates: Partial<T> = {}, fields?: ReadonlyArray<keyof T>,
): T {
  const previous = { ...current };
  for (const key of (fields || Object.keys(current)) as ReadonlyArray<keyof T>) {
    if (Object.hasOwn(updates, key) && (updates[key] === null || typeof updates[key] === 'function')) {
      current[key] = updates[key] as T[typeof key];
    }
  }
  return previous;
}

/** Accept callable overrides in the original field order, including inherited functions. */
export function configureRuntimeFunctions<T extends { [K in keyof T]: ((...args: never[]) => unknown) | null }>(
  current: T, updates: Partial<T> = {}, fields?: ReadonlyArray<keyof T>,
): T {
  const previous = { ...current };
  for (const key of (fields || Object.keys(current)) as ReadonlyArray<keyof T>) {
    if (typeof updates[key] === 'function') current[key] = updates[key] as T[typeof key];
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

export type ModuleBridgeFunction = (...args: unknown[]) => unknown;

/** Snapshot new keys before applying own entries; null removes an existing slot. */
export function configureModuleBridge(
  bridge: Record<string, unknown>, updates: Record<string, unknown> = {},
  policy: 'functions' | 'values' = 'functions',
) {
  const previous = { ...bridge };
  for (const name of Object.keys(updates)) {
    if (!(name in previous)) previous[name] = null;
  }
  for (const [name, value] of Object.entries(updates)) {
    if (policy === 'values') {
      if (value === null) delete bridge[name];
      else bridge[name] = value;
    } else if (typeof value === 'function') {
      bridge[name] = value;
    } else if (value === null) {
      delete bridge[name];
    }
  }
  return previous;
}

/** Keep both original property-key reads when the selected slot is callable. */
export function getModuleBridgeFunction(bridge: Record<string, unknown>, name: string) {
  return typeof bridge[name] === 'function'
    ? bridge[name] as ModuleBridgeFunction
    : null;
}
