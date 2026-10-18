import fs from 'node:fs';
import crypto from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';

const fixtureBytes = fs.readFileSync('tests/fixtures/display-prepilot-native.json');
const native = JSON.parse(fixtureBytes.toString('utf8')) as { revision: string; styles: { path: string; source: string }[] };
// Native stylesheet rules and explicit inline variants at f0d4eb8f. These are
// focused control probes; the unchanged owner suites cover complete state/DOM.
const extraBytes = fs.readFileSync('tests/fixtures/settings-density-native-extra.json');
const extra = JSON.parse(extraBytes.toString('utf8')) as { ppqDynamicStyles: string; sources: { path: string; sha256: string; source: string }[] };
const cases = [
  ['cli-action', '#cli [data-settings-action="rescan-cli-agents"]', '<button class="import-btn settings-mini-btn">Check connection</button>'],
  ['wearable-action', '#wearables-section [data-wearable-settings-action="sync-now"]', '<button class="wearable-action">Update now</button>'],
  ['wearable-connect', '#wearables-section [data-wearable-settings-action="connect"]', '<button class="wearable-action-row-btn">Connect</button>'],
  ['meal-select', '#nutrition-ai-model-settings select', '<select class="api-key-input"><option>Model</option></select>'],
  ['credential', '#ppq #save-ppq-key-btn', '<button class="import-btn import-btn-primary">Save &amp; Validate</button>'],
  ['credential-input', '#ppq #ppq-key-input', '<input class="api-key-input" value="synthetic" style="margin-top:0">'],
  ['ppq-mini', '#ppq #ppq-topup-toggle', '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px">Top Up</button>'],
  ['ppq-amount', '#ppq [data-provider-panel-action="ppq-topup-preset"]', '<button class="ppq-amt-btn">$5</button>'],
  ['ppq-method', '#ppq .ppq-method-btn', '<button class="ppq-method-btn">Method</button>'],
  ['backup-default', '#backup [data-crypto-action="export-backup"]', '<button class="import-btn import-btn-primary">Download Backup</button>'],
  ['backup-restore', '#backup [data-crypto-action="restore-auto-backup"]', '<button class="import-btn import-btn-secondary" style="font-size:12px;padding:4px 10px">Restore</button>'],
  ['catalog-manual', '#openrouter #openrouter-custom-model', '<input class="api-key-input" style="font-size:11px;padding:6px 10px;margin-top:0" value="synthetic">'],
  ['wallet-funding', '#funding [data-routstr-wallet-action="fund-wallet-preset"]', '<div class="routstr-wallet-card"><button class="import-btn import-btn-secondary">Preset</button></div>'],
  ['wallet-withdraw', '#withdraw button', '<div class="routstr-wallet-card"><button class="import-btn import-btn-secondary">Withdraw</button></div>'],
  ['wallet-seed', '#seed #wallet-seed-display', '<button style="font-family:monospace;font-size:12px;font-weight:400;line-height:normal;padding:10px;border:1px solid var(--border);border-radius:6px">Synthetic words</button>'],
  ['wallet-node', '#node [data-routstr-wallet-action="connect-node"]', '<div class="routstr-wallet-card"><button class="import-btn import-btn-primary">Connect</button></div>'],
  ['wallet-export', '#export button', '<div class="routstr-wallet-card"><button class="import-btn import-btn-secondary">Copy</button></div>'],
  ['wallet-mint', '#mint [data-routstr-wallet-action="set-mint-input"]', '<div class="routstr-wallet-card"><button class="routstr-mint-row">Mint</button></div>'],
  ['wallet-rail', '#routstr [data-wallet-action="deposit"]', '<div class="routstr-wallet-card"><button class="import-btn import-btn-primary">Deposit</button></div>'],
  ['sync-management', '#sync [data-sync-action="pause-sync"]', '<div class="sync-management-actions"><button class="import-btn import-btn-secondary">Pause</button></div>'],
  ['sync-identity', '#sync #sync-identity-copy', '<button class="import-btn import-btn-secondary sync-identity-copy">Copy</button>'],
  ['sync-mnemonic', '#sync #sync-mnemonic-toggle', '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 10px">Show</button>'],
  ['sync-diagnose', '#sync [data-sync-action="show-sync-diagnose"]', '<button class="import-btn import-btn-secondary" style="font-size:12px;padding:7px 14px">Sync status</button>'],
  ['sync-relay-save', '#sync [data-sync-action="save-relay"]', '<button class="import-btn import-btn-secondary" style="font-size:12px;padding:4px 12px">Save</button>'],
  ['sync-disconnect', '#sync [data-sync-action="disconnect-sync"]', '<button class="import-btn import-btn-secondary sync-disable-btn" style="font-size:12px;padding:5px 14px">Disconnect</button>'],
] as const;
const properties = ['font-family', 'font-size', 'font-weight', 'line-height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
async function mountProbe(page: Page, reference: boolean) {
  const route = '/settings-density-' + (reference ? 'reference' : 'current');
  const styles = reference ? native.styles.map(sheet => `<style>${sheet.source}</style>`).join('') + `<style>${extra.ppqDynamicStyles}</style><style>${extra.sources[1]!.source}</style>` : native.styles.map(sheet => `<link rel="stylesheet" href="/${sheet.path}">`).join('') + '<link rel="stylesheet" href="/css/wearables.css">';
  await routeHtml(page, '**' + route, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/vendor/fonts/fonts.css">${styles}</head><body><main class="settings-modal" id="settings-modal"></main></body></html>`);
  await page.goto(route);
  await page.evaluate(async () => { await Promise.all([...document.fonts].map(face => face.load())); });
  if (reference) {
    await page.locator('main').evaluate((host, cases) => { host.innerHTML = cases.map(([id, , html]) => `<section data-probe="${id}">${html}</section>`).join(''); }, cases);
  } else await page.evaluate(async () => {
    const host = (id: string) => { const node = document.createElement('section'); node.id = id; document.querySelector('main')!.append(node); return node; };
    const noop = () => {};
    const models = { selectedModel: 'a', modelDisplay: 'A', groups: [{ label: '', options: [{ value: 'a', label: 'A' }] }], pricing: { text: 'Free', tone: 'secondary' as const } };
    const { initialRoutstrSettingsState } = await import('/js/routstr-settings-contract.js');
    (await import('/js/routstr-settings-component.js')).mountRoutstrSettings(host('routstr'), initialRoutstrSettingsState('https://node.synthetic.test', true), { wallet: noop, node: noop, mints: noop, refreshWallet: noop, refreshNode: noop, refunds: noop, copyRecovery: noop, reclaimRecovery: noop }, { node: '', key: '' });
    const ppq = (await import('/js/ppq-settings-component.js')).mountPpqSettings(host('ppq'), { connected: true, models, mode: { enabled: false, available: true, active: false } }); ppq.setTopup({ ...ppq.getTopup(), open: true });
    const backup = host('backup'); backup.innerHTML = '<div data-backup-settings-root></div>';
    const protection = await import('/js/settings-protection-component.js'); protection.refreshBackupSettings({ encrypted: false, autoStatus: 'Ready', folder: { supported: false, folderName: null, permissionLost: false, lastBackupLabel: '' } }); protection.getBackupSettingsView()!.setSnapshots([{ id: 'synthetic', dateLabel: 'Today', profileCount: '1', encrypted: false }]); protection.getBackupSettingsView()!.toggleSnapshots();
    (await import('/js/openrouter-settings-component.js')).mountOpenRouterSettings(host('openrouter'), { connected: true, models });
    (await import('/js/wallet-funding-component.js')).mountWalletFunding(host('funding'), 0.03, { submitCustom: noop, cancelCustom: noop });
    const withdraw = (await import('/js/wallet-withdraw-component.js')).mountWalletWithdraw(host('withdraw'), { lightning: noop, token: noop, maximum: noop, quote: noop, execute: noop, send: noop, copy: noop, recover: noop, reclaim: noop, close: noop });
    withdraw.setState({ ...withdraw.getState(), pending: false });
    const seed = (await import('/js/wallet-seed-component.js')).mountWalletSeed(host('seed'), { copy: noop, create: noop, restore: noop, continue: noop });
    seed.setState({ ...seed.getState(), mode: 'manage', pending: false }); seed.setMnemonic('synthetic words');
    const node = (await import('/js/wallet-node-component.js')).mountWalletNode(host('node'), { connect: noop, refresh: noop, chooseMint: noop, deposit: noop, newSession: noop, retry: noop, copy: noop, reclaim: noop, close: noop }, 'browse');
    node.setState({ ...node.getState(), pending: false, phase: 'ready', nodes: [{ url: 'https://node.synthetic.test', name: 'Synthetic', operator: 'Synthetic', models: 1, tor: false, privateTee: false }] });
    const mint = (await import('/js/wallet-mint-component.js')).mountWalletMint(host('mint'), { save: noop, cancel: noop, reload: noop });
    mint.setState({ ...mint.getState(), mint: 'https://mint.synthetic.test', loading: false, saved: [{ mint: 'https://mint.synthetic.test', balance: 1 }] });
    const exporter = (await import('/js/wallet-export-component.js')).mountWalletExport(host('export'), { prepare: noop, copy: noop, close: noop }); exporter.setState({ ...exporter.getState(), pending: false });
    const { buildCliAgentSettingsSnapshot } = await import('/js/cli-agent-settings-presentation.js');
    const { normalizeDiscoveredAgent } = await import('/js/agent-host-discovery.js');
    const agent = normalizeDiscoveredAgent({ id: 'codex', name: 'Codex CLI', compatible: true, version: '0.150.1', description: 'Synthetic', status: 'available', endpoint: 'http://127.0.0.1:8325', token: '', controlAuthorized: true, capabilities: ['companion-control'], runtimeMode: 'installed', companionVersion: '1.2.0', paused: false });
    (await import('/js/cli-agent-settings-component.js')).mountCliAgentSettings(host('cli'), buildCliAgentSettingsSnapshot([agent], { selectedAgent: 'codex', backend: 'codex', collapsed: new Set(), platform: 'linux', origin: location.origin, theme: 'dark' }), { scan: noop, platform: noop, copy: noop, login: noop, test: noop, toggle: noop, disclose: noop, control: noop });
    (await import('/js/wearables-settings-component.js')).mountWearablesSettings(host('wearables-section'), { profileId: 'synthetic', stripHidden: false, groups: [{ id: 'synthetic', title: 'Synthetic', hint: '', rows: [{ id: 'synthetic', name: 'Synthetic', connected: true, wordmark: false, status: 'Connected', updated: '', tone: 'secondary', detail: 'manual', startOpen: true, identity: '', meta: '', notices: [], explanation: '', actions: [{ action: 'sync-now', label: 'Update now' }] }, { id: 'connect', name: 'Connect', connected: false, wordmark: false, status: 'Not connected', updated: '', tone: 'secondary', detail: 'none', startOpen: false, identity: '', meta: '', notices: [], explanation: '', actions: [], primaryAction: { action: 'connect', label: 'Connect' } }] }] });
    (await import('/js/nutrition-ai-settings-component.js')).mountNutritionAISettings(host('meal'), { selectedValue: '', automaticLabel: 'Automatic', automaticDisabled: false, providerDisplay: 'Local', groups: [] });
    const syncHost = host('sync'); syncHost.id = 'sync-section'; const syncRoot = document.createElement('div'); syncRoot.id = 'sync'; syncHost.append(syncRoot);
    (await import('/js/settings-sync-component.js')).mountSyncSettings(syncRoot, { enabled: true, configured: true, paused: false, blocker: null, relay: 'wss://synthetic.test', deletions: [] });
    document.querySelector<HTMLDetailsElement>('#sync details')!.open = true;
  });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {}))); });
}
async function receipt(page: Page, reference: boolean) {
  return page.evaluate(({ cases, properties, reference }) => cases.map(([name, selector]) => {
    const element = document.querySelector<HTMLElement>(reference ? `[data-probe="${name}"] :is(button,input,select)` : selector);
    if (!element) throw new Error('Missing exact density probe: ' + name + ' ' + selector);
    const style = getComputedStyle(element);
    return { name, styles: Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)])) };
  }), { cases, properties, reference });
}

