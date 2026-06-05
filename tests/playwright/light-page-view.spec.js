import { expect, test } from '@playwright/test';

test('Light page view delegates session, link, channel, and prompt actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const { renderDashboardLightChannelPills, renderLightSessionLogActions } = await import('/js/light-page-view.js');
    const savedFns = {
      getSessions: window.getSessions,
      getDevices: window.getDevices,
      getDeviceSessions: window.getDeviceSessions,
      getActiveSession: window.getActiveSession,
      _openChannelOnLightPage: window._openChannelOnLightPage,
      quickLogSunSession: window.quickLogSunSession,
      quickLogDeviceSession: window.quickLogDeviceSession,
      openAddDeviceDialog: window.openAddDeviceDialog,
      openDetailedSessionDialog: window.openDetailedSessionDialog,
      navigate: window.navigate,
      requestPreciseLocation: window.requestPreciseLocation,
      openLightEnvironmentAssessment: window.openLightEnvironmentAssessment,
      renderLightTools: window.renderLightTools,
      CHANNEL_DISPLAY: window.CHANNEL_DISPLAY,
      weeklyChannelTier: window.weeklyChannelTier,
      dailyChannelBreakdown: window.dailyChannelBreakdown,
    };
    const calls = [];
    const host = document.createElement('div');

    try {
      window.getSessions = () => [];
      window.getDevices = () => [];
      window.getDeviceSessions = () => [];
      window.getActiveSession = () => null;
      window._openChannelOnLightPage = channel => calls.push(['open-channel', channel]);
      window.quickLogSunSession = () => calls.push(['quick-log-sun']);
      window.quickLogDeviceSession = () => calls.push(['quick-log-device']);
      window.openAddDeviceDialog = () => calls.push(['open-add-device']);
      window.openDetailedSessionDialog = () => calls.push(['open-detailed-session']);
      window.navigate = route => calls.push(['navigate', route]);
      window.requestPreciseLocation = () => calls.push(['request-precise-location']);
      window.openLightEnvironmentAssessment = () => calls.push(['open-light-environment']);
      window.renderLightTools = () => '<section id="light-tools-expanded-test">Expanded tools</section>';
      window.CHANNEL_DISPLAY = {
        vitamin_d: { label: 'Vitamin D', icon: 'D', what: 'Vitamin D', dailyTarget: 100 },
        circadian: { label: 'Circadian', icon: 'C', what: 'Circadian', dailyTarget: 100 },
        nir_solar: { label: 'NIR', icon: 'N', what: 'NIR', dailyTarget: 100 },
        no_cv: { label: 'NO', icon: 'NO', what: 'Nitric oxide', dailyTarget: 100 },
        pomc: { label: 'POMC', icon: 'P', what: 'POMC', dailyTarget: 100 },
        violet_eye: { label: 'Violet', icon: 'V', what: 'Violet', dailyTarget: 100 },
      };
      window.weeklyChannelTier = () => 0;
      window.dailyChannelBreakdown = () => Array.from({ length: 7 }, (_, i) => ({
        sun: i === 0 ? 10 : 0,
        device: 0,
      }));

      document.body.appendChild(host);
      host.innerHTML = `
        ${renderLightSessionLogActions()}
        ${renderDashboardLightChannelPills()}
        <a href="#light-test" data-light-page-action="navigate-light">Open Light</a>
        <a href="#precise-test" data-light-page-action="request-precise-location">Use precise location</a>
        <button type="button" data-light-page-action="quick-log-device">Device</button>
        <button type="button" data-light-page-action="open-light-environment">Environment</button>
        <button type="button" data-light-page-action="expand-light-tools">Tools</button>
        <div class="light-widget-prompt light-tools-section-collapsed">Collapsed tools</div>
      `;

      host.querySelector('[data-light-page-action="quick-log-sun"]')?.click();
      host.querySelector('[data-light-page-action="quick-log-device"]')?.click();
      host.querySelector('[data-light-page-action="open-add-device"]')?.click();
      host.querySelector('[data-light-page-action="open-detailed-session"]')?.click();
      host.querySelector('[data-light-page-action="open-channel"][data-channel]')?.click();
      host.querySelector('[data-light-page-action="open-light-environment"]')?.click();

      const navLink = host.querySelector('a[data-light-page-action="navigate-light"]');
      const navEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      navLink?.dispatchEvent(navEvent);
      const preciseLink = host.querySelector('a[data-light-page-action="request-precise-location"]');
      const preciseEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      preciseLink?.dispatchEvent(preciseEvent);

      host.querySelector('[data-light-page-action="expand-light-tools"]')?.click();

      return {
        noInlineHandlers: !host.querySelector('[onclick],[onchange],[oninput],[onkeydown],[onkeyup],[onsubmit]'),
        usesDataActions: !!host.querySelector('[data-light-page-action="quick-log-sun"]')
          && !!host.querySelector('[data-light-page-action="open-channel"][data-channel]'),
        sessionAndDashboardActions: calls.some(c => c[0] === 'quick-log-sun')
          && calls.some(c => c[0] === 'quick-log-device')
          && calls.some(c => c[0] === 'open-add-device')
          && calls.some(c => c[0] === 'open-detailed-session')
          && calls.some(c => c[0] === 'open-channel' && c[1]),
        linkActions: navEvent.defaultPrevented
          && preciseEvent.defaultPrevented
          && calls.some(c => c[0] === 'navigate' && c[1] === 'light')
          && calls.some(c => c[0] === 'request-precise-location'),
        promptActions: calls.some(c => c[0] === 'open-light-environment')
          && !!document.getElementById('light-tools-expanded-test'),
      };
    } finally {
      Object.assign(window, savedFns);
      host.remove();
      document.getElementById('light-tools-expanded-test')?.remove();
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
