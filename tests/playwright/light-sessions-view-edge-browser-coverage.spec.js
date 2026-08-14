import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightSessionsViewEdgeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('light sessions view edge coverage handles empty and compact device history states', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('body');

  const results = await page.evaluate(async ({ sessionsUrl }) => {
    const sessionsView = await import(sessionsUrl);
    const outcomes = {};
    const calls = [];
    const base = Date.UTC(2026, 5, 10, 10, 0);
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const resetDeps = () => sessionsView.configureLightSessionsView({
      getSessions: () => [],
      getDeviceSessions: () => [],
      getDevices: () => [],
      renderSunSessionRow: () => '',
      openDeviceSessionDetail: () => {},
      deleteDeviceSession: () => {},
      renderDeviceSessionAIInline: () => '',
      channelDisplay: {},
      channelTier: () => 0,
      formatChannelUnit: () => '',
    });

    try {
      sessionsView.configureLightSessionsView({
        getSessions: () => [],
        getDeviceSessions: () => [],
        getDevices: () => [],
        renderSunSessionRow: sess => `<div class="sun-session light-session-row light-session-sun" data-id="${sess.id}" role="button">${sess.id}</div>`,
        openDeviceSessionDetail: id => calls.push(['detail', id]),
        deleteDeviceSession: id => calls.push(['delete', id]),
        renderDeviceSessionAIInline: sess => `<span class="ai-inline">AI ${sess.id}</span>`,
        channelDisplay: {
          pbm_red: { icon: 'R', label: 'Red <unsafe>', what: 'Red channel' },
          pbm_nir: { icon: 'N', label: 'NIR', what: 'Near infrared' },
        },
        channelTier: (value, key) => key === 'pbm_nir' && value > 0 ? 3 : 0,
        formatChannelUnit: (key, value) => `${Math.round(value)} ${key}`,
      });

      outcomes.emptyInlineReturnsBlank = sessionsView.renderUnifiedSessionsList() === '';
      sessionsView._openAllSessionsModal();
      let overlay = document.querySelector('.light-sessions-modal-overlay');
      outcomes.emptyModalRendersSummaryAndEmptyState = overlay?.textContent.includes('All sessions (0)') === true
        && overlay?.textContent.includes('No completed sessions yet.') === true
        && overlay?.querySelectorAll('.sun-session').length === 0;
      overlay?.remove();

      sessionsView.configureLightSessionsView({
        getSessions: () => [
          { id: 'sun-only-a', startedAt: base - 60000, endedAt: base, durationMin: 10 },
          { id: 'sun-active', startedAt: base + 1000, endedAt: null, durationMin: 0 },
        ],
        getDeviceSessions: () => [],
      });
      const sunOnlyHost = document.createElement('div');
      sunOnlyHost.innerHTML = sessionsView.renderUnifiedSessionsList();
      outcomes.sunOnlyInlineHasNoUnifiedClassOrShowMore = sunOnlyHost.querySelectorAll('.sun-session').length === 1
        && !sunOnlyHost.querySelector('.light-sessions-list-unified')
        && !sunOnlyHost.querySelector('.light-sessions-show-more');

      sessionsView.configureLightSessionsView({
        getSessions: () => [],
        getDevices: () => [{
          id: 'panel-a',
          brand: 'Panel <Co>',
          model: 'Red & NIR',
          modes: [
            { id: 'red', label: 'Red only', default: true },
            { id: 'nir', label: 'NIR boost' },
          ],
        }],
        getDeviceSessions: () => [
          {
            id: 'dev-nir',
            deviceId: 'panel-a',
            startedAt: base,
            endedAt: base + 60000,
            durationMin: 9.6,
            distanceCm: 18,
            bodyArea: 'hands',
            eyesProtected: true,
            doses: { pbm_red: 0, pbm_nir: 4.2 },
            mode: 'nir',
          },
          {
            id: 'dev-removed',
            deviceId: 'missing-panel',
            startedAt: base - 60000,
            endedAt: base,
            durationMin: 0,
            distanceCm: 30,
            bodyArea: '',
            eyesProtected: false,
            doses: {},
          },
          { id: 'dev-active', deviceId: 'panel-a', startedAt: base + 1000, endedAt: null },
        ],
      });
      const mixedHost = document.createElement('div');
      mixedHost.innerHTML = sessionsView.renderUnifiedSessionsList();
      sessionsView.installLightSessionsActionDelegates(mixedHost);
      const nirRow = mixedHost.querySelector('.light-session-device[data-id="dev-nir"]');
      const removedRow = mixedHost.querySelector('.light-session-device[data-id="dev-removed"]');
      outcomes.deviceInlineRendersCompactEscapedModeAndFallbacks =
        mixedHost.querySelectorAll('.sun-session').length === 2
        && mixedHost.querySelector('.light-sessions-list-unified') !== null
        && !mixedHost.querySelector('.light-sessions-show-more')
        && nirRow?.getAttribute('aria-label')?.includes('Panel <Co> Red & NIR mode NIR boost') === true
        && nirRow?.querySelector('.light-session-mode-chip-accent')?.textContent === 'NIR boost'
        && nirRow?.classList.contains('light-session-complete')
        && nirRow?.querySelectorAll('.sun-chip,.ai-inline,.sun-session-delete').length === 0
        && removedRow?.textContent.includes('Device details unavailable') === true
        && !removedRow?.textContent.includes('@ 30cm');
      outcomes.deviceInlineRowsUseDelegatedActions =
        nirRow?.getAttribute('data-light-sessions-action') === 'open-device-session'
        && !nirRow?.querySelector('.sun-session-delete')
        && !mixedHost.innerHTML.includes('onclick=')
        && !mixedHost.innerHTML.includes('onkeydown=');

      nirRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      nirRow?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      outcomes.inlineRowClickAndEnterCallDetail = calls.filter(call => call[0] === 'detail' && call[1] === 'dev-nir').length === 2;

      sessionsView._openAllSessionsModal();
      overlay = document.querySelector('.light-sessions-modal-overlay');
      if (overlay) sessionsView.installLightSessionsActionDelegates(overlay);
      const modalRow = overlay?.querySelector('.light-session-device[data-id="dev-nir"]');
      const detailCallsBeforeModalEnter = calls.filter(call => call[0] === 'detail' && call[1] === 'dev-nir').length;
      modalRow?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await delay(0);
      outcomes.modalEnterClosesAfterOpeningDetail = !document.body.contains(overlay)
        && calls.filter(call => call[0] === 'detail' && call[1] === 'dev-nir').length === detailCallsBeforeModalEnter + 1;
    } finally {
      resetDeps();
      document.querySelectorAll('.light-sessions-modal-overlay').forEach(el => el.remove());
    }

    return outcomes;
  }, {
    sessionsUrl: moduleUrl('/js/light-sessions-view.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
