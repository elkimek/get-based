import type { WearableAdapter } from './wearable-adapters.js';
import type { WearableConnection } from './wearable-persistence-types.js';
import type { WearablesAction, WearablesRow, WearablesSettingsSnapshot } from './wearables-settings-contract.js';
import { adapterById, visibleAdapters, getOAuthClientId, isOAuthAdapterConfigured, isWearableRelayUnavailable } from './wearable-adapters.js';
import { brandAsset } from './brand-assets.js';
import { groupWearableAdapters } from './wearables-settings-groups.js';
import { listConnectedSources, getConnection } from './wearables-connect.js';
import { SELF_HOSTED_WEARABLE_MESSAGE } from './url-safety.js';
export function formatWearableUpdated(ts: unknown): string {
  if (!ts) return 'Not synced yet';
  const mins = Math.max(0, Math.round((Date.now() - Number(ts)) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24); return `${days} day${days === 1 ? '' : 's'} ago`;
}
function action(action: WearablesAction['action'], label: string, adapter?: string, tone: WearablesAction['tone'] = 'primary'): WearablesAction {
  return { action, label, adapter, tone };
}
function row(adapter: WearableAdapter, connected: boolean): WearablesRow {
  const conn = connected ? getConnection(adapter.id) : null;
  const asset = brandAsset(adapter.id);
  const unavailable = isWearableRelayUnavailable(adapter) || (adapter.hostConfiguredOnly && !isOAuthAdapterConfigured(adapter));
  const pending = adapter.authType === 'oauth2' && !unavailable && (getOAuthClientId(adapter) || '').startsWith('REPLACE_WITH_');
  const apple = adapter.authType === 'file-import' && adapter.id === 'apple_health';
  const result: WearablesRow = {
    id: adapter.id, name: adapter.displayName, connected, wordmark: ['oura','ultrahuman','withings'].includes(adapter.id),
    iconLight: asset?.iconLight, iconDark: asset?.iconDark, mono: asset?.mono,
    status: '', updated: '', tone: 'secondary', detail: 'none', startOpen: apple && !conn,
    identity: '', meta: '', notices: [], explanation: '', actions: [],
  };
  if (connected && adapter.legacyMigrationOnly) { result.status = 'Move this connection'; result.tone = 'danger'; }
  else if (connected && unavailable) { result.status = 'Sync paused'; result.tone = 'danger'; }
  else if (unavailable) result.status = adapter.experimentalSelfHost ? 'Set up on your server' : 'Available when self-hosted';
  else if (connected && conn?.needsReauth) { result.status = 'Reconnect to resume'; result.tone = 'danger'; }
  else if (connected) {
    result.status = 'Connected'; result.tone = 'success';
    result.updated = conn?.lastSyncAt ? `Updated ${formatWearableUpdated(conn.lastSyncAt).toLowerCase()}` : 'Waiting for first update';
  } else if (pending) result.status = 'Not available yet';
  else if (adapter.experimentalSelfHost) result.status = 'Available when self-hosted';
  else if (adapter.integrationKind === 'aggregator') result.status = 'Connect through Google Health';
  else if (apple) result.status = 'Import from a file';
  if (!(conn && adapter.legacyMigrationOnly) && !unavailable && !(conn && !conn.needsReauth) && !pending) {
    result.primaryAction = conn?.needsReauth
      ? { ...action('connect','Reconnect',adapter.id), ariaLabel: `Reconnect ${adapter.displayName}` }
      : apple ? action('pick-apple-health-file','Import')
      : adapter.authType === 'oauth2' ? { ...action('connect','Connect',adapter.id), ariaLabel: `Connect ${adapter.displayName}` } : undefined;
  }
  const acct = (conn?.account || {}) as Record<string, unknown>;
  const migrationNotice = adapter.legacyMigrationOnly ? adapter.deprecationNotice || 'This connection must be migrated.' : '';
  const replacement = adapterById(adapter.replacementAdapterId || 'google_health');
  if (conn && adapter.legacyMigrationOnly) {
    result.detail = 'legacy'; result.identity = String(acct.email || acct.identity || 'Legacy Fitbit account'); result.notices = [migrationNotice];
    if (isOAuthAdapterConfigured(replacement)) result.actions.push(action('connect','Connect Google Health',replacement!.id));
    else {
      result.explanation = 'Google Health connection is self-host only on this deployment. Configure your own Google Cloud OAuth project to migrate.';
      result.docsUrl = replacement?.authDocsUrl; result.docsLabel = 'Setup docs';
    }
    result.actions.push(action('disconnect','Disconnect legacy Fitbit',adapter.id,'danger'));
  } else if (conn && unavailable) {
    result.detail = 'unavailable'; result.identity = String(acct.identity || acct.email || `${adapter.displayName} account`);
    if (adapter.privacyNotice) result.notices.push(adapter.privacyNotice);
    result.explanation = `This deployment no longer provides ${adapter.displayName} access. Automatic and manual sync are paused. You can remove this device's stored connection below.`;
    result.manageAccessUrl = adapter.manageAccessUrl;
    result.actions.push(action('disconnect','Disconnect',adapter.id,'danger'));
  } else if (conn && !conn.needsReauth && adapter.authType === 'oauth2') {
    result.detail = 'oauth';
    result.identity = String(acct.identity || acct.email || [acct.firstName,acct.lastName].filter(Boolean).join(' ').trim() || (acct.userId ? `User ${acct.userId}` : '') || (acct['polar-user-id'] ? `User ${acct['polar-user-id']}` : '') || 'Connected account');
    result.meta = conn.lastSyncAt ? `Last updated ${formatWearableUpdated(conn.lastSyncAt).toLowerCase()}` : 'Waiting for the first update';
    if (migrationNotice) result.notices.push(migrationNotice);
    if (adapter.replacementAdapterId && replacement && isOAuthAdapterConfigured(replacement)) result.actions.push(action('connect','Connect Google Health',replacement.id));
    result.actions.push({ ...action('sync-now','Update now',adapter.id), ariaLabel:`Update ${adapter.displayName} now`, title:'Checks the last 7 days, including today, for new or changed readings.', hint:'checks the last 7 days' },
      { ...action('backfill','Import last 90 days',adapter.id,'secondary'), title:'Imports the last 90 days again to recover any missing readings. This can take a little longer.', hint:'fills missing days' },
      action('disconnect','Disconnect and remove data',adapter.id,'danger'));
  } else if (apple) {
    result.detail = 'apple';
    if (conn) {
      result.identity = `Imported from ${conn.fileName || 'export'}`;
      result.meta = `Last import: ${formatWearableUpdated(conn.lastSyncAt)} · ${conn.coverageDays ?? '?'} days`;
      result.actions.push(action('pick-apple-health-file','Re-import new export'),action('disconnect','Remove data',adapter.id,'danger'));
    }
  } else if (unavailable || pending) {
    result.detail = 'setup'; result.docsUrl = unavailable ? adapter.selfHostDocsUrl || adapter.authDocsUrl : adapter.authDocsUrl;
    result.docsLabel = unavailable ? 'Setup docs' : 'docs';
    result.explanation = unavailable
      ? isWearableRelayUnavailable(adapter) ? `${SELF_HOSTED_WEARABLE_MESSAGE} ${adapter.displayName} remains available when you run getbased on infrastructure you control.`
        : adapter.id === 'google_health' ? 'Google Health is not offered by this hosted deployment. Self-host getbased and configure your own Google Cloud OAuth client ID and secret to enable it.'
        : `${adapter.displayName} is an experimental self-host integration. Enable it with this deployment's own developer client ID and secret; it is hidden on unconfigured hosted deployments.`
      : adapter.id === 'google_health' ? 'Google Health requires this deployment to configure an approved OAuth client before Connect can be enabled.'
        : `${adapter.displayName} support is in progress — still waiting on partner credentials. Check back soon or watch the changelog.`;
  } else if (conn && adapter.authType === 'manual') {
    result.detail = 'manual'; result.identity = 'Entered manually on this device';
    result.explanation = 'Log, edit, or delete individual entries from the dashboard — tap any weight / BP / resting HR card to open its detail view.';
    result.actions.push(action('manual-dashboard','Open dashboard'),action('manual-disconnect','Delete all manual entries',undefined,'danger'));
  }
  return result;
}
export function buildWearablesSettingsSnapshot(profileId: string, stripHidden: boolean): WearablesSettingsSnapshot {
  const connected = listConnectedSources();
  const groups = groupWearableAdapters(visibleAdapters(Object.keys(connected)), connected, adapter => {
    const conn: WearableConnection | null = getConnection(adapter.id);
    return adapter.legacyMigrationOnly || conn?.needsReauth || isWearableRelayUnavailable(adapter) || (adapter.hostConfiguredOnly && !isOAuthAdapterConfigured(adapter));
  });
  return { profileId, stripHidden, groups: groups.map(group => ({ id: group.id, title: group.title, hint: group.hint, rows: group.items.map(adapter => row(adapter, !!connected[adapter.id])) })) };
}
