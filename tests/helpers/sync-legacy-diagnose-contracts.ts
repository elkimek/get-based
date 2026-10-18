import {JSDOM} from 'jsdom';
import {renderSyncDiagnoseModal, syncDiagnoseActionAttrs} from '../../js/sync-diagnose-render.js';
import {diagnosticCases} from './sync-diagnose-fixtures.js';

type DiagnoseRenderer = typeof renderSyncDiagnoseModal;
/** Exercise the current authored owner with independent literal UI expectations.
 * These receipts supplement the legacy source-ownership checks; actual HTML is
 * parsed unchanged, and the historical exact presentation suite stays separate. */
export function syncLegacyDiagnoseContracts(render: DiagnoseRenderer = renderSyncDiagnoseModal) {
  const cases = diagnosticCases();
  function fragment(name: string) {
    const witness = cases.find(item => item.name === name);
    if (!witness) throw new Error(`Missing Sync Diagnose witness: ${name}`);
    return JSDOM.fragment(render(witness.input));
  }
  const healthy = fragment('healthy'), storage = fragment('quota-red');
  const rows = fragment('row-formats'), blocked = fragment('debug-blocked');
  const ready = fragment('debug-ready'), enabled = fragment('debug-enabled');
  const hostile = fragment('hostile-escaped-metadata');
  const action = (root: DocumentFragment, name: string) =>
    root.querySelector<HTMLButtonElement>(`button[data-sync-diagnose-action="${name}"]`);
  const compact = action(storage, 'compact-relay'), refresh = action(storage, 'refresh-relay-storage');
  const summary = healthy.querySelector('.sync-diagnose-summary');
  const technical = healthy.querySelector<HTMLDetailsElement>('.sync-diagnose-technical');
  const blockedEnable = [...blocked.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Enable');
  const readyEnable = action(ready, 'enable-phase2'), enabledDisable = action(enabled, 'disable-phase2');
  const fact = (label: string) => [...hostile.querySelectorAll('.sync-diagnose-facts > div')]
    .find(row => row.firstElementChild?.textContent === label)?.querySelector('code')?.textContent;
  const actionProbe = 'copy" onmouseover="synthetic';
  const attrProbe = JSDOM.fragment(`<button ${syncDiagnoseActionAttrs(actionProbe)}></button>`).firstElementChild;
  return {
    panels: healthy.querySelector('.sync-diagnose-health-card .sync-diagnose-card-title')?.textContent === 'Verified'
      && storage.querySelector('.sync-diagnose-storage-card [role="progressbar"]')?.getAttribute('aria-valuenow') === '95'
      && blocked.textContent?.includes('Push efficiency') === true
      && blocked.querySelector('[data-sync-diagnose-action="reset-delta-telemetry"]') !== null,
    hostile: hostile.querySelector('[data-probe], img, svg, script, [onmouseover]') === null
      && fact('Owner ID') === '<img data-probe="owner">'
      && fact('Active profile') === '<svg data-probe="profile">'
      && fact('Relay') === '"<&\''
      && hostile.querySelector('.sync-diagnose-row-details tbody tr td')?.textContent === '<b data-probe="row">'
      && attrProbe?.attributes.length === 1
      && attrProbe.getAttribute('data-sync-diagnose-action') === actionProbe,
    tombstones: JSON.stringify([...rows.querySelectorAll('.sync-diagnose-row-details thead th')].map(cell => cell.textContent))
        === JSON.stringify(['profileId', 'deleted', 'syncedAt (ms)', 'sun', 'dev', 'size', 'format'])
      && JSON.stringify([...rows.querySelectorAll('.sync-diagnose-row-details tbody tr')].map(row => row.children[1]?.textContent))
        === JSON.stringify(['no', 'yes', 'no']),
    compact: compact?.textContent === 'Reduce storage…' && !compact.disabled,
    refresh: refresh?.textContent === 'Refresh usage' && !refresh.disabled,
    summary: summary?.querySelector('h4')?.textContent === 'Sync looks healthy'
      && healthy.querySelector('.sync-diagnose-device-title')?.textContent === 'Compare the Sync identity code first'
      && technical !== null && !technical.open && !technical.hasAttribute('open')
      && summary !== null && (summary.compareDocumentPosition(technical) & 4) === 4,
    storageCopy: storage.querySelector('.sync-diagnose-summary p')?.textContent
      === 'Choose Reduce storage soon so there is room for future changes.',
    cutoverBreakdown: [...blocked.querySelectorAll('b')].some(element => element.textContent === 'Lean sync mode')
      && blocked.textContent?.includes("These bits of data haven't been re-pushed yet:") === true
      && [...blocked.querySelectorAll('table tr')].some(row => JSON.stringify([...row.children].map(cell => cell.textContent))
        === JSON.stringify(['entries', 'array', 'local=2 rows=0']))
      && action(blocked, 'backfill-blockers')?.textContent === 'Push now',
    cutoverGating: blockedEnable?.disabled === true && blockedEnable.hasAttribute('disabled')
      && !blockedEnable.hasAttribute('data-sync-diagnose-action') && action(blocked, 'enable-phase2') === null
      && readyEnable?.textContent === 'Enable' && !readyEnable.disabled && !readyEnable.hasAttribute('disabled'),
    cutoverEnabled: [...enabled.querySelectorAll('b')].some(element => element.textContent === 'Lean sync mode'
        && element.parentElement?.querySelector('span')?.textContent === 'ON')
      && enabledDisable?.textContent === 'Disable' && !enabledDisable.disabled
      && action(enabled, 'enable-phase2') === null
      && ![blocked, ready].some(root => [...root.querySelectorAll('span')].some(element => element.textContent === 'ON')),
  };
}
