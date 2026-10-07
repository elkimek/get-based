import type { Page } from '@playwright/test';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const root = '[data-chat-optional-setup-view]';
async function setup(page: Page, connected = true) {
  await page.goto('/app');
  await page.evaluate(async connected => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    await (await import('/js/profile.js')).renameProfile(state.currentProfile, 'Ada');
    state.profileSex = 'female'; state.chatHistory = [];
    if (!connected) { localStorage.setItem('labcharts-ai-provider', 'custom'); localStorage.removeItem('labcharts-custom-url'); localStorage.removeItem('labcharts-custom-key'); }
    (await import('/js/chat-onboarding.js')).goToOnboardingStep(3);
  }, connected);
  await expect(page.locator(root)).toBeVisible();
}
test.beforeEach(async ({ context, page }) => { await installDiscussionFixture(context); await page.emulateMedia({ reducedMotion: 'reduce' }); });
for (const connected of [true, false]) test(`optional funnel preserves ${connected ? 'connected' : 'disconnected'} navigation and context continuation`, async ({ page }) => {
  await setup(page, connected);
  await expect(page.getByRole('group', { name: `Onboarding step ${connected ? '2 of 3' : '3 of 4'}: Add-ons` })).toBeVisible();
  await expect(page.locator(root)).toContainText(connected ? 'Great, we are connected.' : 'Nice. We can collect useful context first');
  await expect(page.locator('[data-chat-optional-task]')).toHaveCount(4);
  await expect(page.getByRole('link', { name: 'LivingDNA kit' })).toHaveAttribute('rel', 'noopener sponsored');
  await page.getByRole('button', { name: 'Continue to context cards', exact: true }).click();
  await expect(page.locator(root)).toHaveCount(0);
  await expect(page.getByRole('group', { name: `Onboarding step ${connected ? '3 of 3' : '4 of 4'}: Context` })).toBeVisible();
  await page.getByRole('button', { name: 'Back to previous onboarding step' }).click();
  await expect(page.locator(root)).toBeVisible();
});
test('repaint updates summary literals and actions without replacing stable controls or stealing focus', async ({ page }) => {
  await setup(page);
  await page.locator('[data-chat-empty-action="import-dna"]').focus();
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.supplements = [{ name: '<b>Iron</b>', dosage: '10 mg', startDate: '2000-01-01' }];
    state.importedData.genetics = { mtdna: { haplogroup: '<H1>' } };
    (await import('/js/chat-render.js')).renderChatMessages();
  });
  await expect(page.locator('[data-chat-empty-action="import-dna"]')).toBeFocused();
  await expect(page.locator('[data-chat-optional-task="supplements"]')).toContainText('<b>Iron</b> 10 mg');
  await expect(page.locator('[data-chat-optional-task="supplements"] b')).toHaveCount(0);
  await expect(page.locator('[data-chat-optional-task="genetics"]')).toContainText('mtDNA <H1>');
  await expect(page.getByRole('button', { name: 'Re-import mtDNA', exact: true })).toBeVisible();
  await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.profileSex = 'male'; state.importedData.wearableConnections = { fixture: { connectedSince: '2020-01-01' } }; (await import('/js/chat-render.js')).renderChatMessages(); });
  await expect(page.locator('[data-chat-optional-task]')).toHaveCount(2);
  await expect(page.locator('[data-chat-optional-task="cycle"]')).toHaveCount(0);
  await expect(page.locator('[data-chat-optional-task="wearables"]')).toHaveCount(0);
});
test('mtDNA entry opens a real file chooser, clears selection and allows the same file again', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const files: string[] = []; Object.assign(window, { optionalFiles: files });
    (await import('/js/dna-runtime-bridge.js')).configureDnaModuleBridge({ handleMtDNAFile: (file: File) => { files.push(file.name); } });
    (await import('/js/chat-empty-state.js')).configureChatEmptyStateDeps({ closeChatPanel() {} });
  });
  for (let index = 0; index < 2; index++) {
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import mtDNA', exact: true }).click();
    await (await choosing).setFiles({ name: 'livingdna.txt', mimeType: 'text/plain', buffer: Buffer.from('263G\n750G\n1438G') });
    await expect(page.locator('#mtdna-onboard-input')).toHaveValue('');
  }
  expect(await page.evaluate(() => (window as unknown as { optionalFiles: string[] }).optionalFiles)).toEqual(['livingdna.txt', 'livingdna.txt']);
});
for (const boundary of ['profile', 'thread', 'history', 'data', 'root', 'reinserted-root', 'transcript'] as const) test(`retired optional controls cannot act on a replacement ${boundary}`, async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async boundary => {
    const { state } = await import('/js/state.js'); const container = document.getElementById('chat-messages')!;
    const old = container.querySelector<HTMLButtonElement>('[data-chat-empty-action="open-wearables-settings"]')!;
    const back = container.querySelector<HTMLButtonElement>('[data-chat-onboarding-action="go-onboarding-step"]')!;
    const calls: string[] = [];
    (await import('/js/chat-empty-state.js')).configureChatEmptyStateDeps({ closeChatPanel: () => calls.push('closed') });
    if (boundary === 'profile') state.currentProfile = 'replacement-profile';
    if (boundary === 'thread') state.currentThreadId = 'replacement-thread';
    if (boundary === 'history') state.chatHistory = [...state.chatHistory];
    if (boundary === 'data') state.importedData = (await import('/js/profile.js')).createDefaultProfileData();
    if (boundary === 'root') container.querySelector('[data-chat-optional-setup-view]')!.remove();
    if (boundary === 'reinserted-root') { const node = container.querySelector('[data-chat-optional-setup-view]')!; node.remove(); container.appendChild(node); old.click(); back.click(); }
    if (boundary === 'transcript') state.chatHistory = [{ role: 'user', content: 'Replacement discussion' }];
    (await import('/js/chat-render.js')).renderChatMessages();
    const step = sessionStorage.getItem(`chat-onboard-force-step-${state.currentProfile}`);
    container.appendChild(old); container.appendChild(back); old.click(); back.click();
    return { calls, step, after: sessionStorage.getItem(`chat-onboard-force-step-${state.currentProfile}`), text: container.textContent };
  }, boundary);
  expect(result.calls).toEqual([]); expect(result.after).toBe(result.step);
  if (boundary === 'transcript') expect(result.text).toContain('Replacement discussion');
});
test('optional tasks fit all themes and widths, expose accessible controls and retain keyboard focus in fullscreen', async ({ page }) => {
  await setup(page);
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const result = await page.locator(root).evaluate(async (element, width) => {
        const bubble = element.querySelector('.chat-msg')!.getBoundingClientRect();
        const controls = [...element.querySelectorAll('button, a')];
        const overflow = controls.filter(control => { const r = control.getBoundingClientRect(); return r.left < bubble.left - 1 || r.right > bubble.right + 1; }).map(control => control.textContent);
        const short = width <= 768 ? controls.filter(control => control.tagName === 'BUTTON' && control.getBoundingClientRect().height < 44).map(control => control.textContent) : [];
        const axe = await (window as unknown as { axe: { run(element: Element, options: unknown): Promise<{ violations: { id: string }[] }> } }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
        return { overflow, short, violations: axe.violations.map(item => item.id) };
      }, width);
      expect(result, `${theme}/${width}`).toEqual({ overflow: [], short: [], violations: [] });
    }
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.getByRole('button', { name: 'Enter fullscreen chat', exact: true }).click();
  const widths = await page.locator(root).evaluate(element => { const container = document.getElementById('chat-messages')!; const style = getComputedStyle(container); return { bubble: element.querySelector('.chat-msg')!.getBoundingClientRect().width, available: container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) }; });
  expect(Math.abs(widths.bubble - widths.available)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Set up', exact: true }).focus(); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeFocused();
  await page.evaluate(async () => { (await import('/js/chat-render.js')).renderChatMessages(); });
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeFocused();
});

