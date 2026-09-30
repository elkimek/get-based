export interface AmbientLightSensor extends EventTarget { illuminance: number | null; start(): void; stop(): void; }
export interface AmbientLightSensorConstructor { new(options: { frequency: number }): AmbientLightSensor; }
export interface MammothTextExtractor { extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<{ value?: string }> }
export interface ZipEntry { dir: boolean; name: string; async(type: 'blob'): Promise<Blob>; }
export interface ZipRuntime { loadAsync(buffer: ArrayBuffer): Promise<{ files: Record<string, ZipEntry> }> }
interface RuntimeValues { AmbientLightSensor: AmbientLightSensorConstructor; mammoth: MammothTextExtractor; JSZip: ZipRuntime; }
type UtilsWindow = Window & typeof globalThis & Record<string, unknown>;

// utils-runtime.js - Browser runtime adapters for shared utilities.

function getUtilsRuntime(): UtilsWindow | null {
  return typeof window !== 'undefined'
    ? (window as UtilsWindow)
    : null;
}

export function hasUtilsRuntime() {
  return getUtilsRuntime() !== null;
}

export function getAppVersionRuntime(fallback = '') {
  const version = getUtilsRuntime()?.APP_VERSION;
  return typeof version === 'string' && version ? version : fallback;
}

export function getUtilsRuntimeHostname(fallback = '') {
  const hostname = getUtilsRuntime()?.location?.hostname;
  return typeof hostname === 'string' ? hostname : fallback;
}

export function getUtilsRuntimeValue<K extends keyof RuntimeValues>(name: K): RuntimeValues[K] | null;
export function getUtilsRuntimeValue(name: string, fallback?: unknown): unknown;
export function getUtilsRuntimeValue(name: string, fallback: unknown = null): unknown {
  const runtime = getUtilsRuntime();
  if (!runtime || !(name in runtime)) return fallback;
  return runtime[name];
}

export function registerUtilsRuntimeExports(exportsByName: Record<string, unknown>): boolean {
  const runtime = getUtilsRuntime();
  if (!runtime || !exportsByName) return false;
  Object.assign(runtime, exportsByName);
  return true;
}

export function dispatchUtilsRuntimeEvent(name: string, detail?: Record<string, unknown>): boolean {
  const runtime = getUtilsRuntime();
  const CustomEventCtor = runtime?.CustomEvent;
  if (!runtime || typeof runtime.dispatchEvent !== 'function' || typeof CustomEventCtor !== 'function') return false;
  runtime.dispatchEvent(new CustomEventCtor(name, detail === undefined ? undefined : { detail }));
  return true;
}

export function openUtilsRuntimeWindow(url: string | URL, target = '_blank', features?: string): WindowProxy | null {
  const runtime = getUtilsRuntime();
  const open = runtime?.open;
  if (typeof open !== 'function') return null;
  if (features === undefined) return open.call(runtime, url, target);
  return open.call(runtime, url, target, features);
}

export function scheduleUtilsAfterNextPaint(fn: () => void): boolean {
  const runtime = getUtilsRuntime();
  const requestAnimationFrame = runtime?.requestAnimationFrame;
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(fn, 0);
    return false;
  }
  requestAnimationFrame.call(runtime, () => setTimeout(fn, 0));
  return true;
}

function isEventListener(listener: EventListenerOrEventListenerObject) {
  return typeof listener === 'function'
    || (listener && typeof listener.handleEvent === 'function');
}

export function addUtilsRuntimeListener(name: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): boolean {
  const runtime = getUtilsRuntime();
  if (!runtime || typeof runtime.addEventListener !== 'function' || !isEventListener(listener)) return false;
  runtime.addEventListener(name, listener, options);
  return true;
}

export function removeUtilsRuntimeListener(name: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): boolean {
  const runtime = getUtilsRuntime();
  if (!runtime || typeof runtime.removeEventListener !== 'function' || !isEventListener(listener)) return false;
  runtime.removeEventListener(name, listener, options);
  return true;
}

export function getUtilsElementStyleRuntime(el: Element): CSSStyleDeclaration | null {
  const runtime = getUtilsRuntime();
  const getComputedStyle = runtime?.getComputedStyle;
  return typeof getComputedStyle === 'function' ? getComputedStyle.call(runtime, el) : null;
}
