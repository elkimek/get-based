import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('profileShareLoadCoverage');

async function openIsolatedShareLoadPage(page) {
  await page.route('**/profile-share-load-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html>
      <html>
        <body>
          <div id="notification-container"></div>
        </body>
      </html>`,
  }));
  await page.route('**/js/profile.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export function getProfiles() {
        return [{ id: 'default', name: 'Default Profile' }];
      }
    `,
  }));
  await page.route('**/js/export.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export async function buildClientExportObject() {
        return { version: 2, profile: { name: 'Stub Profile' }, entries: [] };
      }
      export async function importDataJSON(file) {
        const text = await file.text();
        window.__profileShareImports = window.__profileShareImports || [];
        window.__profileShareImports.push({
          name: file.name,
          type: file.type,
          payload: JSON.parse(text),
        });
        return true;
      }
    `,
  }));
  await page.goto('/profile-share-load-browser-coverage', { waitUntil: 'load' });
}

test('profile share load browser coverage fetches decrypts imports and clears deep links', async ({ page }) => {
  await openIsolatedShareLoadPage(page);

  const results = await page.evaluate(async ({ shareUrl }) => {
    const share = await import(shareUrl);
    const outcomes = {};
    const originalFetch = window.fetch;
    const originalUrl = `${location.pathname}${location.search}${location.hash}`;
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    try {
      const id = 'loadcoverageprofile1234';
      const password = 'correct-horse-load-1234';
      const exported = {
        version: 2,
        profile: {
          name: 'Loaded Share Profile',
          id: 'shared-source-profile',
        },
        entries: [{
          date: '2026-06-11',
          markers: { metabolic: { glucose: 5.2 } },
        }],
        notes: [{ date: '2026-06-11', text: 'shared note' }],
      };
      const envelope = await share.encryptProfileShareEnvelope(exported, password, {
        iterations: 100000,
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      const fetches = [];
      window.fetch = async (url, options = {}) => {
        const href = String(url || '');
        fetches.push({ href, method: String(options.method || 'GET').toUpperCase() });
        if (href.startsWith('/api/share')) {
          return new Response(JSON.stringify({ envelope }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      history.pushState(null, '', `?share=${id}#share/${id}`);
      share.openSharedProfileImportModal(id);
      await waitFor(() => !!document.querySelector('[data-profile-share-form="load"]'), 'load form');
      const passwordInput = document.getElementById('profile-share-load-password');
      if (!(passwordInput instanceof HTMLInputElement)) {
        throw new Error('Profile share load password input missing');
      }
      passwordInput.value = password;
      document.querySelector('[data-profile-share-action="load"]')?.click();
      await waitFor(() => !document.getElementById('profile-share-overlay'), 'load modal closed after import');

      const imported = window.__profileShareImports?.[0];
      const shareFetch = fetches.find(({ href }) => href === `/api/share?id=${encodeURIComponent(id)}`);
      outcomes.fetchesEnvelopeByShareId =
        shareFetch?.method === 'GET';
      outcomes.decryptsAndImportsSharedProfile =
        imported?.name === 'getbased-shared-profile.json'
        && imported.type === 'application/json'
        && imported.payload.profile.name === 'Loaded Share Profile'
        && imported.payload.entries[0].markers.metabolic.glucose === 5.2
        && imported.payload.notes[0].text === 'shared note';
      outcomes.clearShareHashRemovesHashAndQuery =
        location.hash === ''
        && !new URL(location.href).searchParams.has('share');
      outcomes.successNotificationMentionsImportedProfile =
        Array.from(document.querySelectorAll('.notification-toast'))
          .some(el => (el.textContent || '').includes('Imported shared profile "Loaded Share Profile"'));
    } finally {
      share.closeProfileShareModal();
      share.resetProfileShareDeepLinkState();
      window.fetch = originalFetch;
      history.replaceState(null, '', originalUrl);
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    shareUrl: moduleUrl('/js/profile-share.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});


test('encrypted profile loading preserves a complete ongoing ingredient regimen through the real importer', async ({ page }) => {
  await page.route('**/share-regimen-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html><body><main id="main-content"></main><div id="notification-container"></div></body></html>' }));
  await page.goto('/share-regimen-fixture');
  const source = {
    id: 'sm_shared_regimen', name: 'TMG Powder', dosage: 'scoop', type: 'supplement', note: '', schemaVersion: 2,
    startDate: '2026-03-24', endDate: null, timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 },
    ingredients: [{ name: 'TMG', amountValue: 500, amountUnit: 'mg' }],
    periods: [{ start: '2026-03-24', end: null, schedule: { mode: 'daily', timesPerDay: 1 }, ingredientDoses: [{ ingredient: 'TMG', value: 500, unit: 'mg', basis: 'day', source: 'ingredient' }] }],
    lifecycle: { state: 'active' }, sourceUrl: 'https://example.test/tmg',
  };
  const envelope = await page.evaluate(async source => {
    const share = await import('/js/profile-share.js');
    return share.encryptProfileShareEnvelope({ version: 2, profile: { name: 'Synthetic regimen share' }, entries: [{ date: '2026-05-22', markers: { 'biochemistry.glucose': 4.56 } }], supplements: [source] }, 'test-regimen-password-123', { iterations: 100000, expiresAt: '2099-01-01T00:00:00.000Z' });
  }, source);
  await page.route('**/api/share?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ envelope }) }));
  await page.evaluate(async () => (await import('/js/profile-share.js')).openSharedProfileImportModal('regimentestprofile12345'));
  await page.locator('#profile-share-load-password').fill('test-regimen-password-123');
  await page.locator('[data-profile-share-action="load"]').click();
  await expect(page.locator('#profile-share-overlay')).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { prepareTherapyHistory, therapyExposure } = await import('/js/therapy-correlations.js');
    const record = state.importedData.supplements.find(s => s.id === 'sm_shared_regimen');
    const h = prepareTherapyHistory(record, '2026-09-28');
    return { record, exposure: therapyExposure(h, '2026-09-28'), current: h.currentDoses[0] };
  });
  expect(result.record).toMatchObject(source);
  expect(result.record.periods).toEqual(source.periods);
  expect(result.current).toMatchObject({ value: 500, confirmedSince: '2026-03-24' });
  expect(result.exposure).toMatchObject({ value: 500, usage: 1 });
});


