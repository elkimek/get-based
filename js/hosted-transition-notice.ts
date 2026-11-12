import {getHostedTransition} from '../shared/hosted-transition.js';
import {renderHTML} from './components/HostedTransitionBanner.svelte.html.js';
import {openMigrationRecovery} from './migration-navigation.js';
import {showConfirmDialog, showNotification} from './utils.js';
const SEEN = 'labcharts-hosted-transition-seen';
function migrate() {void openMigrationRecovery().catch(error => showNotification(error instanceof Error ? error.message : 'Migration could not start. Keep this window open and retry.', 'error', 12000));}
export function showHostedTransitionNotice(): Promise<void> | null {
  const transition = getHostedTransition(location.origin);
  if (!transition || transition.phase !== 'notice' || document.getElementById('hosted-transition-banner')) return null;
  const date = new Date(transition.cutoffAt).toLocaleString(undefined, {dateStyle: 'long', timeStyle: 'short'});
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/css/hosted-transition.css'; document.head.appendChild(style);
  const host = document.createElement('div');
  host.innerHTML = renderHTML({date, cutoff: new Date(transition.cutoffAt).toISOString(), announcementUrl: transition.announcementUrl});
  const banner = host.firstElementChild; if (!banner) return null;
  document.body.prepend(banner); banner.querySelector('button')?.addEventListener('click', migrate);
  if (localStorage.getItem(SEEN) === String(transition.announcedAt)) return null;
  const message = 'getbased is moving to self-hosting. You can use this hosted app for personal records until ' + date
    + '. After that, this address will stay available for recovery. Download a migration file, restore it at your own address and check your records before clearing anything here. The official encrypted Sync relay remains available during migration.';
  return showConfirmDialog(message, {ariaLabel: 'Hosted app is moving to self-hosting', confirmLabel: 'Start migration', cancelLabel: 'Continue for now', tone: 'primary'})
    .then(start => {localStorage.setItem(SEEN, String(transition.announcedAt)); if (start) migrate();})
    .catch(() => showNotification('The hosted transition notice is available in the banner. Your saved data is unchanged.', 'error'));
}