test('actual Settings and wallet controls preserve native desktop typography and contextual padding across six themes', async ({ browser }) => {
  test.setTimeout(90_000);
  expect(crypto.createHash('sha256').update(fixtureBytes).digest('hex')).toBe('c988381710d932dcba7c3470ade761ac1712423b84717dcd629ea94d51be9cdb');
  expect(native.revision).toBe('f0d4eb8f');
  expect(crypto.createHash('sha256').update(extraBytes).digest('hex')).toBe('d0103f6afd4155b8c7683afc507080ad1bd06fafad7f80e083f5252b3bc880af');
  for (const source of extra.sources) expect(crypto.createHash('sha256').update(source.source).digest('hex')).toBe(source.sha256);
  expect(extra.sources[0]!.source).toContain('style.textContent = `' + extra.ppqDynamicStyles + '`;');
  const context = await browser.newContext({ hasTouch: false, viewport: { width: 1280, height: 900 } });
  const reference = await context.newPage(), current = await context.newPage();
  try {
    await mountProbe(reference, true); await mountProbe(current, false);
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      for (const page of [reference, current]) await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const width of [1280, 390]) {
        for (const page of [reference, current]) await page.setViewportSize({ width, height: 900 });
        const expected = await receipt(reference, true), actual = await receipt(current, false);
        await test.info().attach(`${theme}-${width}`, { body: JSON.stringify({ actual, expected }), contentType: 'application/json' });
        expect(actual, `${theme}/${width}`).toEqual(expected);
      }
    }
    const pristine = await receipt(current, false);
    await current.locator('#sync-identity-copy').evaluate(button => { button.style.padding = '20px'; });
    expect(await receipt(current, false)).not.toEqual(pristine);
    await current.locator('#sync-identity-copy').evaluate(button => { button.style.removeProperty('padding'); });
    expect(await receipt(current, false)).toEqual(pristine);
    await expect(current.locator('.local-agent-toggle')).toHaveCSS('width', '32px');
    await expect(current.locator('.local-agent-toggle')).toHaveCSS('height', '28px');
    expect(await current.locator('#mint [data-routstr-wallet-action="set-mint-input"]').evaluate(button => button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  } finally { await context.close(); }
});

test('the same corrected controls retain44px coarse targets and private state ownership', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  try {
    await mountProbe(page, false);
    expect(await page.evaluate(() => matchMedia('(pointer:coarse)').matches)).toBe(true);
    for (const [, selector] of cases) {
      const control = page.locator(selector).first();
      expect(await control.evaluate(element => element.getBoundingClientRect().height), selector).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator('.local-agent-toggle').evaluate(label => label.getBoundingClientRect().height)).toBe(44);
    const input = page.locator('#ppq-key-input'); await input.fill('PRIVATE SYNTHETIC'); await input.focus();
    await page.evaluate(async () => { (await import('/js/ppq-settings-component.js')).getPpqSettingsView()!.setBalance({ text: 'Updated', tone: 'secondary' }); });
    await expect(input).toHaveValue('PRIVATE SYNTHETIC'); await expect(input).toBeFocused();
    await page.evaluate(async () => { const held = document.getElementById('ppq-key-input') as HTMLInputElement; (await import('/js/ppq-settings-component.js')).disposePpqSettings(); if (held.value) throw new Error('Private key retained'); });
  } finally { await context.close(); }
});
