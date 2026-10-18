import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { BackupSnapshot } from '../../js/backup.js';
import type { ProfileData } from '../../types/app-state.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function openReturningChat(page: Page) {
  // A cold launch may already restore the optional onboarding inside Chat.
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/, { timeout: 30000 });
  if (!(await page.locator('#chat-panel.open').isVisible())) {
    // The empty mobile dashboard exposes guided Chat instead of its floating action.
    if (await page.locator('#chat-fab').isVisible()) await page.locator('#chat-fab').click();
    else await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
  }
  await expect(page.locator('#chat-panel')).toHaveClass(/open/);
}
test('optional onboarding imports real DNA and mtDNA offline on first use and restores notes and both imports through cached cold launches', async ({ page, context }) => {
  test.setTimeout(120000);
  const errors: string[] = [], csp: string[] = [];
  context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  await installDiscussionFixture(context);
  await context.exposeBinding('optionalCspFailure', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { optionalCspFailure(value: string): Promise<void> }).optionalCspFailure(event.violatedDirective);
  }));
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    server.state.offline = true;
    await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
    await page.locator('#chat-onboard-name').fill('Ada');
    await page.getByRole('button', { name: 'Female', exact: true }).click();
    await expect(page.locator('#chat-onboard-next')).toBeEnabled(); await page.locator('#chat-onboard-next').click();
    await expect(page.locator('[data-chat-optional-setup-view]')).toBeVisible();
    const nuclear = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import DNA file', exact: true }).click();
    await (await nuclear).setFiles({ name: 'ancestry.txt', mimeType: 'text/plain', buffer: Buffer.from('#AncestryDNA raw data download\nrsid\tchromosome\tposition\tallele1\tallele2\nrs1801133\t1\t11856378\tG\tA\n') });
    await page.locator('[data-dna-action="confirm-import"]').click();
    await expect(page.locator('#dna-modal-overlay')).not.toHaveClass(/show/);
    await openReturningChat(page);
    await expect(page.locator('[data-chat-optional-setup-view] [role="status"]')).toContainText('1 SNP call available');
    await expect(page.getByRole('button', { name: 'Re-import DNA', exact: true })).toBeVisible();
    const mitochondrial = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import mtDNA', exact: true }).click();
    await (await mitochondrial).setFiles({ name: 'livingdna.txt', mimeType: 'text/plain', buffer: Buffer.from('263G\n750G\n1438G\n4769G\n8860G\n15326G') });
    await page.locator('[data-dna-action="confirm-mtdna-import"]').click();
    await expect(page.locator('#dna-modal-overlay')).not.toHaveClass(/show/);
    await openReturningChat(page);
    await expect(page.locator('[data-chat-optional-task="genetics"]')).toContainText('1 SNPs · mtDNA H');
    await expect(page.getByRole('button', { name: 'Re-import mtDNA', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'LivingDNA kit' })).toHaveCount(0);
    await page.close();
    let cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold);
    await openReturningChat(cold);
    await expect(cold.locator('[data-chat-optional-task="genetics"]')).toContainText('1 SNPs · mtDNA H');
    await expect(cold.getByRole('button', { name: 'Re-import DNA', exact: true })).toBeVisible();
    await expect(cold.getByRole('button', { name: 'Re-import mtDNA', exact: true })).toBeVisible();
    await cold.getByRole('button', { name: 'Continue to context cards', exact: true }).click();
    await expect(cold.getByRole('group', { name: 'Onboarding step 3 of 3: Context' })).toBeVisible();
    const catalog = cold.locator('.chat-context-cards [data-context-cards-view]');
    await expect(catalog).toBeVisible(); await expect(catalog.locator('article.context-card')).toHaveCount(9);
    const info = catalog.getByRole('button', { name: 'Why Health Goals matters', exact: true });
    await info.click(); await expect(info).toHaveAttribute('aria-expanded', 'true');
    await expect(catalog.locator('.context-card-explanation').first()).toBeVisible();
    await catalog.getByRole('textbox', { name: 'Additional context', exact: true }).fill('Offline context <literal> & preserved');
    await expect(catalog.locator('.ctx-notes-status')).toHaveText('Saved');
    await cold.close(); cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold);
    await openReturningChat(cold);
    await expect(cold.locator('.chat-context-cards [data-context-cards-view] textarea')).toHaveValue('Offline context <literal> & preserved');
    await cold.getByRole('button', { name: 'Close chat', exact: true }).click();
    await cold.locator('[data-shell-action="open-settings"]').click(); await cold.locator('#settings-nav-data').click();
    const downloading = cold.waitForEvent('download');
    await cold.locator('#backup-section').getByRole('button', { name: 'Download Backup', exact: true }).click();
    const backup = JSON.parse(await fs.readFile((await (await downloading).path())!, 'utf8')) as BackupSnapshot;
    expect(backup).toMatchObject({ format: 'labcharts-backup', encrypted: false });
    const stored = backup.profiles.find(profile => profile.keys.imported)!;
    const data = JSON.parse(stored.keys.imported!) as ProfileData;
    expect(data.contextNotes).toBe('Offline context <literal> & preserved');
    expect(data.genetics.snps.rs1801133).toMatchObject({ genotype: 'GA' });
    expect(data.genetics.source).toBe('AncestryDNA');
    expect(data.genetics.mtdna).toMatchObject({ haplogroup: 'H', source: 'mtDNA (Living DNA)', mutations: ['263G', '750G', '1438G', '4769G', '8860G', '15326G'] });
    expect(csp).toEqual([]); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
