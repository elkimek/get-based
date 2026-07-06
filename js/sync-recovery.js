// @ts-check
// sync-recovery.js - resume and network recovery hooks for sync.

let _isSyncEnabled = () => false;
let _isEvoluReady = () => false;
/** @type {(...args: any[]) => Promise<any>} */
let _pushCurrentProfile = async () => {};
/** @type {(...args: any[]) => any} */
let _forcePull = () => {};
/** @type {(...args: any[]) => any} */
let _debug = () => {};
/** @type {(...args: any[]) => any} */
let _notify = () => {};
let _eventsBound = false;
let _lastVisibleSyncAt = 0;
let _lastNetState = true;

/** @param {{
 *   isSyncEnabled?: () => boolean,
 *   isEvoluReady?: () => boolean,
 *   pushCurrentProfile?: (...args: any[]) => Promise<any>,
 *   forcePull?: (...args: any[]) => any,
 *   debug?: (...args: any[]) => any,
 *   notify?: (...args: any[]) => any,
 * }} [deps]
 */
export function configureSyncRecovery({
  isSyncEnabled,
  isEvoluReady,
  pushCurrentProfile,
  forcePull,
  debug,
  notify,
} = {}) {
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof isEvoluReady === 'function') _isEvoluReady = isEvoluReady;
  if (typeof pushCurrentProfile === 'function') _pushCurrentProfile = pushCurrentProfile;
  if (typeof forcePull === 'function') _forcePull = forcePull;
  if (typeof debug === 'function') _debug = debug;
  if (typeof notify === 'function') _notify = notify;
}

function _kickSync(reason) {
  if (!_isSyncEnabled() || !_isEvoluReady()) return;
  const now = Date.now();
  if (now - _lastVisibleSyncAt < 30_000) return;
  _lastVisibleSyncAt = now;
  _debug(`Tab resume (${reason}) - kicking syncNow`);
  // Let the visibility/network event return before heavier push/pull work.
  setTimeout(() => {
    _pushCurrentProfile().catch(() => {});
    _forcePull();
  }, 100);
}

function getDefaultSyncRecoveryRuntime() {
  return {
    win: typeof window !== 'undefined' ? window : null,
    doc: typeof document !== 'undefined' ? document : null,
    nav: typeof navigator !== 'undefined' ? navigator : null,
  };
}

/** @param {{ win?: Window | null, doc?: Document | null, nav?: Navigator | null }} [runtime] */
export function bindSyncRecoveryEvents({ win, doc, nav } = {}) {
  if (_eventsBound) return;
  _eventsBound = true;
  const defaults = getDefaultSyncRecoveryRuntime();
  const runtimeWindow = win === undefined ? defaults.win : win;
  const runtimeDocument = doc === undefined ? defaults.doc : doc;
  const runtimeNavigator = nav === undefined ? defaults.nav : nav;

  if (runtimeNavigator) {
    _lastNetState = runtimeNavigator.onLine ?? true;
  }

  if (runtimeDocument) {
    runtimeDocument.addEventListener('visibilitychange', () => {
      if (runtimeDocument.visibilityState === 'visible') _kickSync('visibilitychange');
    });
  }

  if (runtimeWindow) {
    // pageshow fires when the tab is restored from bfcache or rehydrated.
    runtimeWindow.addEventListener('pageshow', (e) => {
      if (e.persisted) _kickSync('pageshow-persisted');
    });

    runtimeWindow.addEventListener('online', () => {
      _kickSync('online');
      if (!_lastNetState) {
        _lastNetState = true;
        _notify('Back online — syncing your changes.', 'success', 3000);
      }
    });

    runtimeWindow.addEventListener('offline', () => {
      _lastNetState = false;
      _notify('Offline — changes are saved locally and will sync when you reconnect.', 'info', 5000);
    });
  }
}
