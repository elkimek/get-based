// sync-recovery.js - resume and network recovery hooks for sync.

let _isSyncEnabled = () => false;
let _isEvoluReady = () => false;
let _pushCurrentProfile = async () => {};
let _forcePull = () => {};
let _debug = () => {};
let _notify = () => {};
let _eventsBound = false;
let _lastVisibleSyncAt = 0;
let _lastNetState = true;

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

export function bindSyncRecoveryEvents() {
  if (_eventsBound) return;
  _eventsBound = true;

  if (typeof navigator !== 'undefined') {
    _lastNetState = navigator.onLine ?? true;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') _kickSync('visibilitychange');
    });
  }

  if (typeof window !== 'undefined') {
    // pageshow fires when the tab is restored from bfcache or rehydrated.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) _kickSync('pageshow-persisted');
    });

    window.addEventListener('online', () => {
      _kickSync('online');
      if (!_lastNetState) {
        _lastNetState = true;
        _notify('Back online — syncing your changes.', 'success', 3000);
      }
    });

    window.addEventListener('offline', () => {
      _lastNetState = false;
      _notify('Offline — changes are saved locally and will sync when you reconnect.', 'info', 5000);
    });
  }
}
