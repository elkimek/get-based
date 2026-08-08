import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?syncActionsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sync save hooks and messenger cover debounce and gateway paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ saveHooksUrl, messengerUrl, labContextUrl }) => {
    const [{ state }, saveHooks, messenger, labContext] = await Promise.all([
      import('/js/state.js'),
      import(saveHooksUrl),
      import(messengerUrl),
      import(labContextUrl),
    ]);
    const outcomes = {};
    const pushes = [];
    const fetches = [];
    const debugCalls = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const decodeBase64 = value => {
      const binary = atob(value);
      return Uint8Array.from(binary, char => char.charCodeAt(0));
    };
    const decryptAgentContext = async envelope => {
      const rawKey = Uint8Array.from({ length: 32 }, (_, index) => index);
      const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
      const plaintext = await crypto.subtle.decrypt({
        name: 'AES-GCM',
        iv: decodeBase64(envelope.iv),
        additionalData: new TextEncoder().encode(`getbased-agent-context-v2:${profileId}`),
      }, key, decodeBase64(envelope.ciphertext));
      return new TextDecoder().decode(plaintext);
    };
    const profileId = 'sync-hooks-active';
    const storageKeys = [
      'labcharts-messenger-enabled',
      'labcharts-messenger-token',
      'labcharts-agent-context-key',
    ];
    const saved = {
      currentProfile: state.currentProfile,
      importedData: clone(state.importedData),
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      addEventListener: window.addEventListener,
      removeEventListener: window.removeEventListener,
      fetch: window.fetch,
      storage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
      chatLock: sessionStorage.getItem('labcharts-chat-local-lock-until'),
    };
    let enabled = true;
    let ready = true;
    let syncing = false;
    let timerId = 1;
    const timers = new Map();
    const boundListeners = [];
    const runPendingTimers = async (cycles = 1) => {
      for (let cycle = 0; cycle < cycles; cycle += 1) {
        const pending = Array.from(timers.entries()).filter(([, timer]) => !timer.cleared);
        if (!pending.length) return;
        for (const [id, timer] of pending) {
          if (!timers.has(id) || timer.cleared) continue;
          timers.delete(id);
          await timer.fn();
          await Promise.resolve();
        }
      }
    };

    try {
      window.setTimeout = (fn, ms) => {
        const id = timerId++;
        timers.set(id, { fn, ms, cleared: false });
        return id;
      };
      window.clearTimeout = id => {
        const timer = timers.get(id);
        if (timer) timer.cleared = true;
        timers.delete(id);
      };
      window.addEventListener = (type, listener, options) => {
        if (type === 'labcharts-ai-settings-local-changed') {
          boundListeners.push({ type, listener, options });
        }
        return saved.addEventListener.call(window, type, listener, options);
      };
      window.fetch = async (url, options = {}) => {
        fetches.push({ url: String(url), options: clone(options) });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };
      state.currentProfile = profileId;
      state.importedData = {
        entries: [{ date: '2026-06-09', markers: { metabolic: { glucose: 4.9 } } }],
        contextSourceSettings: {
          'insight-cards': false,
          'light-sun': false,
        },
        healthGoals: [
          { severity: 'major', text: 'Restore stable morning energy' },
          { severity: 'mild', text: 'Improve training recovery' },
        ],
        diagnoses: {
          conditions: [{ name: 'Hashimoto thyroiditis', severity: 'moderate', status: 'controlled', since: '2021' }],
          familyHistory: [{ relative: 'maternal_grandmother', condition: 'Type 2 diabetes', onsetAge: 55, note: 'required insulin' }],
          proceduresNote: 'Appendectomy in 2019',
          flags: {
            lowMuscleMass: true,
            hormoneTherapy: true,
            postmenopause: true,
            intenseTrainingRecent: true,
            acuteIllnessNearDraw: true,
          },
          note: 'Medical-history agent sentinel',
        },
        diet: {
          type: 'mediterranean',
          pattern: '3 meals/day',
          proteinIntake: '1.2–1.6 g/kg/day',
          hydration: '2–3 L/day',
          restrictions: ['gluten-free'],
          alcohol: 'none',
          caffeine: 'none',
          caffeineTiming: 'morning only',
          recentChanges: ['recent major diet change'],
          breakfast: 'Greek yogurt and berries',
          breakfastTime: '07:30',
          lunch: 'Lentil salad',
          lunchTime: '12:30',
          dinner: 'Salmon and vegetables',
          dinnerTime: '18:15',
          snacks: 'Walnuts',
          snacksTime: '15:00',
          bowelFrequency: '1x/day',
          stoolConsistency: 'smooth',
          bloating: 'none',
          gas: 'none',
          acidReflux: 'none',
          burping: 'none',
          nausea: 'none',
          appetite: 'normal',
          abdominalPain: 'none',
          foodSensitivities: ['histamine'],
          note: 'Diet agent sentinel',
        },
        exercise: {
          frequency: '3-4x/week',
          types: ['strength', 'physiotherapy / rehab'],
          intensity: 'moderate',
          duration: '60-90 min',
          dailyMovement: 'some walking',
          muscleContext: 'muscular',
          limitations: ['poor recovery'],
          note: 'Exercise agent sentinel',
        },
        sleepRest: {
          duration: '7-8h',
          quality: 'good',
          daytimeSleepiness: 'sometimes',
          apneaStatus: 'not suspected',
          papUse: 'not applicable',
          naps: 'none',
          schedule: 'consistent',
          roomTemp: 'cool (18-20°C / 65-68°F)',
          issues: ['waking at night'],
          environment: ['blackout curtains'],
          practices: ['evening magnesium'],
          note: 'Sleep agent sentinel',
        },
        lightCircadian: {
          amLight: 'sunrise outdoor (10+ min)',
          daytime: '1-2h outdoor',
          uvExposure: 'midday sun when possible',
          skinType: 'III — medium',
          evening: ['dim lights after sunset'],
          screenTime: '4-8h',
          techEnv: ['phone in bedroom'],
          cold: 'cold shower',
          grounding: 'barefoot occasionally',
          mealTiming: ['early dinner (before 6pm)'],
          note: 'Light agent sentinel',
        },
        stress: {
          level: 'moderate',
          duration: '6-12 months',
          trend: 'improving',
          sources: ['work'],
          management: ['nature'],
          note: 'Stress agent sentinel',
        },
        loveLife: {
          status: 'married',
          relationship: 'supportive & secure',
          satisfaction: 'satisfied',
          libido: 'normal',
          libidoChange: 'unchanged',
          frequency: 'weekly',
          orgasm: 'usually',
          concerns: ['mismatched libido'],
          reproductiveGoals: ['pregnancy planning'],
          note: 'Love-life agent sentinel',
        },
        environment: {
          setting: 'urban residential',
          climate: 'temperate',
          altitude: 'moderate altitude (1,500-2,500 m)',
          inhaledExposures: ['secondhand smoke'],
          occupationalExposures: ['solvents'],
          water: 'glacier water',
          waterConcerns: ['unknown source quality'],
          emf: ['WiFi router nearby'],
          emfMitigation: ['WiFi off at night'],
          homeLight: 'mostly LED lighting',
          air: ['agricultural area / crop spraying nearby'],
          toxins: ['mold exposure'],
          building: 'old building (pre-1970)',
          note: 'Environment agent sentinel',
        },
        interpretiveLens: 'Prioritize mechanistic circadian interpretation.',
        contextNotes: 'Additional-context agent sentinel',
      };
      labContext.invalidateLabContextCache();
      localStorage.setItem('labcharts-messenger-enabled', 'false');
      localStorage.removeItem('labcharts-messenger-token');
      sessionStorage.removeItem('labcharts-chat-local-lock-until');

      saveHooks.clearSyncSaveTimers();
      saveHooks.onDataSaved({ immediate: true });
      saveHooks.onChatSaved();
      saveHooks.onProfileSaved('default-gated', { entries: [] });
      outcomes.defaultSaveHookDependenciesGateWork = pushes.length === 0 && timers.size === 0;

      saveHooks.configureSyncSaveHooks({
        isSyncEnabled: () => true,
      });
      saveHooks.onDataSaved({ immediate: true });
      outcomes.defaultEvoluReadyGateSkipsDataPush = pushes.length === 0 && timers.size === 0;

      saveHooks.configureSyncSaveHooks({
        isEvoluReady: () => true,
      });
      saveHooks.onDataSaved({ immediate: true });
      await Promise.resolve();
      outcomes.defaultPushProfileNoopAllowsImmediateDataSave = pushes.length === 0 && timers.size === 0;

      saveHooks.configureSyncSaveHooks({
        pushProfile: async (id, data, options) => {
          pushes.push({ id, data: clone(data), options: clone(options || null) });
        },
        isSyncEnabled: () => enabled,
        isEvoluReady: () => ready,
        isSyncing: () => syncing,
      });

      saveHooks.onDataSaved({ immediate: true });
      outcomes.immediateDataSavePushesActiveProfile = pushes.length === 1
        && pushes[0].id === profileId
        && pushes[0].data.entries?.[0]?.markers?.metabolic?.glucose === 4.9;

      saveHooks.onChatSaved();
      await runPendingTimers();
      outcomes.chatSaveMarksLocalAndDebouncesPush = pushes.length === 2
        && pushes[1].id === profileId
        && Number(sessionStorage.getItem('labcharts-chat-local-lock-until') || '0') > Date.now();

      saveHooks.onProfileSaved('profile-fallback', { notes: [{ text: 'fallback data' }] });
      await runPendingTimers();
      outcomes.profileSaveUsesProvidedFallbackData = pushes.length === 3
        && pushes[2].id === 'profile-fallback'
        && pushes[2].data.notes?.[0]?.text === 'fallback data';

      ready = false;
      saveHooks.onProfileSaved('profile-retry', { notes: [{ text: 'retry data' }] });
      await runPendingTimers();
      outcomes.profileSaveRetriesUntilEvoluReady = pushes.length === 3
        && Array.from(timers.values()).some(timer => timer.ms === 1000);
      ready = true;
      await runPendingTimers();
      outcomes.profileRetryFlushPushesAfterReady = pushes.length === 4
        && pushes[3].id === 'profile-retry'
        && pushes[3].data.notes?.[0]?.text === 'retry data';

      saveHooks.bindSyncSaveHookEvents();
      saveHooks.bindSyncSaveHookEvents();
      window.dispatchEvent(new Event('labcharts-ai-settings-local-changed'));
      await runPendingTimers();
      outcomes.aiSettingsEventDebouncesSingleProfilePush = pushes.length === 5
        && pushes[4].id === profileId
        && pushes[4].data.entries?.[0]?.date === '2026-06-09';

      syncing = true;
      window.dispatchEvent(new Event('labcharts-ai-settings-local-changed'));
      await runPendingTimers();
      outcomes.aiSettingsPushRetriesWhileEvoluIsBusy = pushes.length === 5
        && Array.from(timers.values()).some(timer => timer.ms === 1000);
      syncing = false;
      await runPendingTimers();
      outcomes.aiSettingsRetryFlushesAfterEvoluIsReady = pushes.length === 6
        && pushes[5].id === profileId;

      localStorage.setItem('labcharts-messenger-enabled', 'true');
      localStorage.setItem('labcharts-messenger-token', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
      const testOwner = { id: 'MDEyMzQ1Njc4OWFiY2RlZg', writeKey: new Uint8Array(32).fill(7) };
      messenger.migrateLocalAgentAccessToProfile();
      messenger.configureSyncMessenger({
        getAppOwner: () => testOwner,
        buildLabContext: labContext.buildLabContext,
      });
      messenger.pushContextToGateway();
      await runPendingTimers();
      const defaultGateway = fetches.at(-1);
      const defaultGatewayBody = JSON.parse(defaultGateway.options?.body || '{}');
      const defaultGatewayContext = JSON.parse(defaultGatewayBody.context || '{}');
      const decryptedAgentContext = await decryptAgentContext(defaultGatewayContext.encryptedContext);
      outcomes.messengerDefaultRelayPushesEncryptedContext = defaultGateway?.url === 'https://sync.getbased.health/api/context'
        && defaultGateway.options?.headers?.Authorization === 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        && defaultGatewayBody.profileId === profileId
        && defaultGatewayBody.ownerId === 'MDEyMzQ1Njc4OWFiY2RlZg'
        && typeof defaultGatewayBody.timestamp === 'number'
        && /^[0-9a-f]{64}$/.test(defaultGatewayBody.signature || '')
        && typeof defaultGatewayBody.context === 'string'
        && !defaultGatewayBody.context.includes('2026-06-09')
        && defaultGatewayContext.encryptedContext?.version === 2
        && defaultGatewayContext.encryptedContext?.alg === 'AES-256-GCM'
        && defaultGatewayContext.encryptedContext?.keyDerivation === 'raw-256-bit-key'
        && typeof defaultGatewayContext.encryptedContext?.keyId === 'string'
        && !('salt' in defaultGatewayContext.encryptedContext)
        && typeof defaultGatewayContext.encryptedContext?.iv === 'string'
        && typeof defaultGatewayContext.encryptedContext?.ciphertext === 'string'
        && !defaultGatewayContext.encryptedContext.ciphertext.includes('2026-06-09');
      const redesignedContextFragments = [
        '[section:healthGoals]',
        'Restore stable morning energy',
        'Improve training recovery',
        'Prioritize mechanistic circadian interpretation.',
        'Hashimoto thyroiditis (moderate, controlled, since 2021)',
        'maternal grandmother: Type 2 diabetes, onset age 55 — required insulin',
        'Appendectomy in 2019',
        'Low muscle mass / creatinine may be unreliable',
        'Hormone therapy / TRT / hormonal contraception',
        'Postmenopause / no active cycle',
        'Recent intense training near blood draw',
        'Acute illness / infection / injury near blood draw',
        'Medical-history agent sentinel',
        'Protein intake: 1.2–1.6 g/kg/day',
        'Daily fluid intake: 2–3 L/day',
        'Alcohol: none',
        'Caffeine: none',
        'Latest caffeine: morning only',
        'Recent changes: recent major diet change',
        'Greek yogurt and berries',
        'Lentil salad',
        'Salmon and vegetables',
        'Walnuts',
        'Bowel frequency: 1x/day',
        'Stool consistency: smooth',
        'Bloating: none',
        'Gas: none',
        'Acid reflux: none',
        'Burping: none',
        'Nausea: none',
        'Appetite: normal',
        'Abdominal pain: none',
        'Food sensitivities: histamine',
        'Diet agent sentinel',
        'Frequency: 3-4x/week',
        'Types: strength, physiotherapy / rehab',
        'Intensity: moderate',
        'Typical session: 60-90 min',
        'Daily movement: some walking',
        'Muscle context: muscular',
        'Limitations / recovery: poor recovery',
        'Exercise agent sentinel',
        'Duration: 7-8h',
        'Quality: good',
        'Daytime sleepiness: sometimes',
        'Sleep apnea: not suspected',
        'PAP / CPAP: not applicable',
        'Naps: none',
        'Schedule: consistent',
        'Room temp: cool (18-20°C / 65-68°F)',
        'Issues: waking at night',
        'Environment: blackout curtains',
        'Practices: evening magnesium',
        'Sleep agent sentinel',
        'Morning light: sunrise outdoor (10+ min)',
        'Daytime outdoor: 1-2h outdoor',
        'UV exposure: midday sun when possible',
        'Skin type: III — medium',
        'Evening light: dim lights after sunset',
        'Daily screen time: 4-8h',
        'Tech environment: phone in bedroom',
        'Cold exposure: cold shower',
        'Grounding: barefoot occasionally',
        'Meal timing: early dinner (before 6pm)',
        'Light agent sentinel',
        'Level: moderate',
        'Duration: 6-12 months',
        'Trend: improving',
        'Sources: work',
        'Management: nature',
        'Stress agent sentinel',
        'Status: married',
        'Relationship quality: supportive & secure',
        'Satisfaction: satisfied',
        'Libido: normal',
        'Libido change: unchanged',
        'Sexual frequency: weekly',
        'Orgasm: usually',
        'Concerns: mismatched libido',
        'Reproductive goals: pregnancy planning',
        'Love-life agent sentinel',
        'Setting: urban residential',
        'Climate: temperate',
        'Altitude exposure: moderate altitude (1,500-2,500 m)',
        'Smoking / inhaled exposure: secondhand smoke',
        'Work / hobby exposures: solvents',
        'Water: glacier water',
        'Water concerns: unknown source quality',
        'EMF exposure: WiFi router nearby',
        'EMF mitigation: WiFi off at night',
        'Home lighting: mostly LED lighting',
        'Air quality: agricultural area / crop spraying nearby',
        'Toxin exposure: mold exposure',
        'Building: old building (pre-1970)',
        'Environment agent sentinel',
        'Additional-context agent sentinel',
      ];
      outcomes.messengerEncryptedPayloadCarriesEveryRedesignedContextField =
        redesignedContextFragments.every(fragment => decryptedAgentContext.includes(fragment));

      messenger.configureSyncMessenger({
        getSyncRelay: () => 'ws://relay.local',
        debug: (...args) => { debugCalls.push(args.map(String).join(' ')); },
      });
      messenger.pushContextToGateway();
      await runPendingTimers();
      const customGateway = fetches.at(-1);
      outcomes.messengerCustomRelayNormalizesWsAndDebugs = customGateway?.url === 'http://relay.local/api/context'
        && debugCalls.some(message => message.includes('Encrypted context pushed to gateway'));

      messenger.revokeMessengerToken();
      const beforeDisabledPush = fetches.length;
      const beforeDisabledTimers = timers.size;
      messenger.pushContextToGateway();
      outcomes.messengerDisabledTokenDoesNotSchedule = fetches.length === beforeDisabledPush
        && timers.size === beforeDisabledTimers
        && messenger.isMessengerEnabled() === false
        && messenger.getMessengerToken() === null;
    } finally {
      saveHooks.configureSyncSaveHooks({
        pushProfile: async () => {},
        isSyncEnabled: () => false,
        isEvoluReady: () => false,
        isSyncing: () => false,
      });
      saveHooks.clearSyncSaveTimers();
      messenger.configureSyncMessenger({ getSyncRelay: () => 'wss://sync.getbased.health', debug: () => {} });
      labContext.invalidateLabContextCache();
      state.currentProfile = saved.currentProfile;
      state.importedData = saved.importedData;
      for (const { type, listener, options } of boundListeners) {
        saved.removeEventListener.call(window, type, listener, options);
      }
      window.setTimeout = saved.setTimeout;
      window.clearTimeout = saved.clearTimeout;
      window.addEventListener = saved.addEventListener;
      window.removeEventListener = saved.removeEventListener;
      window.fetch = saved.fetch;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      if (saved.chatLock == null) sessionStorage.removeItem('labcharts-chat-local-lock-until');
      else sessionStorage.setItem('labcharts-chat-local-lock-until', saved.chatLock);
    }

    return outcomes;
  }, {
    saveHooksUrl: moduleUrl('/js/sync-save-hooks.js'),
    messengerUrl: moduleUrl('/js/sync-messenger.js'),
    labContextUrl: moduleUrl('/js/lab-context.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync action delegates push force pull and all-profile paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ actionsUrl }) => {
    const [{ state }, actions, profile] = await Promise.all([
      import('/js/state.js'),
      import(actionsUrl),
      import('/js/profile.js'),
    ]);
    const outcomes = {};
    const pushes = [];
    const pulls = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const profileId = 'sync-actions-active';
    const otherProfileId = 'sync-actions-other';
    const otherDataKey = profile.profileStorageKey(otherProfileId, 'imported');
    const storageKeys = [
      'labcharts-active-profile',
      'labcharts-profiles',
      otherDataKey,
      'labcharts-messenger-enabled',
      'labcharts-messenger-token',
    ];
    const saved = {
      profiles: clone(state.profiles),
      currentProfile: state.currentProfile,
      importedData: clone(state.importedData),
      storage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
    };

    try {
      state.currentProfile = profileId;
      state.importedData = { entries: [{ date: '2026-06-07', markers: { metabolic: { glucose: 5.2 } } }] };
      state.profiles = [
        { id: profileId, name: 'Sync Active', createdAt: Date.now(), lastUpdated: Date.now() },
        { id: otherProfileId, name: 'Sync Other', createdAt: Date.now(), lastUpdated: Date.now() },
      ];
      localStorage.setItem('labcharts-active-profile', profileId);
      localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
      localStorage.setItem(otherDataKey, JSON.stringify({ notes: [{ text: 'other profile' }] }));
      localStorage.setItem('labcharts-messenger-enabled', 'false');
      localStorage.removeItem('labcharts-messenger-token');

      await actions.pushCurrentProfile();
      await actions.syncNow();
      await actions.forceResendCurrentProfile();
      outcomes.defaultActionDependenciesAreSafeNoops = pushes.length === 0 && pulls.length === 0;
      actions.configureSyncActions({
        isEvoluReady: () => true,
        pushProfile: async (id, data, options) => {
          pushes.push({ id, data: clone(data), options: clone(options || null) });
        },
      });
      await actions.forceResendCurrentProfile();
      outcomes.defaultSyncEnabledDependencyGatesForceResend = pushes.length === 0;

      let enabled = false;
      let ready = false;
      actions.configureSyncActions({
        pushProfile: async (id, data, options) => {
          pushes.push({ id, data: clone(data), options: clone(options || null) });
        },
        forcePull: () => { pulls.push('pull'); },
        isSyncEnabled: () => enabled,
        isEvoluReady: () => ready,
        isSyncing: () => false,
        getProfiles: () => state.profiles || [],
        createDefaultProfileData: profile.createDefaultProfileData,
      });

      await actions.forceResendCurrentProfile();
      outcomes.forceResendDisabledDoesNotPush = pushes.length === 0
        && Array.from(document.querySelectorAll('.notification-toast.warning'))
          .some(toast => toast.textContent.includes('Sync is not enabled'));

      enabled = true;
      ready = true;
      await actions.pushCurrentProfile();
      outcomes.pushCurrentProfileUsesActiveState = pushes.length === 1
        && pushes[0].id === profileId
        && pushes[0].data.entries?.[0]?.markers?.metabolic?.glucose === 5.2;

      await actions.forceResendCurrentProfile();
      outcomes.forceResendUsesForceOption = pushes.some(call => call.id === profileId && call.options?.force === true);

      await actions.syncNow();
      outcomes.syncNowPushesThenPulls = pushes.filter(call => call.id === profileId).length === 3
        && pulls.length === 1;

      await actions.pushAllProfiles({ force: true });
      const allProfilePushes = pushes.slice(-2);
      const activeProfilePush = allProfilePushes.find(call => call.id === profileId);
      const otherProfilePush = allProfilePushes.find(call => call.id === otherProfileId);
      outcomes.pushAllProfilesReadsCurrentAndStoredData = allProfilePushes.length === 2
        && activeProfilePush?.data.entries?.[0]?.date === '2026-06-07'
        && otherProfilePush?.data.notes?.[0]?.text === 'other profile'
        && allProfilePushes.every(call => call.options?.force === true);

      actions.bindSyncActionEvents();
      actions.clearSyncActionTimers();
      outcomes.bindAndClearActionEventsReturn = true;
    } finally {
      actions.configureSyncActions({
        pushProfile: async () => {},
        forcePull: () => {},
        isSyncEnabled: () => false,
        isEvoluReady: () => false,
        isSyncing: () => false,
        getProfiles: () => [],
        createDefaultProfileData: () => ({ entries: [] }),
      });
      actions.clearSyncActionTimers();
      state.profiles = saved.profiles;
      state.currentProfile = saved.currentProfile;
      state.importedData = saved.importedData;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      document.querySelectorAll('.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, { actionsUrl: moduleUrl('/js/sync-actions.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync indicator popover renders debug actions and copies activity', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ uiUrl }) => {
    const [syncUi, syncState, settingsBridge] = await Promise.all([
      import(uiUrl),
      import('/js/sync-state.js'),
      import('/js/settings-runtime-bridge.js'),
    ]);
    const outcomes = {};
    const copied = [];
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const saved = {
      debug: localStorage.getItem('labcharts-debug'),
      clipboardOwn: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
    };
    let enabled = false;
    const slot = document.getElementById('sync-indicator-slot') || document.createElement('div');
    const actionCalls = [];
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      openSettingsModal: tab => { actionCalls.push(`settings:${tab}`); },
    });
    const previousSyncUIDeps = syncUi.configureSyncUI();

    try {
      slot.id = 'sync-indicator-slot';
      if (!slot.parentNode) document.body.appendChild(slot);
      localStorage.setItem('labcharts-debug', 'true');
      syncState.resetSyncStatus();
      syncUi.initSyncUIDelegates();

      slot.innerHTML = '<span>stale</span>';
      syncUi.renderSyncIndicator();
      outcomes.defaultSyncUIEnabledDependencyClearsSlot = slot.innerHTML === '';

      syncUi.configureSyncUI({
        isSyncEnabled: () => enabled,
        syncNow: () => { actionCalls.push('sync-now'); },
        forceResendCurrentProfile: () => { actionCalls.push('force-resend'); },
        cleanStorage: async () => { actionCalls.push('clean-storage'); },
        checkRelayConnection: async () => {
          actionCalls.push('test-relay');
          return true;
        },
        showSyncDiagnose: () => { actionCalls.push('diagnose'); },
      });

      syncUi.renderSyncIndicator();
      outcomes.disabledRenderClearsSlot = slot.innerHTML === '';

      enabled = true;
      syncState.updateSyncStatus({ relay: 'connected', push: 'confirmed', pushConfirmedAt: Date.now() - 2_000 });
      syncUi.renderSyncIndicator();
      outcomes.enabledRenderShowsSyncedDot = !!slot.querySelector('#sync-indicator-btn .sync-dot-synced');

      syncState.updateSyncStatus({ push: 'pending', pushStartedAt: Date.now() });
      syncUi.updateSyncIndicator();
      outcomes.updateReflectsSyncingState = !!slot.querySelector('#sync-indicator-btn .sync-dot-syncing');

      syncState.logSyncEvent('push', 'profile abc pushed');
      syncState.logSyncEvent('skip', 'stale profile skipped');
      syncState.updateSyncStatus({
        relay: 'unreachable',
        push: 'error',
        lastError: { type: 'PushStuck', at: Date.now() - 30_000 },
      });

      syncUi.toggleSyncDetail();
      const popover = document.getElementById('sync-popover');
      if (!popover) throw new Error('sync popover did not render');
      outcomes.popoverShowsDebugEventsAndActions = popover?.textContent.includes('Recent activity') === true
        && popover?.textContent.includes('Force resend') === true
        && popover?.textContent.includes('Reload') === true
        && popover?.textContent.includes('Sync status') === true;
      outcomes.popoverUsesDelegatedActions =
        !popover.querySelector('[onclick],[onchange],[oninput],[onkeydown],[onsubmit]')
        && !!popover.querySelector('[data-sync-ui-action="copy-events"]')
        && !!popover.querySelector('[data-sync-ui-action="sync-now"]')
        && !!popover.querySelector('[data-sync-ui-action="force-resend"]')
        && !!popover.querySelector('[data-sync-ui-action="clean-storage"]')
        && !!popover.querySelector('[data-sync-ui-action="test-relay"]')
        && !!popover.querySelector('[data-sync-ui-action="show-diagnose"]');

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async value => copied.push(String(value || '')) },
      });
      const copyBtn = popover.querySelector('button[title="Copy events to clipboard"]');
      if (!copyBtn) throw new Error('sync activity copy button did not render');
      copyBtn.click();
      await waitFor(() => copied.length === 1, 'clipboard write');
      outcomes.copySyncEventsUsesClipboard = copied[0].includes('Sync activity')
        && copied[0].includes('profile abc pushed')
        && copyBtn.textContent.includes('Copied');

      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: null });
      await syncUi.copySyncEvents(null);
      outcomes.copyFallbackRendersTextarea = !!document.querySelector('textarea')
        && Array.from(document.querySelectorAll('.notification-toast.warning'))
          .some(toast => toast.textContent.includes('Auto-copy blocked'));
      document.querySelector('textarea')?.dispatchEvent(new Event('blur'));

      const clickPopoverAction = async action => {
        const btn = document.querySelector(`#sync-popover [data-sync-ui-action="${action}"]`);
        if (!btn) throw new Error(`missing sync popover action: ${action}`);
        btn.click();
        await Promise.resolve();
      };
      await clickPopoverAction('test-relay');
      await waitFor(() => actionCalls.includes('test-relay'), 'test-relay delegate');
      await waitFor(
        () => Array.from(document.querySelectorAll('.notification-toast'))
          .some(toast => toast.textContent.includes('Relay reachable')),
        'test-relay success notification'
      );
      syncUi.configureSyncUI({
        checkRelayConnection: async () => {
          actionCalls.push('test-relay-error');
          throw new Error('relay offline');
        },
      });
      await clickPopoverAction('test-relay');
      await waitFor(
        () => Array.from(document.querySelectorAll('.notification-toast.error'))
          .some(toast => toast.textContent.includes('Relay check failed: relay offline')),
        'test-relay error notification'
      );
      await clickPopoverAction('show-diagnose');
      await waitFor(() => actionCalls.includes('diagnose'), 'diagnose delegate');
      await clickPopoverAction('open-settings');
      await waitFor(() => !document.getElementById('sync-popover'), 'settings delegate closes popover');
      syncUi.toggleSyncDetail();
      await clickPopoverAction('sync-now');
      await waitFor(() => actionCalls.includes('sync-now') && !document.getElementById('sync-popover'), 'sync-now delegate');
      syncUi.toggleSyncDetail();
      await clickPopoverAction('force-resend');
      await waitFor(() => actionCalls.includes('force-resend') && !document.getElementById('sync-popover'), 'force-resend delegate');
      syncUi.toggleSyncDetail();
      await clickPopoverAction('clean-storage');
      await waitFor(() => actionCalls.includes('clean-storage') && !document.getElementById('sync-popover'), 'clean-storage delegate');
      outcomes.popoverDelegatesRouteActions = ['test-relay', 'diagnose', 'settings:data', 'sync-now', 'force-resend', 'clean-storage']
        .every(action => actionCalls.includes(action));
      outcomes.popoverRelayDelegateSurfacesErrors = actionCalls.includes('test-relay-error');

      syncUi.toggleSyncDetail();
      syncUi.toggleSyncDetail();
      outcomes.secondToggleClosesPopover = !document.getElementById('sync-popover');

      syncUi.toggleSyncDetail();
      if (!document.getElementById('sync-popover')) throw new Error('sync popover did not reopen');
      const originalAppendChild = Element.prototype.appendChild;
      let popoverAppendCount = 0;
      Element.prototype.appendChild = function(node) {
        if (node?.id === 'sync-popover') popoverAppendCount += 1;
        return originalAppendChild.call(this, node);
      };
      try {
        syncState.updateSyncStatus({ push: 'confirmed', pushConfirmedAt: Date.now(), lastError: null, relay: 'connected' });
        popoverAppendCount = 0;
        syncUi.bindSyncUIStatusUpdates();
        syncUi.bindSyncUIStatusUpdates();
        syncState.updateSyncStatus({ push: 'pending', pushStartedAt: Date.now(), lastError: null, relay: 'connected' });
        await waitFor(() => popoverAppendCount >= 1, 'status-bound popover repaint');
        outcomes.bindStatusUpdatesIsIdempotent = popoverAppendCount === 1
          && !!document.getElementById('sync-popover')
          && !!slot.querySelector('#sync-indicator-btn .sync-dot-syncing');
      } finally {
        Element.prototype.appendChild = originalAppendChild;
      }
    } finally {
      syncUi.configureSyncUI(previousSyncUIDeps);
      syncState.resetSyncStatus();
      if (saved.debug == null) localStorage.removeItem('labcharts-debug');
      else localStorage.setItem('labcharts-debug', saved.debug);
      if (saved.clipboardOwn) Object.defineProperty(navigator, 'clipboard', saved.clipboardOwn);
      else delete navigator.clipboard;
      settingsBridge.configureSettingsModuleBridge(previousSettingsBridge);
      document.getElementById('sync-popover')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      document.querySelectorAll('.notification-container').forEach(el => el.remove());
      slot.innerHTML = '';
    }

    return outcomes;
  }, { uiUrl: '/js/sync-ui.js' });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync identity rotation modal covers cancel copy malformed and apply paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ identityUrl }) => {
    // The cache-busted identity module statically imports this canonical
    // singleton, so configuring it here injects deps into that fresh instance.
    const [identityActions, context, confirmRuntime] = await Promise.all([
      import(identityUrl),
      import('/js/sync-diagnose-actions-context.js'),
      import('/js/sync-diagnose-runtime.js'),
    ]);
    const outcomes = {};
    const calls = [];
    const copied = [];
    let confirmAnswer = false;
    const previousConfirmDeps = confirmRuntime.configureSyncDiagnoseRuntimeDeps({
      showConfirmDialog: async message => {
        calls.push(['confirm', message]);
        return confirmAnswer;
      },
    });
    const words = Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' ');
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const saved = {
      bip39: window.bip39,
      qrcode: window.qrcode,
      clipboardOwn: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
    };

    try {
      confirmAnswer = false;
      await identityActions.confirmRotateIdentity(document.body);
      outcomes.cancelStopsBeforeMnemonic = calls.some(call => call[0] === 'confirm')
        && !document.querySelector('[aria-label="Rotate sync identity"]');

      confirmAnswer = true;
      window.bip39 = { generateMnemonic: async () => 'too few words' };
      await identityActions.confirmRotateIdentity(document.body);
      outcomes.malformedMnemonicNotifies = Array.from(document.querySelectorAll('.notification-toast.error'))
        .some(toast => toast.textContent.includes('Generated mnemonic is malformed'));

      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      window.bip39 = { generateMnemonic: async strength => {
        calls.push(['generate', strength]);
        return words;
      } };
      window.qrcode = () => ({
        addData(value) { calls.push(['qr-data', value.split(/\s+/).length]); },
        make() { calls.push(['qr-make']); },
        createSvgTag() { return '<svg data-qr="1"></svg>'; },
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async value => copied.push(String(value || '')) },
      });
      let syncEnabled = false;
      context.configureSyncDiagnoseActionContext({
        isSyncEnabled: () => syncEnabled,
        enableSync: async options => {
          calls.push(['enable', options?.skipPush === true]);
          syncEnabled = true;
          return true;
        },
        restoreFromMnemonic: async (mnemonic, options) => {
          calls.push(['restore', mnemonic.split(/\s+/).length, options?.seedLocal === true]);
          return true;
        },
      });

      await identityActions.confirmRotateIdentity(document.body);
      const overlay = document.querySelector('[aria-label="Rotate sync identity"]')?.closest('.modal-overlay');
      const applyBtn = overlay?.querySelector('#rotate-apply-btn');
      const check = overlay?.querySelector('#rotate-saved-check');
      if (!overlay || !applyBtn || !check) throw new Error('rotate identity modal controls did not render');
      outcomes.rotateModalRendersQrAndGatesApply = overlay?.classList.contains('show') === true
        && !!overlay.querySelector('svg[data-qr="1"]')
        && applyBtn?.disabled === true
        && calls.some(call => call[0] === 'generate' && call[1] === 256)
        && calls.some(call => call[0] === 'qr-data' && call[1] === 24);

      overlay.querySelector('#rotate-copy-btn')?.click();
      await waitFor(() => copied.length === 1, 'mnemonic clipboard copy');
      outcomes.copyMnemonicWritesAllWords = copied[0].split(/\s+/).length === 24
        && overlay.querySelector('#rotate-copy-btn')?.textContent.includes('Copied');

      check.checked = true;
      check.dispatchEvent(new Event('change', { bubbles: true }));
      outcomes.savedCheckboxEnablesApply = applyBtn.disabled === false;

      applyBtn.click();
      await waitFor(() => calls.some(call => call[0] === 'restore'), 'restore after apply');
      outcomes.applyEnablesSyncAndRestoresMnemonic = calls.some(call => call[0] === 'enable' && call[1] === true)
        && calls.some(call => call[0] === 'restore' && call[1] === 24 && call[2] === true)
        && applyBtn.textContent.includes('Applying');
    } finally {
      context.configureSyncDiagnoseActionContext({
        enableSync: async () => false,
        restoreFromMnemonic: async () => false,
        isSyncEnabled: () => false,
      });
      confirmRuntime.configureSyncDiagnoseRuntimeDeps(previousConfirmDeps);
      if (saved.bip39 === undefined) delete window.bip39;
      else window.bip39 = saved.bip39;
      if (saved.qrcode === undefined) delete window.qrcode;
      else window.qrcode = saved.qrcode;
      if (saved.clipboardOwn) Object.defineProperty(navigator, 'clipboard', saved.clipboardOwn);
      else delete navigator.clipboard;
      document.querySelectorAll('.modal-overlay,.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, { identityUrl: moduleUrl('/js/sync-diagnose-identity-actions.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sync actions stay module-only after removing the browser facade', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const [sync, delta, cutover, diagnose, relayHealth] = await Promise.all([
      import('/js/sync.js'),
      import('/js/sync-delta.js'),
      import('/js/sync-cutover.js'),
      import('/js/sync-diagnose-ui.js'),
      import('/js/sync-relay-health.js'),
    ]);
    const formerGlobals = [
      'enableSync',
      'disableSync',
      'getMnemonic',
      'getMnemonicResolutionError',
      'getSyncBlocker',
      'restoreFromMnemonic',
      'isSyncEnabled',
      'pushCurrentProfile',
      'forceResendCurrentProfile',
      'cleanStorage',
      'syncNow',
      'showSyncDiagnose',
      'deleteProfileFromRelay',
      'listPendingTombstones',
      'applyPendingTombstone',
      'rejectPendingTombstone',
      'checkRelayConnection',
      'isMessengerEnabled',
      'getMessengerToken',
      'getMessengerContextKey',
      'generateMessengerToken',
      'generateMessengerContextKey',
      'revokeMessengerToken',
      'pushContextToGateway',
      '_syncDiag',
      '_forcePull',
      'renderSyncIndicator',
      'updateSyncIndicator',
      'toggleSyncDetail',
      'copySyncEvents',
      'copySyncDiagnose',
      'confirmCompactRelay',
      'confirmRotateIdentity',
      'refreshRelayStorage',
      'fetchOwnerStorageFromRelay',
      'verifyPushLanded',
      'getRelayHealthVerdict',
      'compactOwnerSelfServe',
      'getRelayQuotaEstimate',
      'resetRelayQuotaEstimate',
      'getDeltaTelemetry',
      'resetDeltaTelemetry',
      'confirmResetDeltaTelemetry',
      'getDeltaCutoverReadiness',
      'isPhase2CutoverEnabled',
      'enablePhase2Cutover',
      'disablePhase2Cutover',
      'confirmEnablePhase2',
      'confirmDisablePhase2',
      'confirmBackfillBlockers',
    ];
    return {
      formerGlobalsAreAbsent: formerGlobals.every(name => !(name in window)),
      primarySyncExportsRemainCallable:
        typeof sync.enableSync === 'function'
        && typeof sync.disableSync === 'function'
        && typeof sync.syncNow === 'function'
        && typeof sync.generateMessengerToken === 'function',
      specialistSyncExportsRemainCallable:
        typeof delta.getDeltaTelemetry === 'function'
        && typeof cutover.enablePhase2Cutover === 'function'
        && typeof diagnose.showSyncDiagnose === 'function'
        && typeof relayHealth.getRelayQuotaEstimate === 'function',
    };
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
