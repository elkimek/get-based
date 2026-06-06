import { expect, test } from './coverage-fixture.js';

test('guided tour DOM creates, navigates, layers, and restores the empty tour overlay', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof window.startEmptyTour === 'function'
      && typeof window.startTour === 'function'
      && typeof window.startGuidedTour === 'function'
      && typeof window.endTour === 'function'
      && typeof window._tourGoToStep === 'function'
  );

  const results = await page.evaluate(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
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
    const savedEmptyTourState = localStorage.getItem(emptyTourKey);
    const savedTourState = localStorage.getItem(tourKey);

    try {
      localStorage.removeItem(emptyTourKey);
      localStorage.removeItem(tourKey);
      ['tour-overlay', 'tour-spotlight', 'tour-tooltip'].forEach(id => document.getElementById(id)?.remove());

      const exportsCallable = typeof window.startEmptyTour === 'function'
        && typeof window.startTour === 'function'
        && typeof window.startGuidedTour === 'function'
        && typeof window.endTour === 'function'
        && typeof window._tourGoToStep === 'function';

      window.startEmptyTour(false);
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
      // Tour buttons are rendered by tour.js as HTML strings with inline onclick handlers.
      const welcomeButtons = tooltip?.querySelectorAll('.tour-btn').length === 2
        && tooltip?.querySelectorAll('.tour-btn')[0]?.textContent.trim() === 'Skip'
        && tooltip?.querySelectorAll('.tour-btn')[0]?.classList.contains('tour-btn-secondary') === true
        && tooltip?.querySelectorAll('.tour-btn')[1]?.textContent.trim() === 'Next'
        && tooltip?.querySelectorAll('.tour-btn')[1]?.classList.contains('tour-btn-primary') === true
        && tooltip?.querySelectorAll('.tour-btn')[0]?.getAttribute('onclick')?.includes('endTour') === true
        && tooltip?.querySelectorAll('.tour-btn')[1]?.getAttribute('onclick')?.includes('_tourGoToStep(1)') === true;

      window._tourGoToStep(1);
      await wait(100);
      const tooltip2 = document.getElementById('tour-tooltip');
      const dots2 = tooltip2?.querySelectorAll('.tour-dot') || [];
      const btns2 = tooltip2?.querySelectorAll('.tour-btn') || [];
      const stepOneNavigation = tooltip2?.querySelector('h4')?.textContent === 'Start Guided Chat'
        && dots2[1]?.classList.contains('active') === true
        && dots2[0]?.classList.contains('active') === false
        && btns2[0]?.textContent.trim() === 'Back'
        && btns2[1]?.textContent.trim() === 'Next'
        && btns2[0]?.getAttribute('onclick')?.includes('_tourGoToStep(0)') === true
        && btns2[1]?.getAttribute('onclick')?.includes('_tourGoToStep(2)') === true
        && document.getElementById('tour-spotlight')?.style.display === 'block';

      const startTarget = firstVisible('.welcome-primary-panel');
      let stepOneSpotlightTargetsPanel = false;
      if (startTarget) {
        startTarget.scrollIntoView({ behavior: 'instant', block: 'nearest' });
        window._tourGoToStep(1);
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

      window._tourGoToStep(0);
      await wait(50);
      const tooltip3 = document.getElementById('tour-tooltip');
      const backReturnsToWelcome = tooltip3?.querySelector('h4')?.textContent === 'Welcome to getbased'
        && tooltip3?.querySelectorAll('.tour-dot')[0]?.classList.contains('active') === true
        && document.getElementById('tour-spotlight')?.style.display === 'none';

      window._tourGoToStep(4);
      await wait(100);
      const tooltip4 = document.getElementById('tour-tooltip');
      const btns4 = tooltip4?.querySelectorAll('.tour-btn') || [];
      const dots4 = tooltip4?.querySelectorAll('.tour-dot') || [];
      const lastStepDoneState = tooltip4?.querySelector('h4')?.textContent === 'Settings & Connections'
        && btns4[0]?.textContent.trim() === 'Back'
        && btns4[1]?.textContent.trim() === 'Done'
        && btns4[1]?.getAttribute('onclick')?.includes('endTour') === true
        && btns4[0]?.getAttribute('onclick')?.includes('_tourGoToStep(3)') === true
        && dots4[4]?.classList.contains('active') === true;

      window.endTour();
      await wait(50);
      const endTourCleansUp = !document.getElementById('tour-overlay')
        && !document.getElementById('tour-spotlight')
        && !document.getElementById('tour-tooltip')
        && localStorage.getItem(emptyTourKey) === 'completed';

      window.startEmptyTour(true);
      await wait(50);
      const autoTriggerCompletedNoops = !document.getElementById('tour-overlay')
        && !document.getElementById('tour-spotlight')
        && !document.getElementById('tour-tooltip');

      localStorage.setItem(emptyTourKey, 'v1:legacy-ciphertext:completed');
      window.startEmptyTour(true);
      await wait(50);
      const legacyEncryptedFlagNoops = !document.getElementById('tour-overlay')
        && localStorage.getItem(emptyTourKey) === 'completed';

      window.startEmptyTour(false);
      await wait(50);
      const manualRetriggerIgnoresCompletion = !!document.getElementById('tour-overlay')
        && !!document.getElementById('tour-tooltip');
      window.endTour();
      await wait(50);

      localStorage.removeItem(emptyTourKey);
      window.startEmptyTour(false);
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
      window.endTour();
      await wait(50);

      window.startEmptyTour(false);
      window._tourGoToStep(1);
      await wait(100);
      const tooltipRect = document.getElementById('tour-tooltip').getBoundingClientRect();
      const tooltipStaysInViewport = tooltipRect.left >= 0
        && tooltipRect.top >= 0
        && tooltipRect.right <= window.innerWidth + 1
        && tooltipRect.bottom <= window.innerHeight + 1;
      window.endTour();
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
      window.startEmptyTour(false);
      await wait(50);
      const walkthroughSteps = [];
      for (let i = 0; i < expectedTitles.length; i++) {
        window._tourGoToStep(i);
        await wait(100);
        const tt = document.getElementById('tour-tooltip');
        walkthroughSteps.push(tt?.querySelector('h4')?.textContent === expectedTitles[i]
          && tt?.querySelectorAll('.tour-dot.active').length === 1);
      }
      const fullWalkthroughTitlesAndDots = walkthroughSteps.every(Boolean);
      window.endTour();
      await wait(50);

      return {
        exportsCallable,
        tourCreatesDom,
        welcomeLayout,
        welcomeContent,
        welcomeDots,
        welcomeButtons,
        stepOneNavigation,
        stepOneSpotlightTargetsPanel,
        backReturnsToWelcome,
        lastStepDoneState,
        endTourCleansUp,
        autoTriggerCompletedNoops,
        legacyEncryptedFlagNoops,
        manualRetriggerIgnoresCompletion,
        zIndexLayering,
        tooltipStaysInViewport,
        stepTargetsExist,
        fullWalkthroughTitlesAndDots,
      };
    } finally {
      window.endTour?.();
      ['tour-overlay', 'tour-spotlight', 'tour-tooltip'].forEach(id => document.getElementById(id)?.remove());
      if (savedEmptyTourState) localStorage.setItem(emptyTourKey, savedEmptyTourState);
      else localStorage.removeItem(emptyTourKey);
      if (savedTourState) localStorage.setItem(tourKey, savedTourState);
      else localStorage.removeItem(tourKey);
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
