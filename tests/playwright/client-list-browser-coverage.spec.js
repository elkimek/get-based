import { expect, test } from './coverage-fixture.js';

test('client list live menu actions dispatch exports share demos and profile state changes', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.openClientList === 'function');

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const calls = [];
    const confirmQueue = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const now = Date.now();
    const makeProfile = (id, name, overrides = {}) => ({
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
      renderProfileButton: window.renderProfileButton,
      exportAllDataJSON: window.exportAllDataJSON,
      exportClientJSON: window.exportClientJSON,
      importDataJSON: window.importDataJSON,
      loadDemoData: window.loadDemoData,
      openProfileShareModal: window.openProfileShareModal,
      showConfirmDialog: window.showConfirmDialog,
      inputClick: HTMLInputElement.prototype.click,
    };
    const openList = async () => {
      window.openClientList();
      await waitFor(() => document.getElementById('client-list-overlay')?.classList.contains('show'), 'client list overlay');
      await waitFor(() => document.activeElement?.id === 'cl-search', 'client list search focus');
    };
    const rowNames = () => [...document.querySelectorAll('.cl-list > .cl-row .cl-row-name')]
      .map(el => el.textContent.trim());
    const clickAction = (action, id) => {
      const profileSelector = id ? `[data-cl-profile-id="${id}"]` : '';
      document.querySelector(`[data-cl-action="${action}"]${profileSelector}`)?.click();
    };
    const openRowMenu = async (id) => {
      clickAction('toggle-menu', id);
      await waitFor(() => document.getElementById('cl-active-menu')?.classList.contains('show'), `row menu ${id}`);
    };

    try {
      state.currentProfile = 'client-alice';
      state.importedData = {
        wearableSummary: { metrics: { weight: { latest: 70 } } },
        genetics: { mtdna: {} },
      };
      state.profiles = [
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
      window.renderProfileButton = () => calls.push(['render-profile-button']);
      window.exportAllDataJSON = () => calls.push(['export-all']);
      window.exportClientJSON = (...args) => calls.push(['export-client', ...args]);
      window.importDataJSON = file => calls.push(['import-json', file?.name || '']);
      window.loadDemoData = demo => calls.push(['load-demo', demo]);
      window.openProfileShareModal = id => calls.push(['share-profile', id]);
      window.showConfirmDialog = async message => {
        calls.push(['confirm', message]);
        return confirmQueue.shift() === true;
      };
      HTMLInputElement.prototype.click = function() {
        calls.push(['input-click', this.id || this.type || 'input']);
      };

      await openList();
      outcomes.opensAndFocusesSearch = document.activeElement?.id === 'cl-search'
        && document.body.style.overflow === 'hidden'
        && rowNames().join('|') === 'Alice Browser|Bob Browser'
        && document.querySelector('.cl-archived-section')?.textContent.includes('Cara Browser') === true;

      clickAction('toggle-tools-menu');
      outcomes.toolsMenuTogglesOpen = document.getElementById('cl-tools-menu')?.classList.contains('show') === true;
      clickAction('trigger-json-import');
      outcomes.importJsonToolClicksHiddenInput = calls.some(call => call[0] === 'input-click' && call[1] === 'cl-json-import')
        && document.getElementById('cl-tools-menu')?.classList.contains('show') === false;

      const fileInput = document.getElementById('cl-json-import');
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [new File(['{"version":2}'], 'client-import.json', { type: 'application/json' })],
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      outcomes.importChangeClosesAndPassesFile = !document.getElementById('client-list-overlay')?.classList.contains('show')
        && calls.some(call => call[0] === 'import-json' && call[1] === 'client-import.json');

      await openList();
      clickAction('toggle-tools-menu');
      clickAction('export-all');
      outcomes.exportAllUsesToolDelegate = calls.some(call => call[0] === 'export-all')
        && document.getElementById('cl-tools-menu')?.classList.contains('show') === false;

      clickAction('toggle-tools-menu');
      document.querySelector('[data-cl-action="load-demo"][data-cl-demo="male"]')?.click();
      outcomes.demoActionClosesAndUsesSelectedDemo = !document.getElementById('client-list-overlay')?.classList.contains('show')
        && calls.some(call => call[0] === 'load-demo' && call[1] === 'male');

      await openList();
      await openRowMenu('client-alice');
      clickAction('pin-profile', 'client-alice');
      outcomes.pinActionRerendersPinnedBadge = state.profiles.find(p => p.id === 'client-alice')?.pinned === true
        && !!document.querySelector('[data-id="client-alice"] .cl-badge-pinned');

      await openRowMenu('client-bob');
      clickAction('flag-profile', 'client-bob');
      outcomes.flagActionUpdatesProfileAndButton = state.profiles.find(p => p.id === 'client-bob')?.status === 'flagged'
        && calls.some(call => call[0] === 'render-profile-button')
        && !!document.querySelector('[data-id="client-bob"] .cl-badge-flagged');

      await openRowMenu('client-bob');
      clickAction('unflag-profile', 'client-bob');
      outcomes.unflagActionReturnsProfileActive = state.profiles.find(p => p.id === 'client-bob')?.status === 'active';

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
      document.querySelector('.cl-status-filter').value = 'archived';
      document.querySelector('.cl-status-filter').dispatchEvent(new Event('change', { bubbles: true }));
      await openRowMenu('client-cara');
      clickAction('unarchive-profile', 'client-cara');
      outcomes.unarchiveActionRestoresArchivedProfile = state.profiles.find(p => p.id === 'client-cara')?.status === 'active';

      document.querySelector('.cl-status-filter').value = 'active';
      document.querySelector('.cl-status-filter').dispatchEvent(new Event('change', { bubbles: true }));
      await openRowMenu('client-bob');
      const confirmCountBeforeCancel = calls.filter(call => call[0] === 'confirm').length;
      confirmQueue.push(false);
      clickAction('delete-profile', 'client-bob');
      await waitFor(() => calls.filter(call => call[0] === 'confirm').length > confirmCountBeforeCancel
        && state.profiles.some(p => p.id === 'client-bob')
        && !!document.querySelector('[data-id="client-bob"]'), 'cancel keeps profile row');
      const cancelKeptProfile = state.profiles.some(p => p.id === 'client-bob')
        && !!document.querySelector('[data-id="client-bob"]');
      await openRowMenu('client-bob');
      const confirmCountBeforeDelete = calls.filter(call => call[0] === 'confirm').length;
      confirmQueue.push(true);
      clickAction('delete-profile', 'client-bob');
      await waitFor(() => calls.filter(call => call[0] === 'confirm').length > confirmCountBeforeDelete
        && !document.querySelector('[data-id="client-bob"]'), 'confirmed profile delete DOM refresh');
      outcomes.deleteActionHonorsConfirmAndRefreshesList = cancelKeptProfile
        && calls.some(call => call[0] === 'confirm' && call[1].includes('Delete this profile'))
        && !state.profiles.some(p => p.id === 'client-bob')
        && !document.querySelector('[data-id="client-bob"]');

      document.body.click();
      outcomes.outsideClickClosesFloatingMenus = !document.getElementById('cl-active-menu')?.classList.contains('show')
        && !document.getElementById('cl-tools-menu')?.classList.contains('show');
    } finally {
      window.closeClientList?.();
      state.profiles = saved.profiles;
      state.currentProfile = saved.currentProfile;
      state.importedData = saved.importedData;
      document.body.style.overflow = saved.bodyOverflow;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      window.renderProfileButton = saved.renderProfileButton;
      window.exportAllDataJSON = saved.exportAllDataJSON;
      window.exportClientJSON = saved.exportClientJSON;
      window.importDataJSON = saved.importDataJSON;
      window.loadDemoData = saved.loadDemoData;
      window.openProfileShareModal = saved.openProfileShareModal;
      window.showConfirmDialog = saved.showConfirmDialog;
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
  await page.waitForFunction(() => typeof window.openClientList === 'function');

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const outcomes = {};
    const calls = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const avatarData = 'data:image/png;base64,iVBORw0KGgo=';
    const now = Date.now();
    const storageKeys = ['labcharts-active-profile', 'labcharts-profiles'];
    const saved = {
      profiles: clone(state.profiles),
      currentProfile: state.currentProfile,
      importedData: clone(state.importedData),
      storage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
      bodyOverflow: document.body.style.overflow,
      renderProfileButton: window.renderProfileButton,
      showNotification: window.showNotification,
      hasAIProvider: window.hasAIProvider,
      navigate: window.navigate,
      HAPLOGROUP_LIST: window.HAPLOGROUP_LIST,
      setManualHaplogroup: window.setManualHaplogroup,
      inputClick: HTMLInputElement.prototype.click,
      scrollIntoView: Element.prototype.scrollIntoView,
      modalOverlayClass: document.getElementById('modal-overlay')?.className,
      hadWearableStrip: !!document.getElementById('wearable-strip'),
    };

    try {
      state.currentProfile = 'client-active';
      state.profiles = [{
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
      state.importedData = {
        wearableSummary: { metrics: { weight: { latest: 70 } } },
        genetics: { mtdna: { haplogroup: '', coupling: null } },
      };
      localStorage.setItem('labcharts-active-profile', 'client-active');
      localStorage.setItem('labcharts-profiles', JSON.stringify(state.profiles));
      window.renderProfileButton = () => calls.push(['render-profile-button']);
      window.showNotification = (...args) => calls.push(['notification', ...args]);
      window.hasAIProvider = () => false;
      window.navigate = route => calls.push(['navigate', route]);
      window.HAPLOGROUP_LIST = ['H', 'J', 'K'];
      window.setManualHaplogroup = async haplogroup => {
        calls.push(['haplogroup', haplogroup]);
        state.importedData.genetics.mtdna = {
          haplogroup,
          coupling: { shortLabel: `Coupled ${haplogroup}` },
        };
      };
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

      window.openClientList();
      window.openClientForm('client-active');
      await waitFor(() => !!document.querySelector('.cl-form'), 'client edit form');
      document.querySelector('[data-cl-action="health-metrics"]')?.click();
      await waitFor(() => calls.some(call => call[0] === 'navigate'), 'health metrics navigation');
      await waitFor(() => calls.some(call => call[0] === 'scroll'), 'health metrics scroll');
      outcomes.healthMetricsLinkClosesNavigatesAndScrolls = !document.getElementById('client-list-overlay')?.classList.contains('show')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard')
        && calls.some(call => call[0] === 'scroll' && call[1] === 'wearable-strip');

      window.openClientList();
      window.openClientForm('client-active');
      await waitFor(() => !!document.querySelector('.cl-form'), 'reopened client edit form');
      document.querySelector('.cl-avatar-picker')?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }));
      outcomes.avatarKeyboardOpensFileInput = calls.some(call => call[0] === 'input-click' && call[1] === 'cl-avatar-input');

      document.querySelector('[data-cl-action="remove-avatar"]')?.click();
      outcomes.removeAvatarRestoresInitialPreview = !document.querySelector('.cl-avatar-remove')
        && document.getElementById('cl-avatar-img')?.textContent === 'A';

      const haplogroup = document.getElementById('cl-haplogroup');
      haplogroup.value = 'H';
      haplogroup.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => document.getElementById('cl-hg-coupling')?.textContent === 'Coupled H', 'haplogroup coupling label');
      outcomes.haplogroupChangeUpdatesManualCoupling = calls.some(call => call[0] === 'haplogroup' && call[1] === 'H')
        && state.importedData.genetics.mtdna.haplogroup === 'H';

      document.querySelector('.cl-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const updatedProfile = state.profiles.find(p => p.id === 'client-active');
      outcomes.savePersistsRemovedAvatarAndNotifies = updatedProfile?.avatar === null
        && calls.some(call => call[0] === 'render-profile-button')
        && calls.some(call => call[0] === 'notification' && call[1] === '"Active Browser" updated' && call[2] === 'info');

      document.getElementById('modal-overlay')?.classList.add('show');
      window.openProfileLocationEditor();
      await waitFor(() => document.activeElement?.id === 'cl-country', 'location editor focus');
      outcomes.locationEditorOpensVisibleFormAndHidesOtherModal = document.getElementById('client-list-overlay')?.classList.contains('show') === true
        && !document.getElementById('modal-overlay')?.classList.contains('show')
        && document.getElementById('cl-country')?.value === 'Czech Republic'
        && calls.some(call => call[0] === 'scroll' && call[1] === 'cl-country');
    } finally {
      window.closeClientList?.();
      state.profiles = saved.profiles;
      state.currentProfile = saved.currentProfile;
      state.importedData = saved.importedData;
      document.body.style.overflow = saved.bodyOverflow;
      for (const [key, value] of Object.entries(saved.storage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      window.renderProfileButton = saved.renderProfileButton;
      window.showNotification = saved.showNotification;
      window.hasAIProvider = saved.hasAIProvider;
      window.navigate = saved.navigate;
      window.HAPLOGROUP_LIST = saved.HAPLOGROUP_LIST;
      window.setManualHaplogroup = saved.setManualHaplogroup;
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
