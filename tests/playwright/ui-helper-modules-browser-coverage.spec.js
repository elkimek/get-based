import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?uiHelperCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('ui helper browser coverage renders category glyphs and chat icons', async ({ page }) => {
  await openBlankPage(page, '/ui-helper-module-coverage');

  const results = await page.evaluate(async ({ categoryGlyphsUrl, chatIconsUrl }) => {
    const [categoryGlyphs, chatIcons] = await Promise.all([
      import(categoryGlyphsUrl),
      import(chatIconsUrl),
    ]);
    const outcomes = {};

    outcomes.categoryGlyphCodesCoverKnownWordCompactAndDefaultFallbacks =
      categoryGlyphs.getCategoryGlyphCode('lipids') === 'LP'
      && categoryGlyphs.getCategoryGlyphCode('customPair', 'Alpha & Beta') === 'AB'
      && categoryGlyphs.getCategoryGlyphCode('customSingle', 'rx+') === 'RX'
      && categoryGlyphs.getCategoryGlyphCode('', '') === 'M';

    const fixture = document.getElementById('fixture');
    fixture.innerHTML = categoryGlyphs.renderCategoryGlyph('customPair', 'Alpha & Beta', { large: true });
    const glyph = fixture.querySelector('.category-glyph');
    outcomes.renderCategoryGlyphProducesAccessibleClassedMarkup =
      glyph?.textContent === 'AB'
      && glyph.classList.contains('category-glyph-large')
      && glyph.getAttribute('aria-hidden') === 'true';

    const button = document.createElement('button');
    document.body.appendChild(button);
    const renderedKinds = {};
    for (const kind of ['send', 'stop', 'copy', 'check', 'x']) {
      chatIcons.setIconButtonContent(button, kind, kind === 'send' ? 'Send' : '');
      renderedKinds[kind] = {
        svgCount: button.querySelectorAll('svg').length,
        pathCount: button.querySelectorAll('path').length,
        rectCount: button.querySelectorAll('rect').length,
        label: button.querySelector('span')?.textContent || '',
      };
    }
    chatIcons.setIconButtonContent(null, 'send', 'Ignored');
    outcomes.chatIconButtonContentCoversAllKindsAndOptionalLabel =
      renderedKinds.send.svgCount === 1
      && renderedKinds.send.pathCount === 2
      && renderedKinds.send.label === 'Send'
      && renderedKinds.stop.rectCount === 1
      && renderedKinds.copy.rectCount === 1
      && renderedKinds.copy.pathCount === 1
      && renderedKinds.check.pathCount === 1
      && renderedKinds.x.pathCount === 2;
    outcomes.staticChatIconStringsExposeExpectedSvg =
      chatIcons.CHAT_ICON_COPY.includes('<rect')
      && chatIcons.CHAT_ICON_REFRESH.includes('viewBox="0 0 24 24"')
      && chatIcons.CHAT_ICON_EDIT.includes('M12 20h9')
      && chatIcons.CHAT_ICON_X.includes('M18 6 6 18');

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    categoryGlyphsUrl: moduleUrl('/js/category-glyphs.js'),
    chatIconsUrl: moduleUrl('/js/chat-icons.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('touch tooltip browser coverage handles hover focus escape and title restoration', async ({ page }) => {
  await openBlankPage(page, '/touch-tooltip-desktop-coverage');

  const results = await page.evaluate(async ({ tooltipUrl }) => {
    const matchMediaStub = matchesFor => query => ({
      matches: matchesFor(query),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return false; },
    });
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = matchMediaStub(() => false);
    const outcomes = {};
    const waitFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    try {
      document.getElementById('fixture').innerHTML = `
        <button id="title-target" title="Native title">Hover</button>
        <div id="focus-wrap" data-app-tooltip="Focus tip">
          <button id="focus-child">Focus child</button>
          <button id="focus-next">Focus next</button>
        </div>
        <button id="click-target" data-conditions-tooltip="Condition tip">Click target</button>
      `;
      await import(tooltipUrl);

      const titleTarget = document.getElementById('title-target');
      titleTarget.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
      await waitFrame();
      const hoverTip = document.getElementById('app-tooltip');
      outcomes.hoverShowsTooltipSuspendsTitleAndAddsDescription =
        hoverTip?.textContent === 'Native title'
        && hoverTip.classList.contains('is-visible')
        && titleTarget.getAttribute('aria-describedby') === 'app-tooltip'
        && !titleTarget.hasAttribute('title');

      titleTarget.dispatchEvent(new PointerEvent('pointerout', {
        bubbles: true,
        pointerType: 'mouse',
        relatedTarget: document.body,
      }));
      await waitFrame();
      outcomes.hoverEndHidesTooltipAndRestoresTitle =
        !hoverTip.classList.contains('is-visible')
        && titleTarget.getAttribute('title') === 'Native title'
        && !titleTarget.hasAttribute('aria-describedby');

      const focusWrap = document.getElementById('focus-wrap');
      const focusChild = document.getElementById('focus-child');
      const focusNext = document.getElementById('focus-next');
      focusChild.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await waitFrame();
      const focusTip = document.getElementById('app-tooltip');
      const shownFromFocus = focusTip.textContent === 'Focus tip'
        && focusWrap.getAttribute('aria-describedby') === 'app-tooltip'
        && focusTip.classList.contains('is-visible');
      focusChild.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: focusNext }));
      await waitFrame();
      const retainedInsideActiveTarget = focusTip.classList.contains('is-visible');
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      await waitFrame();
      outcomes.focusShowsRetainsForInternalFocusAndEscapeHides =
        shownFromFocus
        && retainedInsideActiveTarget
        && !focusTip.classList.contains('is-visible')
        && !focusWrap.hasAttribute('aria-describedby');

      const clickTarget = document.getElementById('click-target');
      clickTarget.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
      await waitFrame();
      const conditionShown = document.getElementById('app-tooltip')?.textContent === 'Condition tip';
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitFrame();
      outcomes.conditionsTooltipShowsAndDocumentClickHides =
        conditionShown
        && !document.getElementById('app-tooltip').classList.contains('is-visible');

      outcomes.allOutcomesReached = true;
      return outcomes;
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  }, {
    tooltipUrl: moduleUrl('/js/touch-tooltip.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('touch tooltip browser coverage handles long press drift and touch focus suppression', async ({ page }) => {
  await openBlankPage(page, '/touch-tooltip-touch-coverage');

  const results = await page.evaluate(async ({ tooltipUrl }) => {
    const matchMediaStub = matchesFor => query => ({
      matches: matchesFor(query),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return false; },
    });
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = matchMediaStub(query => query.includes('hover: none') || query.includes('pointer: coarse'));
    const outcomes = {};
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const dispatchTouch = (target, type, touches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: touches });
      target.dispatchEvent(event);
    };

    try {
      document.getElementById('fixture').innerHTML = `
        <button id="touch-target" data-conditions-tooltip="Touch tip">Touch</button>
        <button id="plain-target">Plain</button>
      `;
      await import(tooltipUrl);
      const target = document.getElementById('touch-target');

      dispatchTouch(target, 'touchstart', [
        { clientX: 12, clientY: 24 },
        { clientX: 18, clientY: 30 },
      ]);
      await wait(550);
      outcomes.multiTouchDoesNotScheduleTooltip =
        !document.getElementById('app-tooltip')?.classList.contains('is-visible');

      dispatchTouch(target, 'touchstart', [{ clientX: 40, clientY: 60 }]);
      await wait(550);
      await waitFrame();
      const touchTip = document.getElementById('app-tooltip');
      const longPressShown = touchTip?.textContent === 'Touch tip'
        && touchTip.classList.contains('is-visible')
        && target.getAttribute('aria-describedby') === 'app-tooltip'
        && Number.isFinite(Number.parseInt(touchTip.style.left, 10))
        && Number.isFinite(Number.parseInt(touchTip.style.top, 10));
      dispatchTouch(target, 'touchmove', [{ clientX: 45, clientY: 65 }]);
      await waitFrame();
      const smallDriftKeepsTooltip = touchTip.classList.contains('is-visible');
      dispatchTouch(target, 'touchmove', [{ clientX: 70, clientY: 60 }]);
      await waitFrame();
      outcomes.longPressShowsAndLargeDriftHides =
        longPressShown
        && smallDriftKeepsTooltip
        && !touchTip.classList.contains('is-visible')
        && !target.hasAttribute('aria-describedby');

      dispatchTouch(target, 'touchstart', [{ clientX: 20, clientY: 20 }]);
      await wait(80);
      dispatchTouch(target, 'touchmove', [{ clientX: 60, clientY: 20 }]);
      await wait(550);
      outcomes.driftBeforeHoldCancelsPendingTooltip =
        !document.getElementById('app-tooltip').classList.contains('is-visible');

      dispatchTouch(target, 'touchstart', [{ clientX: 30, clientY: 30 }]);
      await wait(550);
      await waitFrame();
      dispatchTouch(target, 'touchend', []);
      await waitFrame();
      const touchEndHides = !document.getElementById('app-tooltip').classList.contains('is-visible');
      target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await waitFrame();
      outcomes.touchEndHidesAndRecentTouchSuppressesFocusTooltip =
        touchEndHides
        && !document.getElementById('app-tooltip').classList.contains('is-visible');

      dispatchTouch(target, 'touchstart', [{ clientX: 35, clientY: 35 }]);
      await wait(550);
      await waitFrame();
      const shownBeforeCancel = document.getElementById('app-tooltip').classList.contains('is-visible');
      dispatchTouch(target, 'touchcancel', []);
      await waitFrame();
      outcomes.touchCancelHidesVisibleTooltip =
        shownBeforeCancel
        && !document.getElementById('app-tooltip').classList.contains('is-visible');

      outcomes.allOutcomesReached = true;
      return outcomes;
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  }, {
    tooltipUrl: moduleUrl('/js/touch-tooltip.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