test('saved DNA confirmation remains owned by Svelte and keeps re-import controls through repaint', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const dna = await import('/js/dna.js');
    await dna.handleDNAFile(new File(['#AncestryDNA raw data download\nrsid\tchromosome\tposition\tallele1\tallele2\nrs1801133\t1\t11856378\tG\tA\n'], 'ancestry.txt', { type: 'text/plain' }));
  });
  await page.locator('[data-dna-action="confirm-import"]').click();
  await expect(page.locator(`${root} [role="status"]`)).toContainText('1 SNP call available');
  await expect(page.getByRole('button', { name: 'Re-import DNA', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'LivingDNA kit' })).toHaveCount(0);
  await page.evaluate(async () => { (await import('/js/chat-render.js')).renderChatMessages(); });
  await expect(page.locator(`${root} [role="status"]`)).toContainText('1 SNP call available');
  await expect(page.locator(`${root} [style]`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
  await expect(page.locator(`${root} [role="status"]`)).toContainText('1 SNP call available');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    if (!state.importedData.genetics) throw new Error('The confirmed genome is missing');
    state.importedData.genetics.snps = {};
    (await import('/js/chat-render.js')).renderChatMessages();
  });
  await expect(page.locator(`${root} [role="status"]`)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import DNA file', exact: true })).toBeVisible();
});

