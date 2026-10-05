import { createExpectAll } from '../helpers/browser-outcomes.js';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('recommendationsCoverage');

const expectAll = createExpectAll(expect, 'soft');

const MOCK_CATALOG = {
  vendors: {
    mito: {
      name: 'Mito Vendor',
      homepage: {
        SK: 'https://mitochondriak.sk',
        INTL: 'https://mitochondriak.com',
      },
      coupon: {
        SK: { code: 'SK12', userDiscount: '12%' },
        INTL: { code: 'INTL10', userDiscount: '10%' },
      },
    },
    slt: {
      name: 'Safe Living Technologies',
      homepage: 'https://safelivingtechnologies.com',
      coupon: { code: 'SAFE10', userDiscount: '10%' },
    },
  },
  slots: {
    magnesium: {
      label: 'Magnesium',
      freeActions: ['Morning outdoor light'],
      foodForms: ['Pumpkin seeds'],
      productForms: ['Blue-blocking glasses'],
      forms: ['Magnesium glycinate'],
      formRefs: { 'Magnesium glycinate': 'https://pubmed.ncbi.nlm.nih.gov/123456/' },
    },
    melatonin: {
      label: 'Melatonin',
      card: 'Sleep & Rest',
      freeActions: ['Dim lights after sunset'],
      forms: ['Low-dose melatonin'],
    },
    'lipids.ldl': {
      label: 'LDL cholesterol',
      forms: ['Plant sterols'],
    },
    'env.shieldingPaint': {
      label: 'Shielding paint',
      card: 'Environment',
      forms: ['YShield paint'],
    },
    'env.shieldingFabric': {
      label: 'Shielding fabric',
      card: 'Environment',
      forms: ['Shielding canopy'],
    },
    'env.grounding': {
      label: 'Grounding',
      card: 'Environment',
      forms: ['Grounding rod'],
    },
  },
  products: {
    magnesium: [
      {
        key: 'pumpkin-seeds',
        type: 'food',
        brand: 'FoodCo',
        name: 'Pumpkin seeds',
        regions: ['INTL'],
        url: 'https://mitochondriak.com/pumpkin',
        vendorKey: 'mito',
      },
      {
        key: 'blue-blockers',
        type: 'product',
        brand: 'LightCo',
        name: 'Blue Blockers',
        regions: ['SK'],
        affiliateUrl: {
          SK: 'https://mitochondriak.sk/blue-blockers',
          INTL: 'https://mitochondriak.com/blue-blockers',
        },
        vendorKey: 'mito',
      },
      {
        key: 'mag-glycinate',
        type: 'supplement',
        brand: 'Mito',
        name: 'Magnesium Glycinate',
        dosage: '200 mg',
        priceEUR: 12,
        regions: ['EU'],
        affiliateUrl: {
          SK: 'https://mitochondriak.sk/magnesium-glycinate',
          INTL: 'https://mitochondriak.com/magnesium-glycinate',
        },
        vendorKey: 'mito',
      },
      {
        key: 'mag-rx',
        type: 'drug',
        brand: 'Rx',
        name: 'Magnesium IV',
        regions: ['SK'],
        url: 'https://mitochondriak.sk/magnesium-rx',
        vendorKey: 'mito',
      },
      {
        key: 'mag-other',
        type: 'other',
        brand: 'Other',
        name: 'Other magnesium support',
        regions: ['SK'],
        url: 'https://mitochondriak.sk/magnesium-other',
        vendorKey: 'mito',
      },
      {
        key: 'cz-only-magnesium',
        type: 'supplement',
        brand: 'Czech Only',
        name: 'CZ-only magnesium',
        regions: ['CZ'],
        url: 'https://mitochondriak.com/cz-only-magnesium',
        vendorKey: 'mito',
      },
    ],
    'env.shieldingPaint': [
      {
        key: 'yshield',
        name: 'YShield Paint',
        vendor: 'Safe Living Technologies',
        kind: 'Paint',
        regions: ['INTL'],
        url: 'https://safelivingtechnologies.com/yshield',
        vendorKey: 'slt',
      },
    ],
    'env.shieldingFabric': [
      {
        key: 'canopy',
        name: 'Shielding Canopy',
        vendor: 'Safe Living Technologies',
        kind: 'Canopy',
        regions: ['INTL'],
        url: 'https://safelivingtechnologies.com/canopy',
        vendorKey: 'slt',
      },
    ],
    _internal: [],
    '_internal.emfMeters': [
      {
        key: 'safe-meter',
        name: 'Safe Meter',
        vendor: 'Safe Living Technologies',
        kind: 'RF',
        matchTypes: ['rf'],
        url: 'https://safelivingtechnologies.com/meter',
        vendorKey: 'slt',
        blurb: 'RF and dirty electricity survey meter.',
      },
    ],
    '_internal.lightDevices': [
      {
        key: 'red-panel',
        name: 'Red Panel',
        vendor: 'Mito Vendor',
        regions: ['SK'],
        url: {
          SK: 'https://mitochondriak.sk/red-panel',
          INTL: 'https://mitochondriak.com/red-panel',
        },
        vendorKey: 'mito',
        blurb: '660 nm and 850 nm panel.',
      },
    ],
  },
};

