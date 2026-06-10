import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?sunBodySilhouetteCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('sun body silhouette covers stock render region map overlay and input paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ silhouetteUrl }) => {
    const silhouette = await import(silhouetteUrl);
    const outcomes = {};
    const saved = {
      getActiveProfileId: window.getActiveProfileId,
      getProfiles: window.getProfiles,
    };
    const hosts = [];
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 120) => {
      for (let i = 0; i < attempts; i += 1) {
        if (predicate()) return true;
        await delay(10);
      }
      return false;
    };
    const pickerToSource = (cell, px, py) => {
      const scale = 210 / cell.ch;
      const cellWScaled = cell.cw * scale;
      const xOffset = (100 - cellWScaled) / 2;
      return {
        x: cell.sx + (px - xOffset) / scale,
        y: cell.sy + py / scale,
      };
    };
    const mount = (selected = new Set()) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.innerHTML = silhouette.renderBodySilhouette(selected);
      hosts.push(host);
      return host;
    };

    try {
      silhouette.resetBodySilhouetteState();
      window.getActiveProfileId = () => 'profile-female';
      window.getProfiles = () => [{ id: 'profile-female', sex: 'female' }];

      const femaleHost = mount(new Set(['face', 'arms-back']));
      const femaleSvg = femaleHost.querySelector('svg.sun-silhouette');
      outcomes.renderUsesFemaleStockFigureAndPendingOverlay = femaleSvg?.dataset.sex === 'female'
        && femaleSvg.classList.contains('sun-silhouette-stock')
        && femaleSvg.dataset.selectionOverlay === 'pending'
        && !!femaleHost.querySelector('[data-region="face"][aria-pressed="true"]')
        && !!femaleHost.querySelector('[data-region="arms-back"][aria-pressed="true"]')
        && !!femaleHost.querySelector('mask#sun-fig-mask-front image[href="/er-mask.png"]')
        && !!femaleHost.querySelector('image[href="/er.svg"]');

      window.getActiveProfileId = () => {
        throw new Error('profile lookup unavailable');
      };
      window.getProfiles = () => {
        throw new Error('profiles unavailable');
      };
      const fallbackHost = mount(new Set());
      outcomes.profileLookupFailureFallsBackToMale = fallbackHost.querySelector('svg.sun-silhouette')?.dataset.sex === 'male';

      const map = await silhouette._testLoadRegionMap();
      const stock = silhouette._testStockImg;
      const maleFacePoint = pickerToSource(stock.cells['male-front'], 50, 18);
      const maleLegPoint = pickerToSource(stock.cells['male-back'], 50, 120);
      outcomes.regionMapLoadsAndSamplesExpectedRegions = map.width === 1700
        && map.height === 2698
        && silhouette._testRegionAtSource(maleFacePoint.x, maleFacePoint.y) === 'face'
        && silhouette._testRegionAtSource(maleLegPoint.x, maleLegPoint.y) === 'legs-back'
        && silhouette._testRegionAtSource(-1, -1) === null;

      let overlayReady = 0;
      const onOverlayReady = () => {
        overlayReady += 1;
      };
      window.addEventListener('sun-overlay-ready', onOverlayReady);
      try {
        const selected = new Set(['face', 'legs-back']);
        const overlayHost = mount(selected);
        outcomes.overlayStartsPendingAfterMapLoad = overlayHost.querySelector('svg.sun-silhouette')?.dataset.selectionOverlay === 'pending';
        const ready = await waitFor(() => overlayReady > 0);
        overlayHost.innerHTML = silhouette.renderBodySilhouette(selected);
        const readySvg = overlayHost.querySelector('svg.sun-silhouette');
        outcomes.selectionOverlayBecomesReadyBlob = ready
          && readySvg?.dataset.selectionOverlay === 'ready'
          && Array.from(overlayHost.querySelectorAll('image')).some(img => img.getAttribute('href')?.startsWith('blob:'));
      } finally {
        window.removeEventListener('sun-overlay-ready', onOverlayReady);
      }

      const selected = new Set(['face']);
      const bindHost = mount(selected);
      const changes = [];
      silhouette.bindBodySilhouette(bindHost, selected, set => changes.push(Array.from(set).sort()));

      const facePath = bindHost.querySelector('[data-region="face"][data-view="front"]');
      facePath?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await delay(0);
      outcomes.keyboardSpaceTogglesRegion = !selected.has('face')
        && changes.length === 1
        && changes[0].includes('face') === false;

      const armsFront = bindHost.querySelector('[data-region="arms-front"][data-view="front"]');
      armsFront?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await delay(0);
      outcomes.clickFallbackTogglesPathRegion = selected.has('arms-front')
        && changes.at(-1)?.includes('arms-front') === true;

      const beforePointerChanges = changes.length;
      const legsBack = bindHost.querySelector('[data-region="legs-back"][data-view="back"]');
      const PointerCtor = window.PointerEvent || MouseEvent;
      legsBack?.dispatchEvent(new PointerCtor('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
      }));
      await delay(0);
      const freshLegsBack = bindHost.querySelector('[data-region="legs-back"][data-view="back"]');
      freshLegsBack?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await delay(0);
      outcomes.touchPointerSuppressesSyntheticClick = !!freshLegsBack
        && changes.length === beforePointerChanges + 1
        && selected.has('legs-back');

      const detachedHost = mount(new Set(['face']));
      silhouette.bindBodySilhouette(detachedHost, new Set(['face']), () => {});
      const detachedSnapshot = detachedHost.innerHTML;
      detachedHost.remove();
      window.dispatchEvent(new CustomEvent('sun-overlay-ready'));
      await delay(0);
      outcomes.detachedOverlayReadyDoesNotMutateHost = detachedHost.innerHTML === detachedSnapshot;
    } finally {
      silhouette.resetBodySilhouetteState();
      if (saved.getActiveProfileId) window.getActiveProfileId = saved.getActiveProfileId;
      else delete window.getActiveProfileId;
      if (saved.getProfiles) window.getProfiles = saved.getProfiles;
      else delete window.getProfiles;
      for (const host of hosts) host.remove();
    }

    return outcomes;
  }, { silhouetteUrl: moduleUrl('/js/sun-body-silhouette.js') });

  expectAll(outcomes);
});
