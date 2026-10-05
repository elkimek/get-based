// startup-maintenance-runtime.js - Browser runtime adapters for startup maintenance hooks.

let loadedSunEngineVersion: typeof import('./sun-sessions-store.js').SUN_ENGINE_VERSION | '?' = '?';

interface StartupMaintenanceSunDeps { rehydrateStaleSessions: unknown; getSunEngineVersion: unknown }
type StartupMaintenanceSunUpdates = { [Key in keyof StartupMaintenanceSunDeps]?: unknown };
interface MaintenanceRuntimeReader { console?: { log?: unknown } | null }
type MaintenanceCallback = () => unknown;
const startupMaintenanceSunDeps: StartupMaintenanceSunDeps = {
  rehydrateStaleSessions: async () => {
    const module = await import('./sun-sessions-store.js');
    loadedSunEngineVersion = module.SUN_ENGINE_VERSION;
    return module.rehydrateStaleSessions();
  },
  getSunEngineVersion: () => loadedSunEngineVersion,
};

export function configureStartupMaintenanceSunDeps(deps: StartupMaintenanceSunUpdates = {}) {
  const previous = { ...startupMaintenanceSunDeps };
  for (const name of ['rehydrateStaleSessions', 'getSunEngineVersion'] as const) {
    if (name in deps) {
      startupMaintenanceSunDeps[name] = typeof deps[name] === 'function' ? deps[name] : null;
    }
  }
  return previous;
}

function getStartupMaintenanceRuntime() {
  return typeof window !== 'undefined'
    ? (window as unknown as MaintenanceRuntimeReader)
    : null;
}

export function hasSunSessionRehydrateRuntime() {
  return startupMaintenanceSunDeps.rehydrateStaleSessions !== null;
}

export function rehydrateStaleSunSessionsRuntime() {
  try {
    return (startupMaintenanceSunDeps.rehydrateStaleSessions as MaintenanceCallback | null | undefined)?.() || Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}

export function getStartupSunEngineVersionRuntime() {
  try {
    return (startupMaintenanceSunDeps.getSunEngineVersion as MaintenanceCallback | null | undefined)?.() || '?';
  } catch {
    return '?';
  }
}

export function logStartupMaintenanceRuntime(...args: unknown[]) {
  const runtime = getStartupMaintenanceRuntime();
  const logger = runtime?.console?.log;
  if (typeof logger !== 'function') return false;
  try {
    (logger as { apply(receiver: unknown, args: unknown[]): unknown }).apply(runtime!.console, args);
    return true;
  } catch {
    return false;
  }
}