for (const kind of ['dna', 'mtdna'] as const) test(`${kind} parsing and pending confirmation cannot cross profile ownership`, async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async kind => {
    const { state } = await import('/js/state.js'); const dna = await import('/js/dna.js');
    const runtime = await import('/js/dna-runtime.js');
    const original = state.importedData, profile = state.currentProfile;
    await runtime.loadGeneticsStylesheet();
    const file = new File([kind === 'dna' ? '#AncestryDNA raw data download\nrsid\tchromosome\tposition\tallele1\tallele2\nrs1801133\t1\t11856378\tG\tA\n' : '263G\n750G\n1438G'], 'fixture.txt', { type: 'text/plain' });
    let finish!: () => void, entered = false;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const read = file.text.bind(file), slice = file.slice.bind(file);
    const delayed = async (read: () => Promise<string>) => { entered = true; await gate; return read(); };
    Object.defineProperty(file, 'text', { configurable: true, value: () => delayed(read) });
    Object.defineProperty(file, 'slice', { configurable: true, value: (...args: Parameters<File['slice']>) => {
      const blob = slice(...args), text = blob.text.bind(blob);
      Object.defineProperty(blob, 'text', { value: () => delayed(text) }); return blob;
    } });
    const handle = kind === 'dna' ? dna.handleDNAFile : dna.handleMtDNAFile;
    const parsing = handle(file);
    for (let index = 0; index < 100 && !entered; index++) await new Promise(resolve => setTimeout(resolve, 10));
    if (!entered) throw new Error('File parsing did not reach the controlled async boundary');
    state.currentProfile = 'replacement-profile'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData();
    finish(); const parsed = await parsing;
    const replacement = state.importedData;
    state.currentProfile = profile; state.importedData = original;
    Object.defineProperty(file, 'text', { value: read }); Object.defineProperty(file, 'slice', { value: slice });
    const opened = await handle(file);
    state.currentProfile = 'replacement-profile'; state.importedData = replacement;
    if (kind === 'dna') await dna.confirmDNAImport(); else await dna.confirmMtDNAImport();
    return { parsed, opened, originalGenetics: original.genetics, replacementGenetics: replacement.genetics,
      pending: kind === 'dna' ? runtime.getPendingDnaImport() : runtime.getPendingMtDnaImport() };
  }, kind);
  expect(result.parsed).toBe(false); expect(result.opened).toBe(true);
  expect(result.originalGenetics).toBeNull(); expect(result.replacementGenetics).toBeNull(); expect(result.pending).toBeNull();
});

for (const kind of ['dna', 'mtdna'] as const) test(`${kind} failed storage commit retains the preview and original data, then succeeds on retry`, async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async kind => {
    const { state } = await import('/js/state.js'); const dna = await import('/js/dna.js');
    const data = await import('/js/data.js'), crypto = await import('/js/crypto.js');
    const runtime = await import('/js/dna-runtime.js');
    const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported');
    if (!await data.saveImportedData()) throw new Error('Fixture save failed');
    const before = JSON.stringify(state.importedData), diskBefore = await crypto.encryptedGetItem(key);
    const file = new File([kind === 'dna' ? '#AncestryDNA raw data download\nrsid\tchromosome\tposition\tallele1\tallele2\nrs1801133\t1\t11856378\tG\tA\n' : '263G\n750G\n1438G'], 'fixture.txt', { type: 'text/plain' });
    await (kind === 'dna' ? dna.handleDNAFile(file) : dna.handleMtDNAFile(file));
    const put = IDBObjectStore.prototype.put;
    let aborted = 0;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (args[1] === key) request.addEventListener('success', () => { aborted++; this.transaction.abort(); }, { once: true });
      return request;
    };
    const confirm = kind === 'dna' ? dna.confirmDNAImport : dna.confirmMtDNAImport;
    try { await confirm(); } finally { IDBObjectStore.prototype.put = put; }
    const failed = { aborted, sameLive: JSON.stringify(state.importedData) === before, sameDisk: await crypto.encryptedGetItem(key) === diskBefore,
      preview: document.getElementById('dna-modal-overlay')?.classList.contains('show'),
      pending: Boolean(kind === 'dna' ? runtime.getPendingDnaImport() : runtime.getPendingMtDnaImport()) };
    await confirm();
    return { failed, saved: kind === 'dna' ? state.importedData.genetics?.snps?.rs1801133?.genotype : state.importedData.genetics?.mtdna?.haplogroup,
      preview: document.getElementById('dna-modal-overlay')?.classList.contains('show') };
  }, kind);
  expect(result.failed).toEqual({ aborted: 1, sameLive: true, sameDisk: true, preview: true, pending: true });
  expect(result.saved).toBe(kind === 'dna' ? 'GA' : 'H'); expect(result.preview).toBe(false);
});
