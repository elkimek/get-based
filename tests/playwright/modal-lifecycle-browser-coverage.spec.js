import { expect, test } from './coverage-fixture.js';

test.setTimeout(30_000);

const moduleUrl = path => `${path}?modalLifecycleCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('modal lifecycle browser coverage handles backdrop focus trap and scroll locks', async ({ page }) => {
  await openBlankPage(page, '/modal-lifecycle-coverage');

  const outcomes = await page.evaluate(async ({ modalUrl, reloadedModalUrl }) => {
    const modalLifecycle = await import(modalUrl);
    const reloadedModalLifecycle = await import(reloadedModalUrl);
    const waitUntil = async (predicate, label) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const click = target => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const mouseDown = target => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const originalOverflow = document.body.style.overflow;
    const outcomes = {};

    try {
      document.body.innerHTML = '<button id="before-modal">Before modal</button><main id="fixture"></main>';
      document.body.style.overflow = 'auto';

      const backdropOverlay = document.createElement('div');
      backdropOverlay.className = 'modal-overlay';
      backdropOverlay.innerHTML = '<div class="modal"><button id="inside-modal">Inside</button></div>';
      document.body.append(backdropOverlay);
      let backdropCloseCount = 0;
      modalLifecycle.wireBackdropClose(backdropOverlay, () => { backdropCloseCount += 1; });
      const insideModal = backdropOverlay.querySelector('.modal');
      mouseDown(insideModal);
      click(backdropOverlay);
      click(insideModal);
      mouseDown(backdropOverlay);
      click(backdropOverlay);
      outcomes.backdropCloseIgnoresInsidePressAndClosesOverlayClick = backdropCloseCount === 1;
      backdropOverlay.remove();

      const defaultCloseOverlay = document.createElement('div');
      defaultCloseOverlay.className = 'modal-overlay';
      defaultCloseOverlay.innerHTML = '<div class="modal">Default close</div>';
      document.body.append(defaultCloseOverlay);
      modalLifecycle._wireBackdropClose(defaultCloseOverlay);
      mouseDown(defaultCloseOverlay);
      click(defaultCloseOverlay);
      outcomes.defaultBackdropCloseRemovesOverlay = !document.body.contains(defaultCloseOverlay);

      const opener = document.createElement('button');
      opener.id = 'open-helper-opener';
      opener.textContent = 'Open helper opener';
      document.body.append(opener);
      opener.focus();
      const classOverlay = document.createElement('div');
      classOverlay.className = 'modal-overlay';
      classOverlay.innerHTML = `
        <div class="modal">
          <button id="open-helper-close">Close</button>
          <input id="open-helper-input">
        </div>
      `;
      document.body.append(classOverlay);
      modalLifecycle.openModalOverlay(classOverlay, { initialFocus: '#open-helper-input', focusDelay: 0 });
      await waitUntil(() => document.activeElement?.id === 'open-helper-input', 'open helper focus target');
      const helperOpenedAndFocused =
        classOverlay.classList.contains('show')
        && document.activeElement?.id === 'open-helper-input';
      modalLifecycle.openModalOverlay(classOverlay, { initialFocus: '#open-helper-close', focusDelay: 0 });
      await waitUntil(() => document.activeElement?.id === 'open-helper-close', 'repeat open helper focus target');
      const repeatOpenKeptOverlayShownAndFocused =
        classOverlay.classList.contains('show')
        && document.activeElement?.id === 'open-helper-close';
      modalLifecycle.closeModalOverlay('missing-overlay');
      modalLifecycle.closeModalOverlay(classOverlay);
      outcomes.openCloseOverlayHelpersToggleClassFocusAndRestore =
        helperOpenedAndFocused
        && repeatOpenKeptOverlayShownAndFocused
        && !classOverlay.classList.contains('show')
        && document.activeElement?.id === 'open-helper-opener';
      classOverlay.remove();
      opener.remove();

      const appendedOpener = document.createElement('button');
      appendedOpener.id = 'appended-opener';
      appendedOpener.textContent = 'Open appended modal';
      document.body.append(appendedOpener);
      appendedOpener.focus();
      const appendedOverlay = document.createElement('div');
      appendedOverlay.className = 'modal-overlay';
      appendedOverlay.innerHTML = `<div class="modal" role="dialog">
        <button id="appended-first">First</button>
        <button id="appended-last">Last</button>
      </div>`;
      let appendedCloseCount = 0;
      modalLifecycle.openAppendedModalOverlay(appendedOverlay, () => {
        appendedCloseCount += 1;
        modalLifecycle.removeModalOverlay(appendedOverlay);
      });
      await waitUntil(() => document.activeElement?.id === 'appended-first', 'appended modal focus');
      document.getElementById('appended-last')?.focus();
      const appendedTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      document.dispatchEvent(appendedTab);
      const appendedTabWrapped = appendedTab.defaultPrevented && document.activeElement?.id === 'appended-first';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await waitUntil(() => !document.body.contains(appendedOverlay), 'appended modal callback close');
      outcomes.appendedEscapeUsesOwnerCleanupAndTrapsTab =
        appendedOverlay.hasAttribute('data-modal-lifecycle-managed')
        && appendedTabWrapped
        && appendedCloseCount === 1
        && document.activeElement?.id === 'appended-opener';
      appendedOpener.remove();

      const beforeModal = document.getElementById('before-modal');
      beforeModal.focus();
      const overlayA = document.createElement('div');
      overlayA.className = 'modal-overlay';
      overlayA.innerHTML = `
        <div class="modal">
          <button disabled>Disabled</button>
          <button id="modal-first">First</button>
          <a id="modal-link" href="#modal-link">Link</a>
        </div>
      `;
      document.body.append(overlayA);
      modalLifecycle.trapModalFocus(overlayA);
      await waitUntil(() => document.activeElement?.id === 'modal-first', 'first modal focus');
      outcomes.trapLocksScrollAndFocusesFirstFocusable =
        document.body.style.overflow === 'hidden'
        && document.activeElement?.id === 'modal-first';

      const overlayB = document.createElement('div');
      overlayB.className = 'modal-overlay';
      overlayB.innerHTML = '<div class="modal"><button id="modal-second">Second</button></div>';
      document.body.append(overlayB);
      modalLifecycle.trapModalFocus(overlayB);
      overlayB.remove();
      await waitUntil(() => !document.body.contains(overlayB) && document.body.style.overflow === 'hidden', 'nested modal teardown');
      outcomes.nestedModalRemovalKeepsOuterScrollLock =
        document.body.contains(overlayA)
        && document.body.style.overflow === 'hidden';

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await waitUntil(() => !document.body.contains(overlayA) && document.body.style.overflow === 'auto', 'outer modal escape teardown');
      outcomes.escapeRemovesOverlayRestoresScrollAndPreviousFocus =
        !document.body.contains(overlayA)
        && document.body.style.overflow === 'auto'
        && document.activeElement?.id === 'before-modal';

      const overlayCrossA = document.createElement('div');
      overlayCrossA.className = 'modal-overlay';
      overlayCrossA.innerHTML = '<div class="modal"><button>Cross A</button></div>';
      const overlayCrossB = document.createElement('div');
      overlayCrossB.className = 'modal-overlay';
      overlayCrossB.innerHTML = '<div class="modal"><button>Cross B</button></div>';
      document.body.append(overlayCrossA, overlayCrossB);
      modalLifecycle.trapModalFocus(overlayCrossA);
      reloadedModalLifecycle.trapModalFocus(overlayCrossB);
      overlayCrossA.remove();
      await waitUntil(() => !document.body.contains(overlayCrossA) && document.body.style.overflow === 'hidden', 'cross-import first teardown');
      const lockedAfterFirstCrossRemoval = document.body.style.overflow === 'hidden';
      overlayCrossB.remove();
      await waitUntil(() => document.body.style.overflow === 'auto', 'cross-import final teardown');
      outcomes.scrollLocksAreSharedAcrossCacheBustedImports =
        lockedAfterFirstCrossRemoval
        && document.body.style.overflow === 'auto';

      const detachedFocus = document.createElement('button');
      detachedFocus.id = 'detached-focus';
      document.body.append(detachedFocus);
      detachedFocus.focus();
      const overlayDetached = document.createElement('div');
      overlayDetached.className = 'modal-overlay';
      overlayDetached.innerHTML = '<div class="modal"><button>Detached restore</button></div>';
      document.body.append(overlayDetached);
      modalLifecycle.trapModalFocus(overlayDetached);
      detachedFocus.remove();
      let detachedRestoreThrew = false;
      try {
        overlayDetached.remove();
        await waitUntil(() => document.body.style.overflow === 'auto', 'detached focus teardown');
      } catch {
        detachedRestoreThrew = true;
      }
      outcomes.detachedPreviousFocusDoesNotBreakRestore =
        detachedRestoreThrew === false
        && document.body.style.overflow === 'auto';

      return outcomes;
    } finally {
      document.body.style.overflow = originalOverflow;
      document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.remove());
    }
  }, {
    modalUrl: moduleUrl('/js/modal-lifecycle.js'),
    reloadedModalUrl: moduleUrl('/js/modal-lifecycle.js'),
  });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
