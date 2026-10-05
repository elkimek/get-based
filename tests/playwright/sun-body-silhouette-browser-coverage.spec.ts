type SilhouetteFixtureDeps = Omit<NonNullable<Parameters<typeof import('../../js/sun-body-silhouette-runtime.js').configureSunBodySilhouetteRuntimeDeps>[0]>, 'getProfiles'> & {getProfiles?: ()=>Array<{id:string;sex:unknown}>};
import { createExpectAll } from '../helpers/browser-outcomes.js';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('sunBodySilhouetteCoverage');

const expectAll = createExpectAll(expect, 'collect');

test('sun body silhouette covers stock render region map overlay and input paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ missingCanvasSilhouetteUrl, pathsUrl, silhouetteUrl }) => {
    const [silhouette, silhouetteRuntime] = await Promise.all([
      (import(silhouetteUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/sun-body-silhouette.js'), "renderBodySilhouette" | "resetBodySilhouetteState" | "_testLoadRegionMap" | "_testStockImg" | "_testRegionAtSource" | "bindBodySilhouette">>,
      import('/js/sun-body-silhouette-runtime.js'),
    ]);
    const paths = (await import(pathsUrl) as unknown) as Pick<typeof import('../../js/silhouette-paths.js'), "buildBodyParts" | "FEMALE_BODY_PATH" | "MALE_BODY_PATH">;
    const outcomes: Record<string, unknown> = {};
    const previousSilhouetteRuntimeDeps = (silhouetteRuntime.configureSunBodySilhouetteRuntimeDeps as (deps?: SilhouetteFixtureDeps) => ReturnType<typeof silhouetteRuntime.configureSunBodySilhouetteRuntimeDeps>)();
    const hosts: HTMLDivElement[] = [];
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate: () => unknown, attempts = 120) => {
      for (let i = 0; i < attempts; i += 1) {
        if (predicate()) return true;
        await delay(10);
      }
      return false;
    };
    const pickerToSource = (cell: {ch:number;cw:number;sx:number;sy:number}, px: number, py: number) => {
      const scale = 210 / cell.ch;
      const cellWScaled = cell.cw * scale;
      const xOffset = (100 - cellWScaled) / 2;
      return {
        x: cell.sx + (px - xOffset) / scale,
        y: cell.sy + py / scale,
      };
    };
    const mount = (selected = new Set<string>()) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.innerHTML = silhouette.renderBodySilhouette(selected);
      hosts.push(host);
      return host;
    };

    try {
      silhouette.resetBodySilhouetteState();
      (silhouetteRuntime.configureSunBodySilhouetteRuntimeDeps as (deps?: SilhouetteFixtureDeps) => ReturnType<typeof silhouetteRuntime.configureSunBodySilhouetteRuntimeDeps>)({
        getActiveProfileId: () => 'profile-female',
        getProfiles: () => [{ id: 'profile-female', sex: 'female' }],
      });

      const femaleParts = paths.buildBodyParts('female');
      const maleParts = paths.buildBodyParts('male');
      const expectedPartKeys = 'armL,armR,head,legL,legR,torso';
      outcomes.legacyBuildBodyPartsReturnsCanonicalPaths =
        femaleParts.head === paths.FEMALE_BODY_PATH
        && femaleParts.torso === paths.FEMALE_BODY_PATH
        && maleParts.head === paths.MALE_BODY_PATH
        && maleParts.legL === paths.MALE_BODY_PATH
        && Object.keys(femaleParts).sort().join(',') === expectedPartKeys
        && Object.keys(maleParts).sort().join(',') === expectedPartKeys;

      const femaleHost = mount(new Set(['face', 'arms-back']));
      const femaleSvg = femaleHost.querySelector<SVGSVGElement>('svg.sun-silhouette');
      outcomes.renderUsesFemaleStockFigureAndPendingOverlay = femaleSvg?.dataset.sex === 'female'
        && femaleSvg.classList.contains('sun-silhouette-stock')
        && femaleSvg.dataset.selectionOverlay === 'pending'
        && !!femaleHost.querySelector('[data-region="face"][aria-pressed="true"]')
        && !!femaleHost.querySelector('[data-region="arms-back"][aria-pressed="true"]')
        && !!femaleHost.querySelector('mask#sun-fig-mask-front image[href="/er-mask.png"]')
        && !!femaleHost.querySelector('image[href="/er.svg"]');

      (silhouetteRuntime.configureSunBodySilhouetteRuntimeDeps as (deps?: SilhouetteFixtureDeps) => ReturnType<typeof silhouetteRuntime.configureSunBodySilhouetteRuntimeDeps>)({
        getActiveProfileId: () => { throw new Error('profile lookup unavailable'); },
        getProfiles: () => { throw new Error('profiles unavailable'); },
      });
      const fallbackHost = mount(new Set());
      outcomes.profileLookupFailureFallsBackToMale = fallbackHost.querySelector<SVGSVGElement>('svg.sun-silhouette')?.dataset.sex === 'male';

      const map = await silhouette._testLoadRegionMap();
      const stock = silhouette._testStockImg;
      const maleFacePoint = pickerToSource(stock.cells['male-front']!, 50, 18);
      const maleLegPoint = pickerToSource(stock.cells['male-back']!, 50, 120);
      outcomes.regionMapLoadsAndSamplesExpectedRegions = map.width === 1700
        && map.height === 2698
        && (silhouette._testRegionAtSource as (...args: Parameters<typeof silhouette._testRegionAtSource>) => unknown)(maleFacePoint.x, maleFacePoint.y) === 'face'
        && (silhouette._testRegionAtSource as (...args: Parameters<typeof silhouette._testRegionAtSource>) => unknown)(maleLegPoint.x, maleLegPoint.y) === 'legs-back'
        && (silhouette._testRegionAtSource as (...args: Parameters<typeof silhouette._testRegionAtSource>) => unknown)(-1, -1) === null;

      let overlayReady = 0;
      const onOverlayReady = () => {
        overlayReady += 1;
      };
      window.addEventListener('sun-overlay-ready', onOverlayReady);
      try {
        const selected = new Set(['face', 'legs-back']);
        const overlayHost = mount(selected);
        outcomes.overlayStartsPendingAfterMapLoad = overlayHost.querySelector<SVGSVGElement>('svg.sun-silhouette')?.dataset.selectionOverlay === 'pending';
        const ready = await waitFor(() => overlayReady > 0);
        overlayHost.innerHTML = silhouette.renderBodySilhouette(selected);
        const readySvg = overlayHost.querySelector<SVGSVGElement>('svg.sun-silhouette');
        outcomes.selectionOverlayBecomesReadyBlob = ready
          && readySvg?.dataset.selectionOverlay === 'ready'
          && Array.from(overlayHost.querySelectorAll('image')).some(img => img.getAttribute('href')?.startsWith('blob:'));
      } finally {
        window.removeEventListener('sun-overlay-ready', onOverlayReady);
      }

      const selected = new Set(['face']);
      const bindHost = mount(selected);
      const changes: string[][] = [];
      silhouette.bindBodySilhouette(bindHost, selected, set => changes.push(Array.from(set).sort()));

      const facePath = bindHost.querySelector('[data-region="face"][data-view="front"]');
      facePath?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await delay(0);
      outcomes.keyboardSpaceTogglesRegion = !selected.has('face')
        && changes.length === 1
        && changes[0]!.includes('face') === false;

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

      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      silhouette.resetBodySilhouetteState();
      HTMLCanvasElement.prototype.getContext = () => null;
      try {
        const missingOverlayContextMarkup = silhouette.renderBodySilhouette(new Set(['face']));
        outcomes.missingOverlayContextKeepsPickerUsable =
          missingOverlayContextMarkup.includes('data-selection-overlay="pending"')
          && !missingOverlayContextMarkup.includes('blob:');

        const missingCanvasSilhouette = (await import(missingCanvasSilhouetteUrl) as unknown) as Pick<typeof import('../../js/sun-body-silhouette.js'), "_testLoadRegionMap">;
        let missingMapContextError = '';
        try {
          await missingCanvasSilhouette._testLoadRegionMap();
        } catch (error: unknown) {
          missingMapContextError = (error as {message?: string} | null | undefined)?.message || String(error);
        }
        outcomes.missingMapContextFailsClearly =
          missingMapContextError === 'Body silhouette requires a 2D canvas context';
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    } finally {
      silhouette.resetBodySilhouetteState();
      (silhouetteRuntime.configureSunBodySilhouetteRuntimeDeps as (deps?: SilhouetteFixtureDeps) => ReturnType<typeof silhouetteRuntime.configureSunBodySilhouetteRuntimeDeps>)(previousSilhouetteRuntimeDeps);
      for (const host of hosts) host.remove();
    }

    return outcomes;
  }, {
    missingCanvasSilhouetteUrl: moduleUrl('/js/sun-body-silhouette.js'),
    pathsUrl: moduleUrl('/js/silhouette-paths.js'),
    silhouetteUrl: moduleUrl('/js/sun-body-silhouette.js'),
  });

  expectAll(outcomes);
});
