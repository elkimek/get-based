import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?profileShareCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('Share Profile entry points open the sharing modal', async ({ page }) => {
  let profileShareRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/js/profile-share.js') profileShareRequests += 1;
  });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-default-onboarded', 'dismissed');
  });
  await page.goto('/app', { waitUntil: 'networkidle' });

  await page.evaluate(async () => {
    const { endTour } = await import('/js/tour.js');
    endTour({ openEmptyChat: false });
  });
  await expect(page.locator('#tour-overlay')).toHaveCount(0);

  // A returning desktop user with no chat history intentionally gets the
  // onboarding panel after a short delay. Let that startup task settle before
  // closing the panel so it cannot race the share-profile assertions below.
  const chatPanel = page.locator('#chat-panel');
  await expect(chatPanel).toHaveClass(/\bopen\b/);
  await page.evaluate(async () => {
    const { closeChatPanel } = await import('/js/chat-panel.js');
    closeChatPanel();
  });
  await expect(chatPanel).not.toHaveClass(/\bopen\b/);
  expect(profileShareRequests).toBe(0);
  await page.locator('[data-shell-action="share-profile"]').click();

  await expect(page.locator('#profile-share-overlay')).toBeVisible();
  expect(profileShareRequests).toBe(1);
  await expect(page.locator('#profile-share-overlay [role="dialog"]')).toHaveAttribute('aria-label', 'Share Profile');
  await expect(page.locator('#profile-share-overlay [data-profile-share-action="close"]').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#profile-share-overlay')).toHaveCount(0);
  await expect(page.locator('[data-shell-action="share-profile"]')).toBeFocused();

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData = {
      ...state.importedData,
      entries: [{ date: '2026-07-20', markers: { metabolic: { glucose: 5.1 } } }],
    };
    const { openSettingsModal } = await import('/js/settings-loader.js');
    await openSettingsModal('data');
  });
  await expect(page.locator('#settings-modal-overlay')).toBeVisible();
  await page.locator('[data-settings-action="share-profile"]').click();
  await expect(page.locator('#profile-share-overlay')).toBeVisible();
  await page.locator('#profile-share-overlay [data-profile-share-action="close"]').first().click();
  await expect(page.locator('#profile-share-overlay')).toHaveCount(0);

  const profile = await page.evaluate(async () => {
    const [{ state }, { closeSettingsModal }, { openClientList }] = await Promise.all([
      import('/js/state.js'),
      import('/js/settings-loader.js'),
      import('/js/client-list.js'),
    ]);
    await closeSettingsModal();
    openClientList();
    return {
      id: state.currentProfile,
      name: state.profiles.find(item => item.id === state.currentProfile)?.name || 'Active profile',
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#client-list-overlay')).toBeVisible();
  await page.locator(`[data-cl-action="toggle-menu"][data-cl-profile-id="${profile.id}"]`).click();
  await page.locator(`[data-cl-action="share-profile"][data-cl-profile-id="${profile.id}"]`).click();
  await expect(page.locator('#client-list-overlay')).toBeHidden();
  await expect(page.locator('#profile-share-overlay')).toBeVisible();
  await expect(page.locator('.profile-share-intro-title')).toContainText(profile.name);
});

test('profile share modal creates copies and manages active encrypted links', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ cryptoUrl, profileUrl, shareUrl }) => {
    const [{ state }, cryptoStore, profile, profileShare] = await Promise.all([
      import('/js/state.js'),
      import(cryptoUrl),
      import(profileUrl),
      import(shareUrl),
    ]);
    const outcomes = {};
    const posted = [];
    const deleted = [];
    const copied = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const profileId = 'share-profile-browser';
    const profileKey = profile.profileStorageKey(profileId, 'imported');
    const storageKeys = [
      'labcharts-active-profile',
      'labcharts-profiles',
      'getbased-profile-shares-v1',
    ];
    const saved = {
      profiles: clone(state.profiles),
      currentProfile: state.currentProfile,
      storage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
      importedRaw: await cryptoStore.encryptedGetItem(profileKey),
      fetch: window.fetch,
      clipboardOwn: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
    };

    try {
      state.currentProfile = profileId;
      state.profiles = [{
        id: profileId,
        name: 'Browser Share Profile',
        sex: 'female',
        dob: '1988-02-03',
        location: { country: 'CZ', zip: '11000' },
        tags: ['coverage'],
        notes: 'Share test fixture',
        status: 'active',
        avatar: null,
        pinned: false,
        height: 172,
        heightUnit: 'cm',
        createdAt: Date.now() - 1000,
        lastUpdated: Date.now(),
      }];
      localStorage.setItem('labcharts-active-profile', profileId);
      localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
      localStorage.removeItem('getbased-profile-shares-v1');
      await cryptoStore.encryptedSetItem(profileKey, JSON.stringify({
        entries: [{
          date: '2026-06-07',
          markers: {
            metabolic: { glucose: 5.1 },
          },
        }],
        notes: [{ date: '2026-06-07', text: 'private note' }],
        supplements: [],
        healthGoals: ['keep profile local-first'],
        customMarkers: {},
        refOverrides: {},
      }));

      window.fetch = async (url, options = {}) => {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href.startsWith('/api/share')) {
          const method = String(options.method || 'GET').toUpperCase();
          if (method === 'POST') {
            posted.push(JSON.parse(String(options.body || '{}')));
            return jsonResponse({ ok: true });
          }
          if (method === 'DELETE') {
            const id = new URL(href, location.origin).searchParams.get('id');
            deleted.push({
              id,
              body: JSON.parse(String(options.body || '{}')),
            });
            return jsonResponse({ ok: true });
          }
        }
        return saved.fetch.call(window, url, options);
      };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async value => copied.push(String(value || '')),
        },
      });

      profileShare.openProfileShareModal(profileId);
      const overlay = document.getElementById('profile-share-overlay');
      outcomes.opensForRequestedProfile = overlay?.querySelector('.profile-share-intro-title')?.textContent
        .includes('Browser Share Profile') === true
        && overlay?.querySelector('[data-profile-share-active-list]')?.textContent
          .includes('No active links created on this device') === true;

      overlay.querySelector('[data-profile-share-action="create"]')?.click();
      await waitFor(() => document.getElementById('profile-share-consent')?.matches(':invalid') === true,
        'consent validation');
      outcomes.requiresConsentBeforePosting = posted.length === 0
        && !!document.getElementById('profile-share-overlay');

      const passwordInput = document.getElementById('profile-share-password');
      const originalGeneratedPassword = passwordInput?.value || '';
      overlay.querySelector('[data-profile-share-action="regenerate"]')?.click();
      outcomes.regeneratesPasswordInPlace = (passwordInput?.value || '').length >= 12
        && passwordInput.value !== originalGeneratedPassword;

      passwordInput.value = 'correct-horse-1234';
      document.getElementById('profile-share-expires').value = '14';
      document.getElementById('profile-share-consent').checked = true;
      overlay.querySelector('[data-profile-share-action="create"]')?.click();
      await waitFor(() => !!document.getElementById('profile-share-link'), 'share result');

      const postedBody = posted[0] || {};
      const envelopeText = JSON.stringify(postedBody.envelope || {});
      outcomes.postsEncryptedEnvelopeOnly = posted.length === 1
        && /^[A-Za-z0-9_-]{20,80}$/.test(postedBody.id || '')
        && /^[0-9a-f]{64}$/.test(postedBody.manageTokenHash || '')
        && postedBody.envelope?.schema === 'getbased-profile-share'
        && postedBody.envelope?.cipher?.name === 'AES-GCM'
        && !envelopeText.includes('Browser Share Profile')
        && !envelopeText.includes('private note')
        && !JSON.stringify(postedBody).includes('correct-horse-1234');

      const linkInput = document.getElementById('profile-share-link');
      const resultPasswordInput = document.getElementById('profile-share-result-password');
      outcomes.rendersResultAndActiveRow = linkInput?.value?.includes(`#share/${postedBody.id}`) === true
        && resultPasswordInput?.value === 'correct-horse-1234'
        && document.querySelector('.profile-share-active-row')?.textContent.includes('Shared link') === true;

      document.querySelector('button[data-copy-target="profile-share-link"]')?.click();
      await waitFor(() => copied.length >= 1, 'copied share link');
      document.querySelector('button[data-copy-target="profile-share-result-password"]')?.click();
      await waitFor(() => copied.length >= 2, 'copied share password');
      document.querySelector('button[aria-label="Copy active link"]')?.click();
      await waitFor(() => copied.length >= 3, 'copied active link');
      outcomes.copyButtonsUseClipboard = copied[0] === linkInput.value
        && copied[1] === 'correct-horse-1234'
        && copied[2] === linkInput.value;

      document.querySelector('[data-profile-share-action="delete-link"]')?.click();
      await waitFor(() => document.querySelector('.profile-share-active-empty')?.textContent
        .includes('No active links created on this device') === true, 'stopped active link');
      outcomes.stopSharingDeletesRemoteAndLocalRecord = deleted.length === 1
        && deleted[0].id === postedBody.id
        && typeof deleted[0].body.manageToken === 'string'
        && deleted[0].body.manageToken.length >= 20
        && JSON.parse(localStorage.getItem('getbased-profile-shares-v1') || '[]').length === 0;
    } finally {
      profileShare.closeProfileShareModal();
      state.profiles = saved.profiles;
      state.currentProfile = saved.currentProfile;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      if (saved.importedRaw == null) await cryptoStore.encryptedRemoveItem(profileKey);
      else await cryptoStore.encryptedSetItem(profileKey, saved.importedRaw);
      window.fetch = saved.fetch;
      if (saved.clipboardOwn) {
        Object.defineProperty(navigator, 'clipboard', saved.clipboardOwn);
      } else {
        delete navigator.clipboard;
      }
      document.querySelectorAll('.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, {
    cryptoUrl: moduleUrl('/js/crypto.js'),
    profileUrl: moduleUrl('/js/profile.js'),
    shareUrl: moduleUrl('/js/profile-share.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('profile share module covers deep-link parsing and close paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ shareUrl }) => {
    const profileShare = await import(shareUrl);
    const outcomes = {};
    const originalUrl = `${location.pathname}${location.search}${location.hash}`;
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    try {
      profileShare.closeProfileShareModal();
      profileShare.openSharedProfileImportModal('short');
      outcomes.rejectsInvalidShareIds = !document.getElementById('profile-share-overlay');

      const firstId = 'abcdefghijklmnopqrstuvwx';
      profileShare.openSharedProfileImportModal(firstId);
      const overlay = document.getElementById('profile-share-overlay');
      outcomes.opensLoadModalForValidId = overlay?.querySelector('.gb-modal-title')?.textContent === 'Load Shared Profile'
        && overlay.querySelector('.gb-modal-kicker')?.textContent === 'Encrypted Link'
        && overlay.querySelector('[data-profile-share-form="load"]')?.dataset.shareId === firstId
        && overlay.querySelector('#profile-share-load-password')?.getAttribute('type') === 'password';

      overlay.click();
      outcomes.backdropClosesLoader = !document.getElementById('profile-share-overlay');

      const secondId = 'zyxwvutsrqponmlkjihg';
      history.pushState(null, '', `#share/${secondId}`);
      outcomes.hashParserReadsShareRoute = profileShare.parseProfileShareIdFromLocation() === secondId;
      profileShare.handleProfileShareDeepLink();
      await waitFor(() => !!document.getElementById('profile-share-overlay'), 'deep-link modal');
      outcomes.deepLinkHandlerOpensOnce = document.querySelectorAll('#profile-share-overlay').length === 1
        && document.querySelector('[data-profile-share-form="load"]')?.dataset.shareId === secondId;

      profileShare.handleProfileShareDeepLink();
      outcomes.deepLinkHandlerSkipsDuplicate = document.querySelectorAll('#profile-share-overlay').length === 1
        && document.querySelector('[data-profile-share-form="load"]')?.dataset.shareId === secondId;

      document.querySelector('[data-profile-share-action="close"]')?.click();
      outcomes.closeButtonRemovesLoader = !document.getElementById('profile-share-overlay');
    } finally {
      profileShare.closeProfileShareModal();
      profileShare.resetProfileShareDeepLinkState();
      history.replaceState(null, '', originalUrl);
    }

    return outcomes;
  }, {
    shareUrl: moduleUrl('/js/profile-share.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
