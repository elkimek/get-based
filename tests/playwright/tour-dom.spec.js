import { expect, test } from './coverage-fixture.js';

test('guided and cycle tour DOM creates navigates layers and restores overlays', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const isVisible = selector => Array.from(document.querySelectorAll(selector)).some(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0
        && rect.height > 0
        && rect.right > 0
        && rect.left < window.innerWidth
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0';
    });

    return [
      '.welcome-primary-panel',
      '.demo-cards',
      '.profile-compact-btn',
      '.settings-btn',
    ].every(isVisible);
  });

  const results = await page.evaluate(async () => {
    const tour = await import('/js/tour.js');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, timeoutMs = 1000) => {
      const startedAt = performance.now();
      while (performance.now() - startedAt < timeoutMs) {
        if (predicate()) return true;
        await wait(25);
      }
      return predicate();
    };
    const firstVisible = selector => Array.from(document.querySelectorAll(selector)).find(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0
        && rect.height > 0
        && rect.right > 0
        && rect.left < window.innerWidth
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0';
    }) || null;

    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    const emptyTourKey = `labcharts-${profileId}-emptyTour`;
    const tourKey = `labcharts-${profileId}-tour`;
    const cycleTourKey = `labcharts-${profileId}-cycleTour`;
    const savedEmptyTourState = localStorage.getItem(emptyTourKey);
    const savedTourState = localStorage.getItem(tourKey);
    const savedCycleTourState = localStorage.getItem(cycleTourKey);

    try {
      localStorage.removeItem(emptyTourKey);
      localStorage.removeItem(tourKey);
      localStorage.removeItem(cycleTourKey);
      ['tour-overlay', 'tour-spotlight', 'tour-tooltip'].forEach(id => document.getElementById(id)?.remove());

      const exportsCallable = typeof tour.startEmptyTour === 'function'
        && typeof tour.startTour === 'function'
        && typeof tour.startGuidedTour === 'function'
        && typeof tour.startCycleTour === 'function'
        && typeof tour.endTour === 'function'
        && typeof tour.goToTourStep === 'function'
        && typeof window.startTour !== 'function'
        && typeof window._tourGoToStep !== 'function';

      tour.startEmptyTour(false);
      await wait(50);

      const overlay = document.getElementById('tour-overlay');
      const spotlight = document.getElementById('tour-spotlight');
      const tooltip = document.getElementById('tour-tooltip');
      const tourCreatesDom = !!overlay && !!spotlight && !!tooltip && overlay.style.display === 'block';
      const welcomeLayout = spotlight?.style.display === 'none'
        && tooltip?.style.left === '50%'
        && tooltip?.style.top === '50%'
        && tooltip?.style.transform === 'translate(-50%, -50%)';
      const welcomeContent = tooltip?.querySelector('h4')?.textContent === 'Welcome to getbased'
        && tooltip?.querySelector('p')?.textContent.includes('fresh profile') === true;
      const welcomeDots = tooltip?.querySelectorAll('.tour-dot').length === 5
        && tooltip?.querySelectorAll('.tour-dot')[0]?.classList.contains('active') === true
        && tooltip?.querySelectorAll('.tour-dot')[1]?.classList.contains('active') === false;
      const welcomeButtons = tooltip?.querySelectorAll('.tour-btn').length === 2
        && tooltip?.querySelectorAll('.tour-btn')[0]?.textContent.trim() === 'Skip'
        && tooltip?.querySelectorAll('.tour-btn')[0]?.classList.contains('tour-btn-secondary') === true
        && tooltip?.querySelectorAll('.tour-btn')[1]?.textContent.trim() === 'Next'
        && tooltip?.querySelectorAll('.tour-btn')[1]?.classList.contains('tour-btn-primary') === true
        && tooltip?.querySelectorAll('.tour-btn')[0]?.getAttribute('data-tour-action') === 'end'
        && tooltip?.querySelectorAll('.tour-btn')[1]?.getAttribute('data-tour-action') === 'go'
        && tooltip?.querySelectorAll('.tour-btn')[1]?.getAttribute('data-tour-index') === '1'
        && !tooltip?.querySelectorAll('.tour-btn')[0]?.hasAttribute('onclick')
        && !tooltip?.querySelectorAll('.tour-btn')[1]?.hasAttribute('onclick');

      tooltip?.querySelectorAll('.tour-btn')[1]?.click();
      const stepOneNavigation = await waitFor(() => {
        const tooltip2 = document.getElementById('tour-tooltip');
        const dots2 = tooltip2?.querySelectorAll('.tour-dot') || [];
        const btns2 = tooltip2?.querySelectorAll('.tour-btn') || [];
        return tooltip2?.querySelector('h4')?.textContent === 'Start Guided Chat'
          && dots2[1]?.classList.contains('active') === true
          && dots2[0]?.classList.contains('active') === false
          && btns2[0]?.textContent.trim() === 'Back'
          && btns2[1]?.textContent.trim() === 'Next'
          && btns2[0]?.getAttribute('data-tour-action') === 'go'
          && btns2[0]?.getAttribute('data-tour-index') === '0'
          && btns2[1]?.getAttribute('data-tour-action') === 'go'
          && btns2[1]?.getAttribute('data-tour-index') === '2'
          && !btns2[0]?.hasAttribute('onclick')
          && !btns2[1]?.hasAttribute('onclick')
          && document.getElementById('tour-spotlight')?.style.display === 'block';
      });

      const beforeInvalidIndexTitle = document.getElementById('tour-tooltip')?.querySelector('h4')?.textContent;
      tour.goToTourStep(99);
      tour.goToTourStep(-1);
      await wait(50);
      const invalidTourIndexNoops = document.getElementById('tour-tooltip')?.querySelector('h4')?.textContent === beforeInvalidIndexTitle
        && document.getElementById('tour-tooltip')?.querySelectorAll('.tour-dot')[1]?.classList.contains('active') === true;

      const startTarget = firstVisible('.welcome-primary-panel');
      let stepOneSpotlightTargetsPanel = false;
      if (startTarget) {
        startTarget.scrollIntoView({ behavior: 'instant', block: 'nearest' });
        tour.goToTourStep(1);
        await wait(150);
        const targetRect = startTarget.getBoundingClientRect();
        const sl2 = document.getElementById('tour-spotlight');
        const slLeft = parseFloat(sl2.style.left);
        const slTop = parseFloat(sl2.style.top);
        stepOneSpotlightTargetsPanel = Math.abs(slLeft - (targetRect.left - 8)) < 2
          && Math.abs(slTop - (targetRect.top - 8)) < 2
          && Math.abs(parseFloat(sl2.style.width) - (targetRect.width + 16)) < 2
          && Math.abs(parseFloat(sl2.style.height) - (targetRect.height + 16)) < 2;
      }

      document.getElementById('tour-tooltip')?.querySelectorAll('.tour-btn')[0]?.click();
      await wait(50);
      const tooltip3 = document.getElementById('tour-tooltip');
      const backReturnsToWelcome = tooltip3?.querySelector('h4')?.textContent === 'Welcome to getbased'
        && tooltip3?.querySelectorAll('.tour-dot')[0]?.classList.contains('active') === true
        && document.getElementById('tour-spotlight')?.style.display === 'none';

      tour.goToTourStep(4);
      await wait(100);
      const tooltip4 = document.getElementById('tour-tooltip');
      const btns4 = tooltip4?.querySelectorAll('.tour-btn') || [];
      const dots4 = tooltip4?.querySelectorAll('.tour-dot') || [];
      const lastStepDoneState = tooltip4?.querySelector('h4')?.textContent === 'Settings & Connections'
        && btns4[0]?.textContent.trim() === 'Back'
        && btns4[1]?.textContent.trim() === 'Done'
        && btns4[1]?.getAttribute('data-tour-action') === 'end'
        && btns4[0]?.getAttribute('data-tour-action') === 'go'
        && btns4[0]?.getAttribute('data-tour-index') === '3'
        && !btns4[0]?.hasAttribute('onclick')
        && !btns4[1]?.hasAttribute('onclick')
        && dots4[4]?.classList.contains('active') === true;

      tour.endTour();
      await wait(50);
      const endTourCleansUp = !document.getElementById('tour-overlay')
        && !document.getElementById('tour-spotlight')
        && !document.getElementById('tour-tooltip')
        && localStorage.getItem(emptyTourKey) === 'completed';

      tour.startEmptyTour(true);
      await wait(50);
      const autoTriggerCompletedNoops = !document.getElementById('tour-overlay')
        && !document.getElementById('tour-spotlight')
        && !document.getElementById('tour-tooltip');

      localStorage.setItem(emptyTourKey, 'v1:legacy-ciphertext:completed');
      tour.startEmptyTour(true);
      await wait(50);
      const legacyEncryptedFlagNoops = !document.getElementById('tour-overlay')
        && localStorage.getItem(emptyTourKey) === 'completed';

      localStorage.removeItem(emptyTourKey);
      const blocker = document.createElement('div');
      blocker.id = 'context-hub-overlay';
      blocker.className = 'confirm-overlay show';
      document.body.appendChild(blocker);
      tour.startEmptyTour(true);
      await wait(50);
      const autoTourDefersBehindModal =
        !document.getElementById('tour-overlay')
        && !document.getElementById('tour-spotlight')
        && !document.getElementById('tour-tooltip')
        && localStorage.getItem(emptyTourKey) !== 'completed';
      blocker.remove();

      localStorage.setItem(emptyTourKey, 'completed');
      tour.startEmptyTour(false);
      await wait(50);
      const manualRetriggerIgnoresCompletion = !!document.getElementById('tour-overlay')
        && !!document.getElementById('tour-tooltip');
      tour.endTour();
      await wait(50);

      localStorage.removeItem(emptyTourKey);
      tour.startGuidedTour(false);
      await wait(50);
      const guidedTourChoosesEmptyWelcomeText =
        document.getElementById('tour-tooltip')?.querySelector('p')?.textContent.includes('fresh profile') === true;
      const guidedTourChoosesEmptyStepCount =
        document.getElementById('tour-tooltip')?.querySelectorAll('.tour-dot').length === 5;
      tour.endTour();
      await wait(50);

      localStorage.removeItem(cycleTourKey);
      tour.startCycleTour(false);
      await wait(50);
      const cycleTourStartsAtCycleWelcomeTitle =
        document.getElementById('tour-tooltip')?.querySelector('h4')?.textContent === 'Cycle-Aware Lab Interpretation';
      const cycleTourStartsCentered =
        document.getElementById('tour-spotlight')?.style.display === 'none';
      tour.endTour();
      await wait(50);
      const cycleTourCompletesKey = localStorage.getItem(cycleTourKey) === 'completed';

      localStorage.removeItem(emptyTourKey);
      tour.startEmptyTour(false);
      await wait(50);
      const overlayStyles = getComputedStyle(document.getElementById('tour-overlay'));
      const spotlightStyles = getComputedStyle(document.getElementById('tour-spotlight'));
      const tooltipStyles = getComputedStyle(document.getElementById('tour-tooltip'));
      const zIndexLayering = overlayStyles.zIndex === '500'
        && spotlightStyles.zIndex === '501'
        && tooltipStyles.zIndex === '502'
        && overlayStyles.position === 'fixed'
        && spotlightStyles.position === 'fixed'
        && tooltipStyles.position === 'fixed'
        && spotlightStyles.pointerEvents === 'none'
        && overlayStyles.pointerEvents === 'auto';
      tour.endTour();
      await wait(50);

      tour.startEmptyTour(false);
      tour.goToTourStep(1);
      await wait(100);
      const tooltipRect = document.getElementById('tour-tooltip').getBoundingClientRect();
      const tooltipStaysInViewport = tooltipRect.left >= 0
        && tooltipRect.top >= 0
        && tooltipRect.right <= window.innerWidth + 1
        && tooltipRect.bottom <= window.innerHeight + 1;
      tour.endTour();
      await wait(50);

      const stepTargetsExist = !!document.querySelector('.welcome-primary-panel, #drop-zone')
        && !!document.querySelector('.demo-cards')
        && !document.querySelector('.welcome-context-summary')
        && !!document.querySelector('.profile-compact-btn')
        && !!document.querySelector('.settings-btn');

      const expectedTitles = [
        'Welcome to getbased',
        'Start Guided Chat',
        'Try a Populated Profile',
        'Profiles Stay Separate',
        'Settings & Connections',
      ];
      localStorage.removeItem(emptyTourKey);
      tour.startEmptyTour(false);
      await wait(50);
      const walkthroughSteps = [];
      for (let i = 0; i < expectedTitles.length; i++) {
        tour.goToTourStep(i);
        await wait(100);
        const tt = document.getElementById('tour-tooltip');
        walkthroughSteps.push(tt?.querySelector('h4')?.textContent === expectedTitles[i]
          && tt?.querySelectorAll('.tour-dot.active').length === 1);
      }
      const fullWalkthroughTitlesAndDots = walkthroughSteps.every(Boolean);
      tour.endTour();
      await wait(50);

      return {
        exportsCallable,
        tourCreatesDom,
        welcomeLayout,
        welcomeContent,
        welcomeDots,
        welcomeButtons,
        stepOneNavigation,
        invalidTourIndexNoops,
        stepOneSpotlightTargetsPanel,
        backReturnsToWelcome,
        lastStepDoneState,
        endTourCleansUp,
        autoTriggerCompletedNoops,
        legacyEncryptedFlagNoops,
        autoTourDefersBehindModal,
        manualRetriggerIgnoresCompletion,
        guidedTourChoosesEmptyWelcomeText,
        guidedTourChoosesEmptyStepCount,
        cycleTourStartsAtCycleWelcomeTitle,
        cycleTourStartsCentered,
        cycleTourCompletesKey,
        zIndexLayering,
        tooltipStaysInViewport,
        stepTargetsExist,
        fullWalkthroughTitlesAndDots,
      };
    } finally {
      tour.endTour?.();
      ['tour-overlay', 'tour-spotlight', 'tour-tooltip'].forEach(id => document.getElementById(id)?.remove());
      if (savedEmptyTourState) localStorage.setItem(emptyTourKey, savedEmptyTourState);
      else localStorage.removeItem(emptyTourKey);
      if (savedTourState) localStorage.setItem(tourKey, savedTourState);
      else localStorage.removeItem(tourKey);
      if (savedCycleTourState) localStorage.setItem(cycleTourKey, savedCycleTourState);
      else localStorage.removeItem(cycleTourKey);
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
