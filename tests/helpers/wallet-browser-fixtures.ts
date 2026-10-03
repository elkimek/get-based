import { readFile } from 'node:fs/promises';
import type { Page } from 'playwright';
export async function installWalletFixtures(page: Page) {
  for (const name of ['lightning-invoices', 'cashu-browser-durable']) {
    const body = (await readFile(new URL(`../fixtures/${name}.js`, import.meta.url), 'utf8')).replaceAll('../../vendor/', '/vendor/');
    await page.route(`**/wallet-test-${name}.js`, route => route.fulfill({ contentType: 'application/javascript', body }));
  }
}