test('regimen import offers keep or replace without guessing from device clocks', async ({ page }) => {
  await page.route('**/regimen-conflict-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html><body><main id="main-content"></main><div id="notification-container"></div></body></html>' }));
  await page.goto('/regimen-conflict-fixture');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentProfile = 'regimen-conflict-test';
    state.importedData = { entries: [], supplements: [{ id: 'tmg', name: 'TMG', startDate: '2026-03-24', updatedAt: 200,
      ingredients: [{ name: 'TMG', amount: '500 mg' }], sourceUrl: 'https://example.test/tmg',
      periods: [{ start: '2026-03-24', end: null, dose: '500 mg', schedule: { mode: 'daily' } }] }] };
  });
  for (const replace of [false, true]) {
    const importing = page.evaluate(async () => {
      const { importDataJSON } = await import('/js/export-import.js');
      await importDataJSON(new File([JSON.stringify({ entries: [{ date: '2026-05-22', markers: { 'biochemistry.glucose': 4.56 } }], supplements: [{ id: 'tmg', name: 'TMG', startDate: '2026-03-24', updatedAt: 100,
        periods: [{ start: '2026-03-24', end: null, dose: '2000 mg', schedule: { mode: 'daily' } }] }] })], 'regimen.json'));
      return (await import('/js/state.js')).state.importedData.supplements[0];
    });
    await expect(page.getByRole('alertdialog', { name: 'Conflicting regimens' })).toContainText('remove omitted fields');
    await page.getByRole('button', { name: replace ? 'Use imported' : 'Keep saved', exact: true }).click();
    const record = await importing;
    expect(record.periods[0].dose).toBe(replace ? '2000 mg' : '500 mg');
    expect(record.sourceUrl).toBe(replace ? undefined : 'https://example.test/tmg');
    expect(Boolean(record.ingredients)).toBe(!replace);
  }
});
