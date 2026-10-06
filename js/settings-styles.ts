const SETTINGS_STYLESHEET_URL = new URL('../css/settings.css', import.meta.url).href;
let _settingsStylesheetLoad: Promise<HTMLLinkElement> | null = null;
let _useSettingsStylesheetRetryUrl = false;

function settingsStylesheetUrl() {
  if (!_useSettingsStylesheetRetryUrl) return SETTINGS_STYLESHEET_URL;
  const retryUrl = new URL(SETTINGS_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

/** @returns {Promise<HTMLLinkElement>} */
export function loadSettingsStylesheet(): Promise<HTMLLinkElement> {
  if (!_settingsStylesheetLoad) {
    _settingsStylesheetLoad = new Promise<HTMLLinkElement>((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('Settings stylesheet requires a document'));
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = settingsStylesheetUrl();
      link.dataset.settingsStylesheet = '';
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => {
        link.remove();
        reject(new Error('Settings stylesheet could not be loaded'));
      }, { once: true });
      const anchor = document.querySelector('[data-settings-stylesheet-anchor]');
      (anchor?.parentNode || document.head).insertBefore(link, anchor || null);
    }).catch(err => {
      _settingsStylesheetLoad = null;
      _useSettingsStylesheetRetryUrl = true;
      throw err;
    });
  }
  return _settingsStylesheetLoad;
}
