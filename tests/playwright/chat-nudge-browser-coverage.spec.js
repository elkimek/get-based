import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?chatNudgeBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/chat-nudge-browser-coverage', route => {
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
    });
  });
  await page.goto('/chat-nudge-browser-coverage', { waitUntil: 'load' });
}

test('chat nudge browser coverage handles badge storage dismissal and staged updates', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ nudgeUrl }) => {
    const [{ state }, nudge] = await Promise.all([
      import('/js/state.js'),
      import(nudgeUrl),
    ]);
    const outcomes = {};
    const fixture = document.getElementById('fixture');
    const keys = [
      'labcharts-ai-paused',
      'labcharts-ai-provider',
      'labcharts-chat-nudge',
      'labcharts-chat-nudge-dismissed-chat-nudge-test',
      'labcharts-chat-nudge-dismissed-no-profile',
      'labcharts-chat-nudge-dismissed-named-profile',
    ];
    const saved = {
      state: {
        currentProfile: state.currentProfile,
        profiles: state.profiles,
        profileSex: state.profileSex,
        importedData: state.importedData,
      },
      storage: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])),
    };
    const restoreStoredValue = (key, value) => {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    };
    const setupFab = () => {
      fixture.innerHTML = '<button id="chat-fab" type="button"></button>';
      return document.getElementById('chat-fab');
    };
    const nudgeStage = () => localStorage.getItem('labcharts-chat-nudge');
    const dismissedStage = profileId => localStorage.getItem(`labcharts-chat-nudge-dismissed-${profileId}`);
    const fabHasNudge = () => {
      const fab = document.getElementById('chat-fab');
      return !!fab?.classList.contains('chat-fab-nudge') && !!fab.querySelector('.chat-fab-badge');
    };

    try {
      for (const key of keys) localStorage.removeItem(key);
      state.currentProfile = 'chat-nudge-test';
      state.profiles = [{ id: 'chat-nudge-test', name: 'Test Person' }];
      state.profileSex = 'female';
      state.importedData = { entries: [] };

      fixture.innerHTML = '';
      nudge.setChatNudge('api');
      outcomes.setChatNudgeNoOpsWhenFabIsMissing =
        nudgeStage() == null
        && document.querySelector('.chat-fab-badge') == null;

      const fab = setupFab();
      nudge.setChatNudge('api');
      nudge.setChatNudge('data');
      outcomes.setChatNudgeCreatesOneBadgeClassAndUpdatesStoredStage =
        fabHasNudge()
        && fab.querySelectorAll('.chat-fab-badge').length === 1
        && nudgeStage() === 'data';

      nudge.setChatNudge(null);
      outcomes.setChatNudgeNullClearsBadgeClassAndStorage =
        !fab.classList.contains('chat-fab-nudge')
        && fab.querySelector('.chat-fab-badge') == null
        && nudgeStage() == null;

      nudge.setChatNudge('profile');
      nudge.dismissCurrentChatNudge();
      outcomes.dismissCurrentChatNudgeDoesNotDismissProfileStage =
        nudgeStage() === 'profile'
        && dismissedStage('chat-nudge-test') == null
        && fabHasNudge();

      nudge.setChatNudge('api');
      nudge.dismissCurrentChatNudge();
      outcomes.dismissCurrentChatNudgeStoresNonProfileStageAndClearsFab =
        dismissedStage('chat-nudge-test') === 'api'
        && nudgeStage() == null
        && !fabHasNudge();

      state.currentProfile = 'no-profile';
      state.profiles = [{ id: 'no-profile', name: 'Default' }];
      state.profileSex = null;
      state.importedData = { entries: [] };
      localStorage.setItem('labcharts-chat-nudge-dismissed-no-profile', 'profile');
      nudge.updateChatNudge();
      outcomes.updateChatNudgeAlwaysShowsProfileStageUntilProfileIsComplete =
        nudgeStage() === 'profile'
        && fabHasNudge();

      state.currentProfile = 'named-profile';
      state.profiles = [{ id: 'named-profile', name: 'Named Client' }];
      state.profileSex = 'male';
      state.importedData = { entries: [] };
      localStorage.setItem('labcharts-ai-paused', 'true');
      localStorage.removeItem('labcharts-chat-nudge-dismissed-named-profile');
      nudge.updateChatNudge();
      const apiStageShown = nudgeStage() === 'api' && fabHasNudge();
      localStorage.setItem('labcharts-chat-nudge-dismissed-named-profile', 'api');
      nudge.updateChatNudge();
      outcomes.updateChatNudgeShowsApiStageUntilDismissed =
        apiStageShown
        && nudgeStage() == null
        && !fabHasNudge();

      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-chat-nudge-dismissed-named-profile');
      state.importedData = { entries: [] };
      nudge.updateChatNudge();
      const dataStageShown = nudgeStage() === 'data' && fabHasNudge();
      localStorage.setItem('labcharts-chat-nudge-dismissed-named-profile', 'data');
      nudge.updateChatNudge();
      outcomes.updateChatNudgeShowsDataStageUntilDismissed =
        dataStageShown
        && nudgeStage() == null
        && !fabHasNudge();

      localStorage.removeItem('labcharts-chat-nudge-dismissed-named-profile');
      state.importedData = {
        entries: [{ date: '2026-06-11', markers: {} }],
        diagnoses: { text: 'low ferritin' },
        diet: { notes: '' },
        exercise: { items: [] },
      };
      nudge.updateChatNudge();
      const contextStageShown = nudgeStage() === 'context' && fabHasNudge();
      localStorage.setItem('labcharts-chat-nudge-dismissed-named-profile', 'context');
      nudge.updateChatNudge();
      outcomes.updateChatNudgeShowsContextStageUntilDismissedWhenFewCardsAreFilled =
        contextStageShown
        && nudgeStage() == null
        && !fabHasNudge();

      localStorage.removeItem('labcharts-chat-nudge-dismissed-named-profile');
      state.importedData = {
        entries: [{ date: '2026-06-11', markers: {} }],
        diagnoses: { text: 'low ferritin' },
        diet: { notes: 'high protein' },
        sleepRest: { bedtime: '22:00' },
      };
      nudge.setChatNudge('context');
      nudge.updateChatNudge();
      outcomes.updateChatNudgeClearsWhenEnoughContextCardsAreFilled =
        nudgeStage() == null
        && !fabHasNudge();

      outcomes.allOutcomesReached = true;
    } finally {
      state.currentProfile = saved.state.currentProfile;
      state.profiles = saved.state.profiles;
      state.profileSex = saved.state.profileSex;
      state.importedData = saved.state.importedData;
      for (const [key, value] of Object.entries(saved.storage)) restoreStoredValue(key, value);
    }

    return outcomes;
  }, {
    nudgeUrl: moduleUrl('/js/chat-nudge.js'),
  });

  const expectedOutcomeKeys = [
    'setChatNudgeNoOpsWhenFabIsMissing',
    'setChatNudgeCreatesOneBadgeClassAndUpdatesStoredStage',
    'setChatNudgeNullClearsBadgeClassAndStorage',
    'dismissCurrentChatNudgeDoesNotDismissProfileStage',
    'dismissCurrentChatNudgeStoresNonProfileStageAndClearsFab',
    'updateChatNudgeAlwaysShowsProfileStageUntilProfileIsComplete',
    'updateChatNudgeShowsApiStageUntilDismissed',
    'updateChatNudgeShowsDataStageUntilDismissed',
    'updateChatNudgeShowsContextStageUntilDismissedWhenFewCardsAreFilled',
    'updateChatNudgeClearsWhenEnoughContextCardsAreFilled',
    'allOutcomesReached',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
