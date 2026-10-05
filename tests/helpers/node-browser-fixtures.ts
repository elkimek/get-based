// These fixtures intentionally implement only the browser surfaces used by
// standalone tests. Installation projections keep their partial shape explicit.
interface NodeWorkerSelf {
  postMessage(data: unknown): void;
  onmessage?: (event: { data: unknown }) => void;
}
interface NodeWorkerFixture {
  _self: NodeWorkerSelf;
  _ready: Promise<void>;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: unknown }) => void;
  postMessage(data: unknown): void;
  terminate(): void;
}

function _stubEl() {
  return {
    style: {}, dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    appendChild: () => {}, removeChild: () => {}, replaceChild: () => {},
    insertBefore: () => {}, remove: () => {},
    setAttribute: () => {}, getAttribute: () => null, removeAttribute: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    focus: () => {}, blur: () => {}, click: () => {},
    children: [], childNodes: [],
    innerHTML: '', textContent: '', value: '',
    parentElement: null, parentNode: null,
  };
}

export function installNodeWindow() {
  if (typeof globalThis.window === 'undefined') {
    (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
  }
}

export function installNodeEventBus() {
  if (typeof globalThis.addEventListener !== 'function') {
    const _listeners = new Map<string, Set<EventListenerOrEventListenerObject | null>>();
    globalThis.addEventListener = (type: string, fn: EventListenerOrEventListenerObject | null) => {
      if (!_listeners.has(type)) _listeners.set(type, new Set());
      _listeners.get(type)!.add(fn);
    };
    globalThis.removeEventListener = (type: string, fn: EventListenerOrEventListenerObject | null) => {
      _listeners.get(type)?.delete(fn);
    };
    globalThis.dispatchEvent = (ev) => {
      const fns = _listeners.get(ev?.type);
      if (fns) for (const fn of fns) {
        // Surface listener errors via console.error so the test runner
        // picks them up; don't re-throw (browser dispatchEvent doesn't).
        try { (fn as EventListener)(ev); } catch (e) { console.error('listener error:', e); }
      }
      return true;
    };
  }
}

export function installNodeCSS() {
  if (typeof globalThis.CSS === 'undefined') {
    (globalThis as unknown as { CSS: { escape(value: unknown): string } }).CSS = { escape: (s) => String(s).replace(/[^\w-]/g, (c) => '\\' + c) };
  }
}

export function installNodeNavigator() {
  if (typeof globalThis.navigator === 'undefined') {
    (globalThis as unknown as { navigator: object }).navigator = {};
  }
}

export function installNodeDocument() {
  if (typeof globalThis.document === 'undefined') {
    (globalThis as unknown as { document: { [field: string]: unknown } }).document = {
      addEventListener: () => {}, removeEventListener: () => {},
      createElement: () => _stubEl(),
      createDocumentFragment: () => _stubEl(),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      body: _stubEl(),
      head: _stubEl(),
      documentElement: _stubEl(),
      createTextNode: (t: unknown) => ({ textContent: t }),
      styleSheets: [],
    };
  }
}

export function installNodeWorker() {
  if (typeof globalThis.Worker === 'undefined') {
    const _blobRegistry = new Map<string, Blob | MediaSource>();
    const _origCreateObjectURL = globalThis.URL.createObjectURL;
    globalThis.URL.createObjectURL = (blob) => {
      let url;
      try { url = _origCreateObjectURL.call(globalThis.URL, blob); }
      catch { url = `blob:nodeshim/${_blobRegistry.size}`; }
      _blobRegistry.set(url, blob);
      return url;
    };
    (globalThis as unknown as { Worker: new (url: string) => NodeWorkerFixture }).Worker = class NodeWorker {
      declare _self: NodeWorkerSelf;
      declare _ready: Promise<void>;
      declare onmessage?: (event: { data: unknown }) => void;
      declare onerror?: (event: { message: unknown }) => void;
      constructor(url: string) {
        const blob = _blobRegistry.get(url);
        this._self = {
          postMessage: (data) => {
            queueMicrotask(() => { if (this.onmessage) this.onmessage({ data }); });
          },
        };
        this._ready = (async () => {
          if (!blob) throw new Error(`NodeWorker: no Blob registered for ${url}`);
          new Function('self', await (blob as Blob).text())(this._self);
        })();
      }
      postMessage(data: unknown) {
        this._ready
          // Match browser semantics — a worker that never assigns
          // self.onmessage simply drops the message rather than throwing.
          .then(() => { if (this._self.onmessage) this._self.onmessage({ data }); })
          .catch((err) => { if (this.onerror) this.onerror({ message: err.message }); });
      }
      terminate() {}
    };
  }
}
