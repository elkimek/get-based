import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?sunSessionActionsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/sun-session-actions-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main><section id="outside"></section></body></html>',
  }));
  await page.goto('/sun-session-actions-coverage', { waitUntil: 'load' });
}

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('sun session action delegates route clicks keyboard and modal actions in browser', async ({ page }) => {
  await openBlankPage(page);

  const outcomes = await page.evaluate(async ({ actionsUrl }) => {
    const actionsModule = await import(actionsUrl);
    const root = document.getElementById('fixture');
    const outside = document.getElementById('outside');
    const outcomes = {};
    const calls = [];
    const push = (...args) => calls.push(args);
    const byId = id => document.getElementById(id);
    const click = id => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      return byId(id).dispatchEvent(event);
    };
    const keydown = (id, key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      return byId(id).dispatchEvent(event);
    };
    const called = (name, predicate = () => true) => calls.some(call => call[0] === name && predicate(call));
    const callCount = name => calls.filter(call => call[0] === name).length;

    const detailAttrs = actionsModule.sunSessionActionAttrs('open-detail', {
      id: 'sun-1',
      closeModal: false,
      label: 'Noon "UV" <session>',
    });
    const closeDeleteAttrs = actionsModule.sunSessionActionAttrs('delete-session', {
      id: 'sun-2',
      closeModal: true,
    });

    root.innerHTML = `
      <div id="open-detail" role="button" tabindex="0" ${detailAttrs}>Open</div>
      <button id="delete-session" ${closeDeleteAttrs}>Delete</button>
      <button id="quick-log" ${actionsModule.sunSessionActionAttrs('quick-log-sun')}>Quick</button>
      <button id="pause" ${actionsModule.sunSessionActionAttrs('pause-session', { id: 'sun-1' })}>Pause</button>
      <button id="resume" ${actionsModule.sunSessionActionAttrs('resume-session', { id: 'sun-1' })}>Resume</button>
      <button id="flip" ${actionsModule.sunSessionActionAttrs('flip-sides', { id: 'sun-1' })}>Flip</button>
      <button id="coverage" ${actionsModule.sunSessionActionAttrs('change-coverage', { id: 'sun-1' })}>Coverage</button>
      <button id="sunscreen" ${actionsModule.sunSessionActionAttrs('apply-sunscreen', { id: 'sun-1' })}>Sunscreen</button>
      <button id="ozone" ${actionsModule.sunSessionActionAttrs('override-ozone')}>Ozone</button>
      <div id="forgot-stop" role="button" tabindex="0" ${actionsModule.sunSessionActionAttrs('forgot-stop', { id: 'sun-1' })}>Forgot</div>
      <div id="channel-overlay" class="modal-overlay">
        <div id="open-channel" role="button" tabindex="0" ${actionsModule.sunSessionActionAttrs('open-channel', { channel: 'vitamin_d' })}>Channel</div>
      </div>
      <div id="close-overlay" class="modal-overlay">
        <button id="close-modal" ${actionsModule.sunSessionActionAttrs('close-modal')}>Close</button>
      </div>
      <div id="edit-overlay" class="modal-overlay">
        <button id="edit-duration" ${actionsModule.sunSessionActionAttrs('edit-duration', { id: 'sun-2' })}>Edit</button>
      </div>
      <div id="delete-overlay" class="modal-overlay">
        <button id="delete-close" ${actionsModule.sunSessionActionAttrs('delete-session', { id: 'sun-3', closeModal: true })}>Delete close</button>
      </div>
      <div id="chips" class="sun-channel-chips">
        <button id="toggle-chips" ${actionsModule.sunSessionActionAttrs('toggle-chips', { hiddenCount: 3 })} aria-expanded="false">More</button>
      </div>
      <div id="other-chips" class="sun-channel-chips"></div>
      <div id="ignore" ${actionsModule.sunSessionActionAttrs('ignore')}>
        <button id="ignored-button">Ignored</button>
      </div>
      <div id="detail-with-input" role="button" tabindex="0" ${actionsModule.sunSessionActionAttrs('open-detail', { id: 'sun-input' })}>
        <input id="nested-input" />
      </div>
      <div id="keyboard-close" role="button" tabindex="0" ${actionsModule.sunSessionActionAttrs('close-modal')}>Keyboard close</div>
    `;
    outside.innerHTML = `<button id="outside-detail" ${actionsModule.sunSessionActionAttrs('open-detail', { id: 'outside' })}>Outside</button>`;

    document.addEventListener('click', () => push('document-click'));
    document.addEventListener('keydown', () => push('document-keydown'));
    const delegateActions = {
      openSunSessionDetail: id => push('openSunSessionDetail', id),
      deleteSunSession: id => push('deleteSunSession', id),
      editSunSessionDuration: id => push('editSunSessionDuration', id),
      quickLogSunSession: () => push('quickLogSunSession'),
      pauseSunSession: id => push('pauseSunSession', id),
      resumeSunSession: id => push('resumeSunSession', id),
      flipSidesMidSession: id => push('flipSidesMidSession', id),
      changeCoverageMidSession: id => push('changeCoverageMidSession', id),
      applySunscreenMidSession: id => push('applySunscreenMidSession', id),
      setOzoneOverrideMidSession: () => push('setOzoneOverrideMidSession'),
      forgotStopPrompt: id => push('_forgotStopPrompt', id),
      openChannelOnLightPage: channel => push('_openChannelOnLightPage', channel),
    };
    actionsModule.installSunSessionActionDelegates(delegateActions, root);
    actionsModule.installSunSessionActionDelegates(delegateActions, root);

    outcomes.attrsConvertCamelCaseEscapeValuesAndOmitFalsey =
      detailAttrs.includes('data-sun-session-id="sun-1"')
      && detailAttrs.includes('Noon &quot;UV&quot; &lt;session&gt;')
      && !detailAttrs.includes('data-sun-session-close-modal')
      && closeDeleteAttrs.includes('data-sun-session-close-modal="true"');

    const beforeDetail = callCount('openSunSessionDetail');
    const detailAllowed = click('open-detail');
    outcomes.clickRoutesActionAndInstallIsIdempotent =
      detailAllowed === false
      && callCount('openSunSessionDetail') === beforeDetail + 1
      && called('openSunSessionDetail', call => call[1] === 'sun-1')
      && callCount('document-click') === 0;

    click('quick-log');
    click('pause');
    click('resume');
    click('flip');
    click('coverage');
    click('sunscreen');
    click('ozone');
    click('forgot-stop');
    outcomes.clickRoutesInjectedActions =
      called('quickLogSunSession')
      && called('pauseSunSession', call => call[1] === 'sun-1')
      && called('resumeSunSession', call => call[1] === 'sun-1')
      && called('flipSidesMidSession', call => call[1] === 'sun-1')
      && called('changeCoverageMidSession', call => call[1] === 'sun-1')
      && called('applySunscreenMidSession', call => call[1] === 'sun-1')
      && called('setOzoneOverrideMidSession')
      && called('_forgotStopPrompt', call => call[1] === 'sun-1')
      && callCount('document-click') === 0;

    click('open-channel');
    click('close-modal');
    click('edit-duration');
    click('delete-close');
    outcomes.clickClosesContainingOverlaysAndRoutesModalActions =
      !document.getElementById('channel-overlay')
      && !document.getElementById('close-overlay')
      && !document.getElementById('edit-overlay')
      && !document.getElementById('delete-overlay')
      && called('_openChannelOnLightPage', call => call[1] === 'vitamin_d')
      && called('editSunSessionDuration', call => call[1] === 'sun-2')
      && called('deleteSunSession', call => call[1] === 'sun-3');

    click('toggle-chips');
    const expandedOnce = byId('chips').classList.contains('sun-chips-expanded');
    const expandedAria = byId('toggle-chips').getAttribute('aria-expanded') === 'true'
      && byId('toggle-chips').getAttribute('aria-label') === 'Show fewer light channels';
    const otherExpandedOnce = byId('other-chips').classList.contains('sun-chips-expanded');
    click('toggle-chips');
    const collapsedAgain = !byId('chips').classList.contains('sun-chips-expanded');
    const collapsedAria = byId('toggle-chips').getAttribute('aria-expanded') === 'false'
      && byId('toggle-chips').getAttribute('aria-label') === 'Show 3 additional light channels';
    const otherCollapsedAgain = !byId('other-chips').classList.contains('sun-chips-expanded');
    outcomes.toggleChipsOnlyChangesOwningChipContainer =
      expandedOnce && expandedAria && !otherExpandedOnce && collapsedAgain && collapsedAria && otherCollapsedAgain;

    const beforeIgnore = calls.length;
    const ignoreAllowed = click('ignored-button');
    outcomes.ignoreActionStillStopsEventWithoutRouting =
      ignoreAllowed === false
      && calls.length === beforeIgnore
      && callCount('document-click') === 0;

    click('outside-detail');
    outcomes.delegatesScopeActionsToInstalledRoot =
      !called('openSunSessionDetail', call => call[1] === 'outside')
      && callCount('document-click') === 1;

    root.insertAdjacentHTML('beforeend', `
      <div id="keyboard-channel-overlay" class="modal-overlay">
        <div id="keyboard-channel" role="button" tabindex="0" ${actionsModule.sunSessionActionAttrs('open-channel', { channel: 'vitamin_d' })}>Keyboard channel</div>
      </div>
    `);
    const docKeysBefore = callCount('document-keydown');
    const detailCallsBeforeKeyboard = callCount('openSunSessionDetail');
    const forgotCallsBeforeKeyboard = callCount('_forgotStopPrompt');
    const channelCallsBeforeKeyboard = callCount('_openChannelOnLightPage');
    const detailEnterAllowed = keydown('open-detail', 'Enter');
    const forgotSpaceAllowed = keydown('forgot-stop', ' ');
    const channelEnterAllowed = keydown('keyboard-channel', 'Enter');
    const docKeysAfterAllowed = callCount('document-keydown');
    keydown('keyboard-close', 'Enter');
    byId('nested-input').focus();
    keydown('nested-input', 'Enter');
    outcomes.keyboardRoutesAllowedRoleButtonsAndIgnoresOtherTargets =
      detailEnterAllowed === false
      && forgotSpaceAllowed === false
      && channelEnterAllowed === false
      && callCount('openSunSessionDetail') === detailCallsBeforeKeyboard + 1
      && callCount('_forgotStopPrompt') === forgotCallsBeforeKeyboard + 1
      && callCount('_openChannelOnLightPage') === channelCallsBeforeKeyboard + 1
      && !document.getElementById('keyboard-channel-overlay')
      && docKeysAfterAllowed === docKeysBefore
      && callCount('document-keydown') === docKeysBefore + 2
      && !called('openSunSessionDetail', call => call[1] === 'sun-input');

    const docClicksBeforeDelete = callCount('document-click');
    const deleteAllowed = click('delete-session');
    outcomes.deleteSessionNotInOverlayPreventsDefaultStopsBubbleAndRoutes =
      deleteAllowed === false
      && called('deleteSunSession', call => call[1] === 'sun-2')
      && callCount('document-click') === docClicksBeforeDelete;

    return outcomes;
  }, {
    actionsUrl: moduleUrl('/js/sun-session-actions.js'),
  });

  expectAll(outcomes);
});