test('recommendations browser coverage exercises catalog renderers detectors and affiliate controls', async ({ page }) => {
  test.setTimeout(30_000);

  await page.route('**/data/recommendations.json', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CATALOG),
    });
  });

  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ recUrl, runtimeUrl }) => {
    const clone = (value: unknown) => value == null ? value : ((JSON.parse as (text: unknown) => unknown)(JSON.stringify(value)) as unknown);
    const { state } = await import('/js/state.js');
    const recommendationWindowKeys = [
      'isProductRecsEnabled',
      'setProductRecsEnabled',
      'markRecDisclosureSeen',
      'renderRecommendationSection',
      'renderRecommendationSectionSync',
      'detectSupplementSlots',
      'loadCatalog',
      'buildDNAHints',
      'getCardSlotKeys',
      'renderCardTipsModal',
      'loadEMFCatalog',
      'getEMFMeters',
      'getEMFProductsForMitigations',
      'renderEMFMeterRecs',
      'renderEMFMitigationRecs',
      'detectEMFRelevance',
      'detectMitigationsInText',
      'getLightDeviceProduct',
      'renderLightDeviceAffiliateRow',
      'recommendDeviceProductsForChannelDeficit',
      'renderChannelDeficitDeviceRecs',
      'copyCouponCode',
    ];
    const rec = (await import(recUrl) as unknown) as Pick<typeof import('../../js/recommendations.js'), "renderRecommendationSection" | "setProductRecsEnabled" | "loadCatalog" | "loadEMFCatalog" | "isProductRecsEnabled" | "markDisclosureSeen" | "hasSeenDisclosure" | "regionLookupChain" | "getUserRegion" | "regionLabel" | "getProductsForSlot" | "_pickRegional" | "_resolveCouponForRegion" | "_resolveHomepageForRegion" | "_resolveProductUrlForRegion" | "_addUTMParams" | "renderRecommendationSectionSync" | "copyCouponCode" | "buildDNAHints" | "getCardSlotKeys" | "renderCardTipsModal" | "getEMFMeters" | "getEMFProductsForMitigations" | "renderEMFMeterRecs" | "renderEMFMitigationRecs" | "getLightDeviceProduct" | "renderLightDeviceAffiliateRow" | "detectSupplementSlots" | "detectMitigationsInText" | "detectEMFRelevance" | "detectWearableTrendSlots" | "recommendDeviceProductsForChannelDeficit" | "renderChannelDeficitDeviceRecs">;
    const recommendationsRuntime = (await import(runtimeUrl) as unknown) as Pick<typeof import('../../js/recommendations-runtime.js'), "configureRecommendationsRuntime">;
    const runtimeCalls: unknown[][] = [];
    const savedRecommendationsRuntime = recommendationsRuntime.configureRecommendationsRuntime({
      closeModal: () => runtimeCalls.push(['close']),
      openProfileLocationEditor: () => {},
      openSettingsModal: (tab: unknown) => runtimeCalls.push(['settings', tab]),
    });
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key!)];
    }));
    const saved = {
      currentProfile: state.currentProfile,
      profiles: clone(state.profiles),
      importedData: clone(state.importedData),
      snpTable: (window as unknown as {_snpTableCache?: unknown})._snpTableCache,
      clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
      setTimeout: window.setTimeout,
    };
    const outcomes: Record<string, unknown> = {};
    const host = document.createElement('div');
    const wait = (ms: number) => new Promise(resolve => saved.setTimeout.call(window, resolve, ms));
    const restoreWindowProp = (key: string, value: unknown) => {
      if (value === undefined) delete (window as unknown as Record<string, unknown>)[key];
      else (window as unknown as Record<string, unknown>)[key] = value;
    };

    try {
      document.body.append(host);
      state.currentProfile = 'recommendations-coverage';
      (state as unknown as {profiles: unknown}).profiles = [{
        id: state.currentProfile,
        name: 'Recommendations Coverage',
        location: { country: 'Slovakia', zip: '81101' },
        tags: [],
        notes: '',
        status: 'active',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        pinned: false,
      }];
      (state as unknown as {importedData: unknown}).importedData = {
        entries: [],
        supplements: [],
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
        emfAssessment: { assessments: [] },
        genetics: {
          apoe: '',
          snps: {
            rs123: { gene: 'MTHFR', variant: 'C677T', genotype: 'CT' },
          },
        },
      };
      (window as unknown as {_snpTableCache?: unknown})._snpTableCache = {
        rs123: {
          contextCards: ['sleepRest'],
          genotypes: { CT: { effect: 'moderate' } },
          snpHints: {
            CT: {
              slotKey: 'magnesium',
              direction: 'form',
              text: 'MTHFR CT can increase magnesium demand.',
              ref: 'https://pubmed.ncbi.nlm.nih.gov/987654/',
            },
          },
        },
      };

      host.innerHTML = `
        <button type="button" data-rec-action="close-modal">Close</button>
        <button type="button" data-rec-action="open-privacy-settings">Privacy</button>`;
      host.querySelector<HTMLElement>('[data-rec-action="close-modal"]')?.click();
      host.querySelector<HTMLElement>('[data-rec-action="open-privacy-settings"]')?.click();
      outcomes.recommendationHostActionsUseInjectedRuntimeDeps =
        runtimeCalls.some(call => call[0] === 'close')
        && runtimeCalls.some(call => call[0] === 'settings' && call[1] === 'privacy')
        && runtimeCalls.every(call => call[0] === 'close'
          || (call[0] === 'settings' && call[1] === 'privacy'));
      host.replaceChildren();

      localStorage.setItem('labcharts-show-product-recs', 'false');
      outcomes.disabledAsyncRenderEmpty = await rec.renderRecommendationSection('magnesium') === '';
      rec.setProductRecsEnabled(true);
      localStorage.removeItem('labcharts-rec-disclosure');

      const [catalogA, catalogB] = await Promise.all([rec.loadCatalog(), rec.loadCatalog()]);
      outcomes.loadCatalogDedupes = catalogA === catalogB && !!catalogA?.slots?.magnesium;
      outcomes.loadEMFCatalogUsesUnifiedCatalog = (await rec.loadEMFCatalog()) === catalogA;
      outcomes.recommendationExportsStayModuleOnly = recommendationWindowKeys.every(key =>
        typeof (rec as Record<string, unknown>)[key] === 'function' && !(key in window)
      );

      outcomes.settingToggleRoundTrips = rec.isProductRecsEnabled() === true;
      rec.markDisclosureSeen();
      outcomes.disclosureSeenWritesStorage = rec.hasSeenDisclosure() === true;
      localStorage.removeItem('labcharts-rec-disclosure');

      outcomes.regionChainIncludesEuAndIntl = rec.regionLookupChain('SK').join('|') === 'SK|EU|INTL';
      outcomes.unknownRegionFallback = rec.regionLookupChain('NOPE').join('|') === 'NOPE|INTL';
      outcomes.profileRegionResolvesCountry = rec.getUserRegion() === 'SK';
      outcomes.regionLabelFallback = rec.regionLabel('NOPE') === 'worldwide';
      const skProducts = rec.getProductsForSlot(catalogA, 'magnesium', 'SK');
      outcomes.productsFilterByHierarchy = skProducts.length === 5
        && skProducts.some(product => product.key === 'mag-glycinate')
        && !skProducts.some(product => product.key === 'cz-only-magnesium');

      outcomes.pickRegionalPrefersSpecific = rec._pickRegional({ INTL: 'world', SK: 'local' }, 'SK') === 'local';
      outcomes.pickRegionalRejectsArray = (rec._pickRegional as (value: unknown, region: Parameters<typeof rec._pickRegional>[1]) => ReturnType<typeof rec._pickRegional>)([{ SK: 'bad' }], 'SK') === null;
      outcomes.resolveCouponFlatAndMapped = rec._resolveCouponForRegion({ code: 'FLAT' }, 'SK')?.code === 'FLAT'
        && rec._resolveCouponForRegion({ SK: { code: 'MAP' } }, 'SK')?.code === 'MAP';
      outcomes.resolveHomepageFlatAndMapped = rec._resolveHomepageForRegion('https://example.com', 'SK') === 'https://example.com'
        && rec._resolveHomepageForRegion({ SK: 'https://sk.example.com' }, 'SK') === 'https://sk.example.com';
      outcomes.resolveProductUrlPrefersAffiliate = rec._resolveProductUrlForRegion(catalogA!.products!.magnesium![2]!, 'SK') === 'https://mitochondriak.sk/magnesium-glycinate';
      outcomes.utmParamsAreApplied = rec._addUTMParams('https://mitochondriak.sk/item?x=1', 'slot-product', 'vitamins')
        .includes('utm_campaign=vitamins');

      const sectionHtml = rec.renderRecommendationSectionSync('magnesium', {
        label: 'Coverage recommendations',
        markerStatus: 'normal',
        inlineSNPs: [{
          rsid: 'rs123',
          gene: 'MTHFR',
          variant: 'C677T',
          genotype: 'CT',
          effect: 'moderate',
          note: 'Inline SNP context',
          references: ['https://pubmed.ncbi.nlm.nih.gov/111111/'],
        }],
      });
      host.innerHTML = sectionHtml;
      outcomes.syncRenderBuildsAllTiers = sectionHtml.includes('Coverage recommendations')
        && sectionHtml.includes('LIFESTYLE IDEAS')
        && sectionHtml.includes('FOOD EXAMPLES')
        && sectionHtml.includes('TOOLS')
        && sectionHtml.includes('SUPPLEMENTS')
        && sectionHtml.includes('PHARMACEUTICALS')
        && sectionHtml.includes('OTHER')
        && sectionHtml.includes('Your value is in range');
      outcomes.renderAddsTrustedAffiliateLinks = Array.from(host.querySelectorAll<HTMLAnchorElement>('a.rec-product-link'))
        .some(link => link.href.includes('mitochondriak.sk') && link.href.includes('utm_source=getbased'));
      outcomes.disclosureBannerGatesThenDismisses = !!host.querySelector<HTMLElement>('.rec-disclosure-banner')
        && !!host.querySelector<HTMLElement>('.rec-section-gated');
      const disclosureButton = host.querySelector<HTMLElement>('.rec-disclosure-btn');
      outcomes.disclosureButtonFound = !!disclosureButton;
      disclosureButton?.click();
      outcomes.disclosureButtonUngatesSections = localStorage.getItem('labcharts-rec-disclosure') === 'seen'
        && !host.querySelector<HTMLElement>('.rec-section-gated');

      let copiedCode: unknown = '';
      let couponFlashCleanup: unknown = null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (code: unknown) => { copiedCode = code; } },
      });
      (window as unknown as {setTimeout: unknown}).setTimeout = (fn: (...args: unknown[]) => unknown, _ms: unknown, ...args: unknown[]) => {
        couponFlashCleanup = () => fn(...args);
        return 1;
      };
      const couponBtn = host.querySelector<HTMLElement>('.rec-coupon-code');
      rec.copyCouponCode(couponBtn);
      await wait(0);
      outcomes.copyCouponUsesClipboard = copiedCode === 'SK12'
        && couponBtn?.dataset.flashing === '1'
        && couponBtn?.textContent.includes('Copied');
      (couponFlashCleanup as (() => unknown) | null)?.();
      outcomes.copyCouponCleanupRestoresButton = couponBtn?.dataset.flashing !== '1'
        && couponBtn?.textContent === 'SK12';
      (window as unknown as {setTimeout: unknown}).setTimeout = saved.setTimeout;

      localStorage.removeItem('labcharts-rec-disclosure');
      const chatWrapper = document.createElement('details');
      chatWrapper.className = 'rec-chat-wrapper';
      chatWrapper.open = true;
      let chatWrapperStoppedBubble = false;
      chatWrapper.onclick = (event: MouseEvent) => {
        chatWrapperStoppedBubble = true;
        event.stopPropagation();
      };
      const chatBody = document.createElement('div');
      chatBody.innerHTML = rec.renderRecommendationSectionSync('magnesium', { label: 'Chat recommendations' });
      chatWrapper.appendChild(chatBody);
      document.body.appendChild(chatWrapper);
      copiedCode = '';
      couponFlashCleanup = null;
      (window as unknown as {setTimeout: unknown}).setTimeout = (fn: (...args: unknown[]) => unknown, _ms: unknown, ...args: unknown[]) => {
        couponFlashCleanup = () => fn(...args);
        return 1;
      };
      chatWrapper.querySelector<HTMLElement>('.rec-coupon-code')?.click();
      await wait(0);
      chatWrapper.querySelector<HTMLElement>('.rec-disclosure-btn')?.click();
      outcomes.chatWrappedRecommendationActionsSurviveStopPropagation = chatWrapperStoppedBubble
        && copiedCode === 'SK12'
        && localStorage.getItem('labcharts-rec-disclosure') === 'seen'
        && !chatWrapper.querySelector<HTMLElement>('.rec-section-gated');
      (couponFlashCleanup as (() => unknown) | null)?.();
      chatWrapper.remove();
      (window as unknown as {setTimeout: unknown}).setTimeout = saved.setTimeout;

      const asyncHtml = await rec.renderRecommendationSection('magnesium', { label: 'Async recommendations' });
      outcomes.asyncRenderUsesLoadedCatalog = asyncHtml.includes('Async recommendations')
        && asyncHtml.includes('Magnesium Glycinate');

      outcomes.dnaHintsRenderForSlot = rec.buildDNAHints('magnesium')[0]?.gene === 'MTHFR';
      outcomes.cardSlotKeysUseLoadedCatalog = rec.getCardSlotKeys('sleepRest').includes('melatonin');
      const sleepTips = rec.renderCardTipsModal('sleepRest');
      outcomes.cardTipsIncludeDnaAndSlotTips = sleepTips.includes('MTHFR') && sleepTips.includes('Low-dose melatonin');

      (state.importedData as unknown as {emfAssessment: unknown}).emfAssessment = { assessments: [] };
      const environmentTips = rec.renderCardTipsModal('environment');
      outcomes.environmentCardIncludesEmfNudge = environmentTips.includes('Open the EMF assessment');
      const staleAssessmentDate = new Date(Date.now() - 130 * 86400_000).toISOString().slice(0, 10);
      (state.importedData as unknown as {emfAssessment: unknown}).emfAssessment = { assessments: [{ date: staleAssessmentDate }] };
      outcomes.staleEmfNudgeRenders = rec.renderCardTipsModal('environment').includes('Re-check the room');

      outcomes.emfMetersFilterByType = rec.getEMFMeters(catalogA, ['rf'])[0]?.key === 'safe-meter';
      outcomes.emfMitigationProductsDedup = rec.getEMFProductsForMitigations(catalogA, [
        'shielding paint (Yshield)',
        'shielding paint (Yshield)',
        'shielding fabric / canopy',
      ]).length === 2;
      const meterHtml = rec.renderEMFMeterRecs(catalogA, { types: ['rf'], heading: 'Meter coverage' });
      outcomes.emfMeterRenderIncludesCouponAndLink = meterHtml.includes('Meter coverage')
        && meterHtml.includes('SAFE10')
        && meterHtml.includes('safelivingtechnologies.com');
      const mitigationHtml = rec.renderEMFMitigationRecs(catalogA, ['shielding paint (Yshield)'], {
        heading: 'Mitigation coverage',
      });
      outcomes.emfMitigationRenderIncludesProduct = mitigationHtml.includes('Mitigation coverage')
        && mitigationHtml.includes('YShield Paint');

      outcomes.lightDeviceProductResolvesBySlug = rec.getLightDeviceProduct(catalogA, 'red-panel')?.name === 'Red Panel';
      outcomes.lightDeviceAffiliateRowUsesTrustedUrl = rec.renderLightDeviceAffiliateRow(catalogA, 'red-panel')
        .includes('light-device-red-panel');

      outcomes.keywordDetectsSupplement = rec.detectSupplementSlots('Try magnesium glycinate for sleep.')[0] === 'magnesium';
      outcomes.keywordGeneDetectionUsesSnpTable = rec.detectSupplementSlots('MTHFR support').includes('magnesium');
      outcomes.mitigationTextDetection = rec.detectMitigationsInText('YShield paint and a Stetzer filter may help.').length === 2;
      outcomes.emfRelevanceDetection = rec.detectEMFRelevance('WiFi exposure in the bedroom affects sleep') === true
        && rec.detectEMFRelevance('generic fatigue without signal terms') === false;
      const trendSlots = rec.detectWearableTrendSlots({
        metrics: {
          hrv_rmssd: { rolling: { d7: 31 }, baselineP25: 45 },
          rhr: { rolling: { d7: 71 }, baselineP75: 63 },
          sleep_score: { rolling: { d7: 66 }, baseline: 78 },
        },
      }).map(slot => slot.slotKey);
      const trendSlotSet = new Set(trendSlots);
      outcomes.wearableTrendSlotsDedup = trendSlotSet.has('magnesium')
        && trendSlotSet.has('melatonin')
        && trendSlots.length === 2;

      const presets = { presets: [{ catalogSlug: 'red-panel', channels: ['pbm_red', 'pbm_nir'] }] };
      outcomes.channelDeficitProductsResolve = rec.recommendDeviceProductsForChannelDeficit(catalogA, 'pbm_red', presets)[0]?.key === 'red-panel';
      const deficitHtml = rec.renderChannelDeficitDeviceRecs(catalogA, 'pbm_red', presets, { label: 'Red 660 nm' });
      outcomes.channelDeficitRenderIncludesSettingsOptOut = deficitHtml.includes('Red 660 nm')
        && deficitHtml.includes('turn off')
        && deficitHtml.includes('utm_campaign=light-devices');
    } finally {
      state.currentProfile = saved.currentProfile;
      (state as unknown as {profiles: unknown}).profiles = saved.profiles;
      (state as unknown as {importedData: unknown}).importedData = saved.importedData;
      restoreWindowProp('_snpTableCache', saved.snpTable);
      recommendationsRuntime.configureRecommendationsRuntime(savedRecommendationsRuntime);
      (window as unknown as {setTimeout: unknown}).setTimeout = saved.setTimeout;
      if (saved.clipboard) Object.defineProperty(navigator, 'clipboard', saved.clipboard);
      else delete (navigator as unknown as {clipboard?: unknown}).clipboard;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      host.remove();
    }

    return outcomes;
  }, {
    recUrl: moduleUrl('/js/recommendations.js'),
    runtimeUrl: '/js/recommendations-runtime.js',
  });

  expectAll(results);
});
