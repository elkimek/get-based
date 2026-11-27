// Gate full initialization before evaluating any profile or integration owner.
import {getHostedTransition} from '../shared/hosted-transition.js';

const APP_KEY_PREFIX = /^(?:labcharts-|getbased-)/;
const APP_DB_PREFIX = /^(?:labcharts-|getbased-|evolu)/i;

async function hasExistingBrowserRecords(): Promise<boolean> {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.length !== 'number' || typeof localStorage.key !== 'function') {
      return true;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && APP_KEY_PREFIX.test(key)) return true;
    }
  } catch {
    return true;
  }
  try {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return true;
    const dbs = await indexedDB.databases();
    if (dbs.some(db => typeof db.name === 'string' && APP_DB_PREFIX.test(db.name))) return true;
  } catch {
    return true;
  }
  return false;
}

const transition = getHostedTransition(location.origin);
const recover = !!localStorage.getItem('labcharts-migration-pending') || transition?.phase === 'recovery';
if (recover) location.replace('/app/migration.html');

export const initialization: Promise<unknown> = recover
  ? Promise.resolve()
  : (transition?.phase === 'notice' && transition.demoUrl
      ? hasExistingBrowserRecords().then(hasData => {
          if (!hasData) {
            location.replace(transition.demoUrl!);
            return;
          }
          return import('./main-runtime.js');
        })
      : import('./main-runtime.js'));
