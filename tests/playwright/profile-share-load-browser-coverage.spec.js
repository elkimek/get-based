import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?profileShareLoadCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
