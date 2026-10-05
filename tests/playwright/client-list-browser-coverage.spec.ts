type ClientProfileFixtureReader = { id?: unknown; pinned?: unknown; status?: unknown; avatar?: unknown };
import { expect, test } from './coverage-fixture.js';

test('client list live menu actions dispatch exports share demos and profile state changes', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(() => import('/js/client-list.js'));

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const clientList = await import('/js/client-list.js');
    const { configureClientListRuntime } = clientList;
    const clientListRuntime = await import('/js/client-list-runtime.js');
    const profile = await import('/js/profile.js');
    const outcomes: Record<string, unknown> = {};
    const calls: unknown[][] = [];
    const confirmQueue: unknown[] = [];
    let previousProfileDeps: ReturnType<typeof profile.configureProfileDeps> | null = null;
    let previousClientListRuntime: ReturnType<typeof configureClientListRuntime> | null = null;
    const clone = (value: unknown): unknown => value == null ? value : JSON.parse(JSON.stringify(value)) as unknown;
    const waitFor = async (predicate: () => unknown | Promise<unknown>, label: string) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const now = Date.now();
    const makeProfile = (id: unknown, name: string, overrides: object = {}): unknown => ({
      id,
      name,
      sex: null,
      dob: null,
      location: { country: '', zip: '' },
      tags: [],
      notes: '',
      status: 'active',
      avatar: null,
      height: null,
      heightUnit: 'cm',
      createdAt: now - 60_000,
      lastUpdated: now - 30_000,
      pinned: false,
      ...overrides,
    });
    const storageKeys = [
      'labcharts-active-profile',
      'labcharts-profiles',
      'labcharts-client-alice-imported',
      'labcharts-client-bob-imported',
      'labcharts-client-bob-units',
      'labcharts-client-bob-suppOverlay',
      'labcharts-client-bob-noteOverlay',
      'labcharts-client-bob-rangeMode',
      'labcharts-client-bob-showAltUnits',
      'labcharts-client-bob-suppImpact',
      'labcharts-client-bob-chat',
      'labcharts-client-bob-chat-threads',
      'labcharts-client-bob-chat-t_thread-a',
      'labcharts-client-bob-chatRailOpen',
      'labcharts-client-bob-chatPersonality',
      'labcharts-client-bob-chatPersonalityCustom',
      'labcharts-client-bob-focusCard',
      'labcharts-client-bob-contextHealth',
      'labcharts-client-bob-onboarded',
      'labcharts-client-bob-emptyTour',
      'labcharts-client-bob-tour',
      'labcharts-client-bob-cycleTour',
      'labcharts-client-bob-phaseOverlay',
    ];
    const saved = {
      profiles: clone(state.profiles),
      currentProfile: state.currentProfile,
      importedData: clone(state.importedData),
      bodyOverflow: document.body.style.overflow,
      storage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
      showConfirmDialog: (window as {showConfirmDialog?: unknown}).showConfirmDialog,
      inputClick: HTMLInputElement.prototype.click,
    };
    const previousClientListRuntimeDeps = clientListRuntime.configureClientListRuntimeDeps({
      renderProfileButton: () => calls.push(['render-profile-button']),
    });
    const openList = async () => {
      await clientList.openClientList();
      await waitFor(() => document.getElementById('client-list-overlay')?.classList.contains('show'), 'client list overlay');
      await waitFor(() => document.activeElement?.id === 'cl-search', 'client list search focus');
    };
    const rowNames = () => [...document.querySelectorAll('.cl-list > .cl-row .cl-row-name')]
      .map(el => el.textContent!.trim());
    const clickAction = (action: unknown, id?: unknown) => {
      const profileSelector = id ? `[data-cl-profile-id="${id}"]` : '';
      document.querySelector<HTMLElement>(`[data-cl-action="${action}"]${profileSelector}`)?.click();
    };
    const openRowMenu = async (id: unknown) => {
      clickAction('toggle-menu', id);
      await waitFor(() => document.getElementById('cl-active-menu')?.classList.contains('show'), `row menu ${id}`);
    };

    try {
      state.currentProfile = 'client-alice';
      (state as {importedData: unknown}).importedData = {
        wearableSummary: { metrics: { weight: { latest: 70 } } },
        genetics: { mtdna: {} },
      };
      (state as {profiles: unknown}).profiles = [
        makeProfile('client-alice', 'Alice Browser', {
          tags: ['vip'],
          notes: 'sleep protocol',
          lastUpdated: now - 10_000,
        }),
        makeProfile('client-bob', 'Bob Browser', {
          tags: ['metabolic'],
          notes: 'glucose follow-up',
          lastUpdated: now - 120_000,
        }),
        makeProfile('client-cara', 'Cara Browser', {
          status: 'archived',
          tags: ['archive'],
          lastUpdated: now - 240_000,
        }),
      ];
      localStorage.setItem('labcharts-active-profile', 'client-alice');
      localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
      localStorage.setItem('labcharts-client-bob-chat-threads', JSON.stringify([{ id: 'thread-a' }]));
      localStorage.setItem('labcharts-client-bob-chat-t_thread-a', JSON.stringify([{ role: 'user', content: 'delete me' }]));
      const exportAllDataJSON = () => calls.push(['export-all']);
      const exportClientJSON = (...args: unknown[]) => calls.push(['export-client', ...args]);
      const importDataJSON = (file: unknown) => calls.push(['import-json', (file as {name?: unknown} | null)?.name || '']);
      const loadDemoData = (demo: unknown) => calls.push(['load-demo', demo]);
      const openProfileShareModal = (id: unknown) => calls.push(['share-profile', id]);
      previousClientListRuntime = configureClientListRuntime({
        exportAllDataJSON,
        exportClientJSON,
        importDataJSON,
        loadDemoData,
        openProfileShareModal,
      });
      (window as {showConfirmDialog?: unknown}).showConfirmDialog = async (message: unknown) => {
        calls.push(['confirm', message]);
        return confirmQueue.shift() === true;
      };
      previousProfileDeps = profile.configureProfileDeps({
        showConfirmDialog: (window as {showConfirmDialog?: unknown}).showConfirmDialog as NonNullable<NonNullable<Parameters<typeof profile.configureProfileDeps>[0]>['showConfirmDialog']>,
      });
      HTMLInputElement.prototype.click = function() {
        calls.push(['input-click', this.id || this.type || 'input']);
      };

      await openList();
      outcomes.opensAndFocusesSearch = document.activeElement?.id === 'cl-search'
        && document.body.style.overflow === 'hidden'
        && rowNames().join('|') === 'Alice Browser|Bob Browser'
        && document.querySelector('.cl-archived-section')?.textContent!.includes('Cara Browser') === true;

      clickAction('toggle-tools-menu');
      outcomes.toolsMenuTogglesOpen = document.getElementById('cl-tools-menu')?.classList.contains('show') === true;
      clickAction('trigger-json-import');
      outcomes.importJsonToolClicksHiddenInput = calls.some(call => call[0] === 'input-click' && call[1] === 'cl-json-import')
        && document.getElementById('cl-tools-menu')?.classList.contains('show') === false;

      const fileInput = (document.getElementById('cl-json-import') as HTMLInputElement | null);
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [new File(['{"version":2}'], 'client-import.json', { type: 'application/json' })],
      });
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
      outcomes.importChangeClosesAndPassesFile = !document.getElementById('client-list-overlay')?.classList.contains('show')
        && calls.some(call => call[0] === 'import-json' && call[1] === 'client-import.json');

      await openList();
      clickAction('toggle-tools-menu');
      clickAction('export-all');
      outcomes.exportAllUsesToolDelegate = calls.some(call => call[0] === 'export-all')
        && document.getElementById('cl-tools-menu')?.classList.contains('show') === false;

      clickAction('toggle-tools-menu');
      document.querySelector<HTMLElement>('[data-cl-action="load-demo"][data-cl-demo="male"]')?.click();
      outcomes.demoActionClosesAndUsesSelectedDemo = !document.getElementById('client-list-overlay')?.classList.contains('show')
        && calls.some(call => call[0] === 'load-demo' && call[1] === 'male');

      await openList();
      await openRowMenu('client-alice');
      clickAction('pin-profile', 'client-alice');
      await waitFor(() => (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-alice')?.pinned === true
        && !!document.querySelector('[data-id="client-alice"] .cl-badge-pinned'), 'durable pin update');
      outcomes.pinActionRerendersPinnedBadge = (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-alice')?.pinned === true
        && !!document.querySelector('[data-id="client-alice"] .cl-badge-pinned');

      await openRowMenu('client-bob');
      clickAction('flag-profile', 'client-bob');
      await waitFor(() => (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-bob')?.status === 'flagged'
        && !!document.querySelector('[data-id="client-bob"] .cl-badge-flagged'), 'durable flag update');
      outcomes.flagActionUpdatesProfileAndButton = (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-bob')?.status === 'flagged'
        && calls.some(call => call[0] === 'render-profile-button')
        && !!document.querySelector('[data-id="client-bob"] .cl-badge-flagged');

      await openRowMenu('client-bob');
      clickAction('unflag-profile', 'client-bob');
      await waitFor(() => (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-bob')?.status === 'active'
        && !document.querySelector('[data-id="client-bob"] .cl-badge-flagged'), 'durable unflag update');
      outcomes.unflagActionReturnsProfileActive = (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-bob')?.status === 'active';

      await openRowMenu('client-alice');
      clickAction('export-profile', 'client-alice');
      await openRowMenu('client-alice');
      clickAction('export-profile-chat', 'client-alice');
      outcomes.rowExportActionsIncludeChatFlag = calls.some(call => call[0] === 'export-client' && call[1] === 'client-alice' && call.length === 2)
        && calls.some(call => call[0] === 'export-client' && call[1] === 'client-alice' && call[2] === true);

      await openRowMenu('client-alice');
      clickAction('share-profile', 'client-alice');
      await waitFor(() => calls.some(call => call[0] === 'share-profile'), 'share modal delegate');
      outcomes.shareActionClosesListAndTargetsProfile = !document.getElementById('client-list-overlay')?.classList.contains('show')
        && calls.some(call => call[0] === 'share-profile' && call[1] === 'client-alice');

      await openList();
      document.querySelector<HTMLSelectElement>('.cl-status-filter')!.value = 'archived';
      document.querySelector<HTMLSelectElement>('.cl-status-filter')!.dispatchEvent(new Event('change', { bubbles: true }));
      await openRowMenu('client-cara');
      clickAction('unarchive-profile', 'client-cara');
      await waitFor(() => (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-cara')?.status === 'active',
        'durable unarchive update');
      outcomes.unarchiveActionRestoresArchivedProfile = (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-cara')?.status === 'active';

      document.querySelector<HTMLSelectElement>('.cl-status-filter')!.value = 'active';
      document.querySelector<HTMLSelectElement>('.cl-status-filter')!.dispatchEvent(new Event('change', { bubbles: true }));
      await openRowMenu('client-bob');
      const confirmCountBeforeCancel = calls.filter(call => call[0] === 'confirm').length;
      confirmQueue.push(false);
      clickAction('delete-profile', 'client-bob');
      await waitFor(() => calls.filter(call => call[0] === 'confirm').length > confirmCountBeforeCancel
        && (state.profiles as ClientProfileFixtureReader[] | null)!.some(p => p.id === 'client-bob')
        && !!document.querySelector('[data-id="client-bob"]'), 'cancel keeps profile row');
      const cancelKeptProfile = (state.profiles as ClientProfileFixtureReader[] | null)!.some(p => p.id === 'client-bob')
        && !!document.querySelector('[data-id="client-bob"]');
      await openRowMenu('client-bob');
      const confirmCountBeforeDelete = calls.filter(call => call[0] === 'confirm').length;
      confirmQueue.push(true);
      clickAction('delete-profile', 'client-bob');
      await waitFor(() => calls.filter(call => call[0] === 'confirm').length > confirmCountBeforeDelete
        && !document.querySelector('[data-id="client-bob"]'), 'confirmed profile delete DOM refresh');
      outcomes.deleteActionHonorsConfirmAndRefreshesList = cancelKeptProfile
        && calls.some(call => call[0] === 'confirm' && (call[1] as string).includes('Delete this profile'))
        && !(state.profiles as ClientProfileFixtureReader[] | null)!.some(p => p.id === 'client-bob')
        && !document.querySelector('[data-id="client-bob"]');

      document.body.click();
      outcomes.outsideClickClosesFloatingMenus = !document.getElementById('cl-active-menu')?.classList.contains('show')
        && !document.getElementById('cl-tools-menu')?.classList.contains('show');
    } finally {
      const sort = document.querySelector<HTMLSelectElement>('.cl-sort');
      if (sort) {
        sort.value = 'lastUpdated';
        sort.dispatchEvent(new Event('change', { bubbles: true }));
      }
      clientList.closeClientList();
      (state as {profiles: unknown}).profiles = saved.profiles;
      state.currentProfile = saved.currentProfile;
      (state as {importedData: unknown}).importedData = saved.importedData;
      document.body.style.overflow = saved.bodyOverflow;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      clientListRuntime.configureClientListRuntimeDeps(previousClientListRuntimeDeps);
      if (previousClientListRuntime) configureClientListRuntime(previousClientListRuntime);
      (window as {showConfirmDialog?: unknown}).showConfirmDialog = saved.showConfirmDialog;
      if (previousProfileDeps) profile.configureProfileDeps(previousProfileDeps);
      HTMLInputElement.prototype.click = saved.inputClick;
      document.querySelectorAll('.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('client list form live actions cover health link avatar haplogroup and location editor', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(() => import('/js/client-list.js'));

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const clientList = await import('/js/client-list.js');
    const clientListRuntime = await import('/js/client-list-runtime.js');
    const dnaBridge = await import('/js/dna-runtime-bridge.js');
    const clientListRuntimeSrc = await fetch('/js/client-list-runtime.js').then(response => response.text());
    const outcomes: Record<string, unknown> = {};
    const calls: unknown[][] = [];
    const clone = (value: unknown): unknown => value == null ? value : JSON.parse(JSON.stringify(value)) as unknown;
    const waitFor = async (predicate: () => unknown | Promise<unknown>, label: string) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const avatarData = 'data:image/png;base64,iVBORw0KGgo=';
    const now = Date.now();
    const storageKeys = ['labcharts-active-profile', 'labcharts-profiles', 'labcharts-ai-provider', 'labcharts-ai-paused', 'labcharts-openrouter-key'];
    const saved = {
      profiles: clone(state.profiles),
      currentProfile: state.currentProfile,
      importedData: clone(state.importedData),
      storage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
      bodyOverflow: document.body.style.overflow,
      inputClick: HTMLInputElement.prototype.click,
      scrollIntoView: Element.prototype.scrollIntoView,
      modalOverlayClass: document.getElementById('modal-overlay')?.className,
      hadWearableStrip: !!document.getElementById('wearable-strip'),
    };
    const navigate = (route: unknown) => calls.push(['navigate', route]);
    const previousClientListRuntimeDeps = clientListRuntime.configureClientListRuntimeDeps({
      navigate,
      renderProfileButton: () => calls.push(['render-profile-button']),
      showNotification: (...args: unknown[]) => calls.push(['notification', ...args]),
    });
    const previousDnaBridge = dnaBridge.configureDnaModuleBridge({
      HAPLOGROUP_LIST: ['H', 'J', 'K'],
      setManualHaplogroup: async (haplogroup: unknown) => {
        calls.push(['haplogroup', haplogroup]);
        state.importedData.genetics!.mtdna = {
          haplogroup,
          coupling: { shortLabel: `Coupled ${haplogroup}` },
        };
      },
    });

    try {
      state.currentProfile = 'client-active';
      (state as {profiles: unknown}).profiles = [{
        id: 'client-active',
        name: 'Active Browser',
        sex: 'female',
        dob: '1980-01-01',
        location: { country: 'Czech Republic', zip: '11000' },
        tags: ['primary'],
        notes: 'avatar and haplogroup',
        status: 'active',
        avatar: avatarData,
        height: 170,
        heightUnit: 'cm',
        createdAt: now - 120_000,
        lastUpdated: now - 60_000,
        pinned: false,
      }];
      (state as {importedData: unknown}).importedData = {
        wearableSummary: { metrics: { weight: { latest: 70 } } },
        genetics: { mtdna: { haplogroup: '', coupling: null } },
      };
      localStorage.setItem('labcharts-active-profile', 'client-active');
      localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.removeItem('labcharts-openrouter-key');
      HTMLInputElement.prototype.click = function() {
        calls.push(['input-click', this.id || this.type || 'input']);
      };
      Element.prototype.scrollIntoView = function() {
        calls.push(['scroll', this.id || this.className || this.tagName]);
      };
      if (!document.getElementById('wearable-strip')) {
        const strip = document.createElement('section');
        strip.id = 'wearable-strip';
        document.body.appendChild(strip);
      }

      await clientList.openClientList();
      clientList.openClientForm('client-active');
      await waitFor(() => !!document.querySelector('.cl-form'), 'client edit form');
      document.querySelector<HTMLElement>('[data-cl-action="health-metrics"]')?.click();
      await waitFor(() => calls.some(call => call[0] === 'navigate'), 'health metrics navigation');
      await waitFor(() => calls.some(call => call[0] === 'scroll'), 'health metrics scroll');
      outcomes.healthMetricsLinkClosesNavigatesAndScrolls = !document.getElementById('client-list-overlay')?.classList.contains('show')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard')
        && calls.some(call => call[0] === 'scroll' && call[1] === 'wearable-strip');
      outcomes.clientListRuntimeUsesInjectedViewCallbacks =
        clientListRuntimeSrc.includes('clientListRuntimeDeps.navigate?.(route)')
        && clientListRuntimeSrc.includes('clientListRuntimeDeps.renderProfileButton?.()')
        && !clientListRuntimeSrc.includes('getViewRuntimeFunction');

      await clientList.openClientList();
      clientList.openClientForm('client-active');
      await waitFor(() => !!document.querySelector('.cl-form'), 'reopened client edit form');
      document.querySelector('.cl-avatar-picker')?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }));
      outcomes.avatarKeyboardOpensFileInput = calls.some(call => call[0] === 'input-click' && call[1] === 'cl-avatar-input');

      document.querySelector<HTMLElement>('[data-cl-action="remove-avatar"]')?.click();
      outcomes.removeAvatarRestoresInitialPreview = !document.querySelector('.cl-avatar-remove')
        && document.getElementById('cl-avatar-img')?.textContent === 'A';

      const haplogroup = (document.getElementById('cl-haplogroup') as HTMLSelectElement | null);
      haplogroup!.value = 'H';
      haplogroup!.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => document.getElementById('cl-hg-coupling')?.textContent === 'Coupled H', 'haplogroup coupling label');
      outcomes.haplogroupChangeUpdatesManualCoupling = calls.some(call => call[0] === 'haplogroup' && call[1] === 'H')
        && state.importedData.genetics!.mtdna.haplogroup === 'H';

      document.querySelector<HTMLFormElement>('.cl-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await waitFor(() => (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-active')?.avatar === null
        && calls.some(call => call[0] === 'notification'
          && call[1] === '"Active Browser" updated'
          && call[2] === 'info'), 'durable client form save');
      const updatedProfile = (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-active');
      outcomes.savePersistsRemovedAvatarAndNotifies = updatedProfile?.avatar === null
        && calls.some(call => call[0] === 'render-profile-button')
        && calls.some(call => call[0] === 'notification' && call[1] === '"Active Browser" updated' && call[2] === 'info');

      document.getElementById('modal-overlay')?.classList.add('show');
      await clientList.openProfileLocationEditor();
      await waitFor(() => document.activeElement?.id === 'cl-country', 'location editor focus');
      outcomes.locationEditorOpensVisibleFormAndHidesOtherModal = document.getElementById('client-list-overlay')?.classList.contains('show') === true
        && !document.getElementById('modal-overlay')?.classList.contains('show')
        && (document.getElementById('cl-country') as HTMLInputElement | null)?.value === 'Czech Republic'
        && calls.some(call => call[0] === 'scroll' && call[1] === 'cl-country');
    } finally {
      clientList.closeClientList();
      (state as {profiles: unknown}).profiles = saved.profiles;
      state.currentProfile = saved.currentProfile;
      (state as {importedData: unknown}).importedData = saved.importedData;
      document.body.style.overflow = saved.bodyOverflow;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      dnaBridge.configureDnaModuleBridge({
        HAPLOGROUP_LIST: null,
        setManualHaplogroup: null,
        ...previousDnaBridge,
      });
      clientListRuntime.configureClientListRuntimeDeps(previousClientListRuntimeDeps);
      HTMLInputElement.prototype.click = saved.inputClick;
      Element.prototype.scrollIntoView = saved.scrollIntoView;
      if (!saved.hadWearableStrip) document.getElementById('wearable-strip')?.remove();
      const modalOverlay = document.getElementById('modal-overlay');
      if (modalOverlay) modalOverlay.className = saved.modalOverlayClass || '';
      document.querySelectorAll('.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('client list remaining browser helpers cover filters avatar upload tags and profile metadata actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(() => import('/js/client-list.js'));

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const clientList = await import('/js/client-list.js');
    const clientListRuntime = await import('/js/client-list-runtime.js');
    const outcomes: Record<string, unknown> = {};
    const calls: unknown[][] = [];
    const clone = (value: unknown): unknown => value == null ? value : JSON.parse(JSON.stringify(value)) as unknown;
    const waitFor = async (predicate: () => unknown | Promise<unknown>, label: string) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const rowNames = () => [...document.querySelectorAll('.cl-list > .cl-row .cl-row-name')]
      .map(el => el.textContent!.trim());
    const now = Date.now();
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key ? localStorage.getItem(key) : null];
    }));
    const saved = {
      profiles: clone(state.profiles),
      currentProfile: state.currentProfile,
      importedData: clone(state.importedData),
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      bodyOverflow: document.body.style.overflow,
    };
    const previousClientListRuntimeDeps = clientListRuntime.configureClientListRuntimeDeps({
      renderProfileButton: () => calls.push(['render-profile-button']),
      showNotification: (...args: unknown[]) => calls.push(['notification', ...args]),
    });

    try {
      localStorage.clear();
      localStorage.setItem('labcharts-sync-enabled', 'false');
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.setItem('labcharts-active-profile', 'client-list-helper-main');
      localStorage.setItem('labcharts-location-cache', JSON.stringify({
        'slovakia|': 48.7,
        'slovakia|81101': 48.1,
      }));
      state.currentProfile = 'client-list-helper-main';
      state.profileSex = 'female';
      state.profileDob = '1985-03-04';
      (state as {importedData: unknown}).importedData = {
        wearableSummary: { metrics: { weight: { latest: 70 } } },
        genetics: { mtdna: {} },
      };
      (state as {profiles: unknown}).profiles = [
        {
          id: 'client-list-helper-main',
          name: 'Zeta Helper',
          sex: 'female',
          dob: '1985-03-04',
          location: { country: 'Slovakia', zip: '81101' },
          tags: ['vip'],
          notes: 'primary helper',
          status: 'active',
          avatar: null,
          height: 170,
          heightUnit: 'cm',
          createdAt: now - 90_000,
          lastUpdated: now - 30_000,
          pinned: true,
        },
        {
          id: 'client-list-helper-secondary',
          name: 'Alpha Helper',
          sex: null,
          dob: null,
          location: { country: '', zip: '' },
          tags: ['metabolic'],
          notes: 'secondary helper',
          status: 'active',
          avatar: null,
          height: null,
          heightUnit: 'cm',
          createdAt: now - 120_000,
          lastUpdated: now - 60_000,
          pinned: false,
        },
      ];
      localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
      await clientList.openClientList();
      await waitFor(() => document.getElementById('client-list-overlay')?.classList.contains('show'), 'client list open');
      const search = (document.getElementById('cl-search') as HTMLInputElement | null);
      search!.value = 'alpha';
      search!.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => rowNames().join('|') === 'Alpha Helper', 'client search render');
      outcomes.searchHelperFiltersList = (document.getElementById('cl-search') as HTMLInputElement | null)?.value === 'alpha'
        && rowNames().join('|') === 'Alpha Helper';

      (document.getElementById('cl-search') as HTMLInputElement | null)!.value = '';
      (document.getElementById('cl-search') as HTMLInputElement | null)!.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => rowNames().length === 2, 'cleared search render');
      document.querySelector<HTMLSelectElement>('.cl-sort')!.value = 'az';
      document.querySelector<HTMLSelectElement>('.cl-sort')!.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => rowNames().join('|') === 'Zeta Helper|Alpha Helper', 'pinned sort render');
      document.querySelector<HTMLElement>('[data-cl-action="tag-filter"][data-cl-tag="metabolic"]')?.click();
      await waitFor(() => rowNames().join('|') === 'Alpha Helper', 'tag filter render');
      document.querySelector<HTMLElement>('[data-cl-action="tag-filter"][data-cl-tag="metabolic"]')?.click();
      await waitFor(() => rowNames().length === 2, 'tag filter toggle clear');
      outcomes.sortAndTagFilterHelpersRerenderList = rowNames().includes('Zeta Helper')
        && rowNames().includes('Alpha Helper');

      clientList.openClientForm('client-list-helper-main');
      await waitFor(() => !!document.querySelector('.cl-form'), 'helper edit form');
      document.querySelector<HTMLElement>('[data-cl-action="set-sex"][data-cl-sex="male"]')?.click();
      outcomes.setSexHelperTogglesActiveButton = document.querySelector<HTMLElement>('#cl-sex-toggle .sex-toggle-btn.active')?.dataset.sex === 'male';

      (document.getElementById('cl-country') as HTMLInputElement | null)!.value = 'Slovakia';
      (document.getElementById('cl-zip') as HTMLInputElement | null)!.value = '81101';
      (document.getElementById('cl-zip') as HTMLInputElement | null)!.dispatchEvent(new Event('input', { bubbles: true }));
      outcomes.latitudeHelperUsesCacheAndZipSuffix = document.getElementById('cl-lat-display')?.textContent!.includes('postal area') === true
        && document.getElementById('cl-lat-display')?.textContent!.includes('48') === true;

      const tagInput = (document.getElementById('cl-tag-input') as HTMLInputElement | null);
      tagInput!.value = 'coach';
      tagInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await waitFor(() => [...document.querySelectorAll('.cl-tag-pill')].some(el => el.textContent.includes('coach')), 'tag added');
      const coachRemove = [...document.querySelectorAll('.cl-tag-pill')]
        .find(el => el.textContent.includes('coach'))
        ?.querySelector<HTMLElement>('[data-cl-action="remove-tag"]');
      coachRemove?.click();
      outcomes.tagKeyboardAndRemoveHelpersMutatePills = ![...document.querySelectorAll('.cl-tag-pill')]
        .some(el => el.textContent.includes('coach'));

      document.getElementById('cl-height-unit-toggle')?.click();
      outcomes.heightUnitHelperConvertsAndUpdatesBmi = (document.getElementById('cl-height-unit') as HTMLInputElement | null)?.value === 'in'
        && document.getElementById('cl-height-unit-toggle')?.textContent === 'in'
        && (document.getElementById('cl-height') as HTMLInputElement | null)?.placeholder === 'inches'
        && document.getElementById('cl-bmi-display')?.textContent!.includes('24.2');

      const avatarInput = (document.getElementById('cl-avatar-input') as HTMLInputElement | null);
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 6;
      const ctx = canvas.getContext('2d');
      ctx!.fillStyle = '#22c55e';
      ctx!.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob as BlobPart], 'helper-avatar.png', { type: 'image/png' });
      Object.defineProperty(avatarInput, 'files', {
        configurable: true,
        value: [file],
      });
      avatarInput!.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => document.getElementById('cl-avatar-img') instanceof HTMLImageElement, 'avatar preview');
      outcomes.avatarChangeHelperResizesAndShowsPreview = document.getElementById('cl-avatar-img') instanceof HTMLImageElement
        && document.getElementById('cl-avatar-img')?.getAttribute('src')?.startsWith('data:image/jpeg')
        && !!document.querySelector('.cl-avatar-remove');

      document.querySelector<HTMLElement>('[data-cl-action="back-to-list"]')?.click();
      await waitFor(() => !!(document.getElementById('cl-search') as HTMLInputElement | null), 'back to client list');
      outcomes.backToListHelperRestoresSearchView = !!(document.getElementById('cl-search') as HTMLInputElement | null)
        && !document.querySelector('.cl-form');

      document.querySelector<HTMLElement>('[data-cl-action="toggle-menu"][data-cl-profile-id="client-list-helper-main"]')?.click();
      await waitFor(() => !!document.querySelector('[data-cl-action="unpin-profile"][data-cl-profile-id="client-list-helper-main"]'), 'unpin menu action');
      document.querySelector<HTMLElement>('[data-cl-action="unpin-profile"][data-cl-profile-id="client-list-helper-main"]')?.click();
      await waitFor(() => (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-list-helper-main')?.pinned === false, 'profile unpinned');
      document.querySelector<HTMLElement>('[data-cl-action="toggle-menu"][data-cl-profile-id="client-list-helper-secondary"]')?.click();
      await waitFor(() => !!document.querySelector('[data-cl-action="archive-profile"][data-cl-profile-id="client-list-helper-secondary"]'), 'archive menu action');
      document.querySelector<HTMLElement>('[data-cl-action="archive-profile"][data-cl-profile-id="client-list-helper-secondary"]')?.click();
      await waitFor(() => (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-list-helper-secondary')?.status === 'archived', 'profile archived');
      document.querySelector<HTMLElement>('[data-cl-action="edit-profile"][data-cl-profile-id="client-list-helper-main"]')?.click();
      await waitFor(() => !!document.querySelector('.cl-form'), 'edit helper opens form');
      document.querySelector<HTMLElement>('[data-cl-action="back-to-list"]')?.click();
      await waitFor(() => !!(document.getElementById('cl-search') as HTMLInputElement | null), 'back after edit');
      document.querySelector<HTMLElement>('[data-cl-action="select-profile"][data-cl-profile-id="client-list-helper-main"]')?.click();
      outcomes.profileMetadataHelpersUnpinArchiveEditAndSelect =
        (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-list-helper-main')?.pinned === false
        && (state.profiles as ClientProfileFixtureReader[] | null)!.find(p => p.id === 'client-list-helper-secondary')?.status === 'archived'
        && calls.filter(call => call[0] === 'render-profile-button').length >= 2
        && !document.getElementById('client-list-overlay')?.classList.contains('show');
    } finally {
      clientList.closeClientList();
      (state as {profiles: unknown}).profiles = saved.profiles;
      state.currentProfile = saved.currentProfile;
      (state as {importedData: unknown}).importedData = saved.importedData;
      state.profileSex = saved.profileSex;
      state.profileDob = saved.profileDob;
      document.body.style.overflow = saved.bodyOverflow;
      clientListRuntime.configureClientListRuntimeDeps(previousClientListRuntimeDeps);
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      document.querySelectorAll('.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
