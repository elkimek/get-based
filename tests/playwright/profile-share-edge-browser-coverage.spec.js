import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?profileShareEdgeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openIsolatedProfileSharePage(page) {
  await page.route('**/profile-share-edge-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html>
      <html>
        <body>
          <button id="share-trigger" type="button">Share</button>
          <div id="notification-container"></div>
        </body>
      </html>`,
  }));
  await page.route('**/js/profile.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export function getProfiles() {
        return [
          { id: 'default', name: 'Edge Profile' },
          { id: 'other-profile', name: 'Other Profile' },
        ];
      }
    `,
  }));
  await page.route('**/js/export.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export async function buildClientExportObject(profileId) {
        if (window.__profileShareExportError) throw new Error(window.__profileShareExportError);
        return {
          version: 2,
          profile: { id: profileId || 'default', name: 'Edge Profile' },
          entries: [{ date: '2026-07-20', markers: { metabolic: { glucose: 5.1 } } }],
        };
      }
      export async function importDataJSON(file) {
        if (window.__profileShareImportError) throw new Error(window.__profileShareImportError);
        const payload = JSON.parse(await file.text());
        window.__profileShareImports = window.__profileShareImports || [];
        window.__profileShareImports.push({ name: file.name, type: file.type, payload });
        return true;
      }
    `,
  }));
  await page.goto('/profile-share-edge-browser-coverage', { waitUntil: 'load' });
}

test('profile share forms recover from create, load, decrypt, import, and delete failures', async ({ page }) => {
  test.slow();
  await openIsolatedProfileSharePage(page);

  const results = await page.evaluate(async ({ shareUrl }) => {
    const share = await import(shareUrl);
    const outcomes = {};
    const requests = [];
    const originalFetch = window.fetch;
    let mode = '';
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const waitFor = async (predicate, label, attempts = 160) => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const statusText = () => document.getElementById('profile-share-status')?.textContent || '';
    const submit = action => document.querySelector(`[data-profile-share-action="${action}"]`);

    try {
      window.fetch = async (url, options = {}) => {
        const href = String(url || '');
        const method = String(options.method || 'GET').toUpperCase();
        if (!href.startsWith('/api/share')) return originalFetch(url, options);
        requests.push({ href, method, body: String(options.body || '') });
        if (method === 'POST') return jsonResponse({ error: 'Share service unavailable.' }, 503);
        if (method === 'DELETE') return jsonResponse({ error: 'Could not stop this test link.' }, 503);
        if (mode === 'not-found') return jsonResponse({ error: 'Shared profile link has expired.' }, 410);
        if (mode === 'missing-envelope') return jsonResponse({ id: 'missing-envelope' });
        return jsonResponse({ envelope: window.__profileShareEnvelope });
      };

      share.openProfileShareModal('default');
      const createPassword = document.getElementById('profile-share-password');
      const consent = document.getElementById('profile-share-consent');
      createPassword.value = 'short';
      consent.checked = true;
      submit('create')?.click();
      await waitFor(() => statusText().includes('at least 12 characters'), 'short-password error');
      outcomes.shortPasswordRecovers = statusText().includes('at least 12 characters')
        && submit('create')?.textContent === 'Create Link'
        && submit('create')?.disabled === false
        && createPassword.disabled === false;

      createPassword.value = 'correct-horse-create-1234';
      submit('create')?.click();
      await waitFor(() => statusText().includes('Share service unavailable'), 'create API error');
      outcomes.createFailureRecovers = requests.filter(request => request.method === 'POST').length === 1
        && statusText().includes('Share service unavailable')
        && document.getElementById('profile-share-overlay') != null
        && submit('create')?.textContent === 'Create Link'
        && submit('create')?.disabled === false
        && document.getElementById('profile-share-expires')?.disabled === false;

      const password = 'correct-horse-load-1234';
      window.__profileShareEnvelope = await share.encryptProfileShareEnvelope({
        version: 2,
        profile: { id: 'shared-profile', name: 'Shared Edge Profile' },
        entries: [{ date: '2026-07-19', markers: {} }],
      }, password, {
        iterations: share.PROFILE_SHARE_MIN_KDF_ITERATIONS,
        expiresAt: '2099-01-01T00:00:00.000Z',
      });

      const shareId = 'edgefailureprofile123456';
      mode = 'not-found';
      share.openSharedProfileImportModal(shareId);
      const loadPassword = document.getElementById('profile-share-load-password');
      loadPassword.value = password;
      submit('load')?.click();
      await waitFor(() => statusText().includes('expired'), 'expired-link API error');
      outcomes.loadFailureRecovers = statusText().includes('expired')
        && submit('load')?.textContent === 'Load Profile'
        && submit('load')?.disabled === false
        && loadPassword.disabled === false;

      mode = 'missing-envelope';
      const getCountBeforeMissing = requests.filter(request => request.method === 'GET').length;
      submit('load')?.click();
      await waitFor(() => requests.filter(request => request.method === 'GET').length > getCountBeforeMissing
        && statusText().includes('payload is missing'), 'missing-envelope error');
      outcomes.missingEnvelopeRecovers = statusText().includes('payload is missing')
        && submit('load')?.disabled === false;

      mode = 'envelope';
      loadPassword.value = 'wrong-password-1234';
      const getCountBeforeWrongPassword = requests.filter(request => request.method === 'GET').length;
      submit('load')?.click();
      await waitFor(() => requests.filter(request => request.method === 'GET').length > getCountBeforeWrongPassword
        && statusText().includes('Check the password'), 'wrong-password error');
      outcomes.wrongPasswordUsesSafeMessage = statusText() === 'Could not unlock shared profile. Check the password and try again.'
        && submit('load')?.disabled === false;

      window.__profileShareImportError = 'Import rejected by fixture.';
      loadPassword.value = password;
      const getCountBeforeImportError = requests.filter(request => request.method === 'GET').length;
      submit('load')?.click();
      await waitFor(() => requests.filter(request => request.method === 'GET').length > getCountBeforeImportError
        && statusText().includes('Import rejected by fixture'), 'import error');
      outcomes.importFailureRecovers = statusText().includes('Import rejected by fixture')
        && document.getElementById('profile-share-overlay') != null
        && submit('load')?.textContent === 'Load Profile'
        && submit('load')?.disabled === false;

      share.closeProfileShareModal();
      localStorage.setItem('getbased-profile-shares-v1', JSON.stringify([{
        id: shareId,
        profileId: 'default',
        profileName: 'Edge Profile',
        shareUrl: `${location.origin}${location.pathname}#share/${shareId}`,
        manageToken: 'correct-local-manage-token',
        createdAt: new Date().toISOString(),
        expiresAt: '2099-01-01T00:00:00.000Z',
      }]));
      share.openProfileShareModal('default');
      const deleteButton = submit('delete-link');
      deleteButton?.click();
      await waitFor(() => statusText().includes('Could not stop this test link'), 'delete API error');
      const deleteRequest = requests.find(request => request.method === 'DELETE');
      outcomes.deleteFailureKeepsRecordAndRecovers = JSON.parse(
        localStorage.getItem('getbased-profile-shares-v1') || '[]',
      ).length === 1
        && JSON.parse(deleteRequest?.body || '{}').manageToken === 'correct-local-manage-token'
        && deleteButton?.textContent === 'Stop sharing'
        && deleteButton?.disabled === false
        && statusText().includes('Could not stop this test link');
    } finally {
      share.closeProfileShareModal();
      window.fetch = originalFetch;
      localStorage.removeItem('getbased-profile-shares-v1');
      document.querySelectorAll('.notification-toast').forEach(element => element.remove());
      delete window.__profileShareEnvelope;
      delete window.__profileShareImportError;
    }

    return outcomes;
  }, { shareUrl: moduleUrl('/js/profile-share.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('profile share local records are repaired, capped, scoped, and safe without a management token', async ({ page }) => {
  await openIsolatedProfileSharePage(page);

  const results = await page.evaluate(async ({ shareUrl }) => {
    const share = await import(shareUrl);
    const outcomes = {};
    const originalFetch = window.fetch;
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    try {
      localStorage.setItem('getbased-profile-shares-v1', '{broken-json');
      share.openProfileShareModal('default');
      outcomes.repairsMalformedStorage = document.querySelector('.profile-share-active-empty') != null
        && localStorage.getItem('getbased-profile-shares-v1') === '[]';
      share.closeProfileShareModal();

      const records = Array.from({ length: 55 }, (_, index) => {
        const id = `record${String(index).padStart(18, '0')}`;
        return {
          id,
          profileId: index % 2 === 0 ? 'default' : 'other-profile',
          profileName: index % 2 === 0 ? 'Edge Profile' : 'Other Profile',
          shareUrl: `${location.origin}${location.pathname}#share/${id}`,
          manageToken: index === 0 ? '' : `manage-token-${index}`,
          createdAt: new Date(Date.now() - index * 1000).toISOString(),
          expiresAt: '2099-01-01T00:00:00.000Z',
        };
      });
      records.push({ ...records[0], id: 'invalid' });
      records.push({ ...records[0], id: 'expiredrecord123456789', expiresAt: '2000-01-01T00:00:00.000Z' });
      localStorage.setItem('getbased-profile-shares-v1', JSON.stringify(records));

      let deleteBody = null;
      window.fetch = async (url, options = {}) => {
        if (String(url || '').startsWith('/api/share') && String(options.method || '').toUpperCase() === 'DELETE') {
          deleteBody = JSON.parse(String(options.body || '{}'));
          return new Response(JSON.stringify({
            error: 'This link can only be stopped from the browser that created it.',
          }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
      };

      share.openProfileShareModal('default');
      const stored = JSON.parse(localStorage.getItem('getbased-profile-shares-v1') || '[]');
      const visibleRows = Array.from(document.querySelectorAll('.profile-share-active-row'));
      outcomes.prunesAndCapsRecordsImmediately = stored.length === 50
        && stored.every(record => record.id !== 'invalid' && record.expiresAt !== '2000-01-01T00:00:00.000Z')
        && visibleRows.length === 25;
      outcomes.scopesRecordsToSelectedProfile = visibleRows.every(row => {
        const record = stored.find(item => item.id === row.dataset.profileShareRecord);
        return record?.profileId === 'default';
      });

      const deleteButton = document.querySelector('[data-profile-share-action="delete-link"]');
      deleteButton?.click();
      await waitFor(() => document.getElementById('profile-share-status')?.dataset.status === 'error', 'missing-token delete error');
      outcomes.missingManageTokenFailsSafely = deleteBody?.manageToken === ''
        && JSON.parse(localStorage.getItem('getbased-profile-shares-v1') || '[]').length === 50
        && deleteButton?.disabled === false
        && deleteButton?.textContent === 'Stop sharing';
    } finally {
      share.closeProfileShareModal();
      window.fetch = originalFetch;
      localStorage.removeItem('getbased-profile-shares-v1');
      document.querySelectorAll('.notification-toast').forEach(element => element.remove());
    }

    return outcomes;
  }, { shareUrl: moduleUrl('/js/profile-share.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('profile share copy actions fall back when the Clipboard API is unavailable or rejects', async ({ page }) => {
  await openIsolatedProfileSharePage(page);

  const results = await page.evaluate(async ({ shareUrl }) => {
    const share = await import(shareUrl);
    const outcomes = {};
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const originalExecCommand = document.execCommand;
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    try {
      const id = 'clipboardrecord12345678';
      const shareUrlValue = `${location.origin}${location.pathname}#share/${id}`;
      localStorage.setItem('getbased-profile-shares-v1', JSON.stringify([{
        id,
        profileId: 'default',
        profileName: 'Edge Profile',
        shareUrl: shareUrlValue,
        manageToken: 'clipboard-manage-token',
        createdAt: new Date().toISOString(),
        expiresAt: '2099-01-01T00:00:00.000Z',
      }]));
      let calls = 0;
      let copySucceeds = true;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new Error('permission denied'); } },
      });
      document.execCommand = command => {
        if (command === 'copy') calls += 1;
        return copySucceeds;
      };

      share.openProfileShareModal('default');
      document.querySelector('[aria-label="Copy active link"]')?.click();
      await waitFor(() => calls === 1, 'successful copy fallback');
      outcomes.rejectedClipboardUsesFallback = Array.from(document.querySelectorAll('.notification-toast'))
        .some(element => element.textContent?.includes('Link copied'))
        && !document.querySelector('textarea');

      document.querySelectorAll('.notification-toast').forEach(element => element.remove());
      copySucceeds = false;
      document.querySelector('[aria-label="Copy active link"]')?.click();
      await waitFor(() => calls === 2, 'failed copy fallback');
      outcomes.failedFallbackGivesManualCopyGuidance = Array.from(document.querySelectorAll('.notification-toast'))
        .some(element => element.textContent?.includes('Select the field and copy manually'))
        && !document.querySelector('textarea');
    } finally {
      share.closeProfileShareModal();
      localStorage.removeItem('getbased-profile-shares-v1');
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else delete navigator.clipboard;
      document.execCommand = originalExecCommand;
      document.querySelectorAll('.notification-toast').forEach(element => element.remove());
    }

    return outcomes;
  }, { shareUrl: moduleUrl('/js/profile-share.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('profile share completes a browser-to-dev-server create, load, import, and delete round trip', async ({ page }) => {
  test.slow();
  await openIsolatedProfileSharePage(page);

  const results = await page.evaluate(async ({ shareUrl }) => {
    const share = await import(shareUrl);
    const outcomes = {};
    const password = 'correct-horse-roundtrip-1234';
    let cleanup = null;
    const waitFor = async (predicate, label, attempts = 200) => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    try {
      localStorage.removeItem('getbased-profile-shares-v1');
      share.openProfileShareModal('default');
      document.getElementById('profile-share-password').value = password;
      document.getElementById('profile-share-consent').checked = true;
      document.querySelector('[data-profile-share-action="create"]')?.click();
      await waitFor(() => document.getElementById('profile-share-link'), 'real share creation');

      const records = JSON.parse(localStorage.getItem('getbased-profile-shares-v1') || '[]');
      const record = records[0];
      cleanup = record;
      const createdResponse = await fetch(`/api/share?id=${encodeURIComponent(record.id)}`);
      const createdBody = await createdResponse.json();
      outcomes.realPostPersistsEncryptedEnvelope = createdResponse.status === 200
        && createdBody.envelope?.schema === 'getbased-profile-share'
        && !JSON.stringify(createdBody.envelope).includes('Edge Profile')
        && !JSON.stringify(createdBody.envelope).includes(password);

      share.closeProfileShareModal();
      share.openSharedProfileImportModal(record.id);
      document.getElementById('profile-share-load-password').value = password;
      document.querySelector('[data-profile-share-action="load"]')?.click();
      await waitFor(() => !document.getElementById('profile-share-overlay'), 'real share import');
      outcomes.realGetDecryptsAndImports = window.__profileShareImports?.length === 1
        && window.__profileShareImports[0].name === 'getbased-shared-profile.json'
        && window.__profileShareImports[0].payload.profile.name === 'Edge Profile'
        && window.__profileShareImports[0].payload.entries[0].markers.metabolic.glucose === 5.1;

      share.openProfileShareModal('default');
      document.querySelector(`[data-profile-share-record="${record.id}"] [data-profile-share-action="delete-link"]`)?.click();
      await waitFor(() => document.querySelector('.profile-share-active-empty'), 'real share deletion');
      const deletedResponse = await fetch(`/api/share?id=${encodeURIComponent(record.id)}`);
      outcomes.realDeleteRemovesRemoteAndLocalRecord = deletedResponse.status === 404
        && JSON.parse(localStorage.getItem('getbased-profile-shares-v1') || '[]').length === 0;
      cleanup = null;
    } finally {
      share.closeProfileShareModal();
      if (cleanup?.id) {
        await fetch(`/api/share?id=${encodeURIComponent(cleanup.id)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manageToken: cleanup.manageToken || '' }),
        }).catch(() => {});
      }
      localStorage.removeItem('getbased-profile-shares-v1');
      document.querySelectorAll('.notification-toast').forEach(element => element.remove());
    }

    return outcomes;
  }, { shareUrl: moduleUrl('/js/profile-share.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
