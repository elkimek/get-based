// Gate full initialization before evaluating any profile or integration owner.
import {getHostedTransition} from '../shared/hosted-transition.js';

const APP_KEY_PREFIX = /^(?:labcharts-|getbased-)/;
const APP_DB_PREFIX = /^(?:labcharts-|getbased-|evolu)/i;
const HOSTED_DEMO_SESSION_KEY = 'getbased-hosted-demo-session';
const SENSITIVE_KEY_PATTERN = /(?:^labcharts-sync-|^getbased-profile-shares-|^labcharts-backup-restore-|-key$|-token$|-mnemonic$)/;

async function hasExistingPersonalRecords(): Promise<boolean> {
  let demoSession = false;
  const demoProfileIds = new Set<string>();
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.length !== 'number' || typeof localStorage.key !== 'function') {
      return true;
    }
    demoSession = localStorage.getItem(HOSTED_DEMO_SESSION_KEY) === '1';
    if (localStorage.getItem('labcharts-encryption-enabled') === 'true' || localStorage.getItem('labcharts-sync-enabled') === 'true') {
      return true;
    }
    const appKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && APP_KEY_PREFIX.test(key)) appKeys.push(key);
    }
    if (appKeys.length > 0) {
      if (!demoSession) return true;
      if (localStorage.getItem('labcharts-imported') || localStorage.getItem('labcharts-default-imported')) return true;
      const rawProfiles = localStorage.getItem('labcharts-profiles');
      if (rawProfiles) {
        const parsed: unknown = JSON.parse(rawProfiles);
        if (!Array.isArray(parsed)) return true;
        for (const profile of parsed) {
          if (!profile || typeof profile !== 'object' || typeof (profile as {id?: unknown}).id !== 'string') return true;
          const id = (profile as {id: string}).id;
          const tags = (profile as {tags?: unknown}).tags;
          const isDemo = Array.isArray(tags) && tags.includes('demo');
          if (!isDemo && id !== 'default') return true;
          demoProfileIds.add(id);
        }
      }
      for (const key of appKeys) {
        if (SENSITIVE_KEY_PATTERN.test(key)) return true;
      }
    }
  } catch {
    return true;
  }
  try {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return true;
    const dbs = await indexedDB.databases();
    const appDbs = dbs.filter(db => typeof db.name === 'string' && APP_DB_PREFIX.test(db.name));
    if (appDbs.length > 0) {
      if (!demoSession) return true;
      const isDemoDb = (name: string) => {
        if (name === 'labcharts-blobs' || name === 'labcharts-backups' || name === 'labcharts-wearables-credential-vault') return true;
        const allowedIds = new Set([...demoProfileIds, 'default']);
        for (const id of allowedIds) {
          if (name === `labcharts-wearables-${id}` || name === `labcharts-cycle-${id}` || name === `getbased-nutrition-${id}`) return true;
        }
        return false;
      };
      if (!appDbs.every(db => isDemoDb(db.name!))) return true;
    }
  } catch {
    return true;
  }
  return false;
}

function activateInPlaceHostedDemo(): void {
  try { localStorage.setItem(HOSTED_DEMO_SESSION_KEY, '1'); } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    if (document.documentElement?.dataset) document.documentElement.dataset.publicDemo = 'true';
    document.getElementById('legal-consent-overlay')?.remove();
    document.body?.classList?.remove('legal-consent-visible');
  }
}

const transition = getHostedTransition(location.origin);
const migrationPending = !!localStorage.getItem('labcharts-migration-pending');
if (migrationPending) location.replace('/app/migration.html');

export const initialization: Promise<unknown> = migrationPending
  ? Promise.resolve()
  : (transition
      ? hasExistingPersonalRecords().then(hasPersonalData => {
          if (!hasPersonalData) {
            activateInPlaceHostedDemo();
            return import('./main-runtime.js');
          }
          if (transition.phase === 'recovery') {
            location.replace('/app/migration.html');
            return;
          }
          return import('./main-runtime.js');
        })
      : import('./main-runtime.js'));
