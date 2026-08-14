import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?lightEnvModelBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/light-env-model-browser-coverage', route => {
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
    });
  });
  await page.goto('/light-env-model-browser-coverage', { waitUntil: 'load' });
}

test('light environment model browser coverage scores picker room screen and burden paths', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ modelUrl }) => {
    const model = await import(modelUrl);
    const outcomes = {};
    const closeTo = (actual, expected) => Math.abs(actual - expected) < 0.001;

    outcomes.pickerHelpersNormalizeSourcesHoursEveningAndDefaultRooms =
      model.activeSourceArchetype(null) === null
      && model.activeSourceArchetype('led-warm') === 'warm'
      && model.activeSourceArchetype('halogen') === 'warm'
      && model.activeSourceArchetype('led-tunable') === 'cool'
      && model.activeSourceArchetype('fluorescent') === 'fluorescent'
      && model.activeSourceArchetype('unknown') === 'mixed'
      && model.activeSourceArchetype('natural-only') === null
      && model.activeHoursBucket(null) === null
      && model.activeHoursBucket('') === null
      && model.activeHoursBucket(0.5) === 'short'
      && model.activeHoursBucket(2) === 'some'
      && model.activeHoursBucket(4.5) === 'lots'
      && model.activeHoursBucket(8) === 'most'
      && model.activeEveningBucket({}) === null
      && model.activeEveningBucket({ eveningHoursAfterSunset: 0 }) === 'none'
      && model.activeEveningBucket({ eveningHoursAfterSunset: 0.5 }) === 'lt1'
      && model.activeEveningBucket({ eveningUseAfterSunset: true }) === 'mid'
      && model.activeEveningBucket({ eveningHoursAfterSunset: 4 }) === 'gt3'
      && model.defaultHoursForName('Bedroom') === 8
      && model.defaultHoursForName('home office') === 8
      && model.defaultHoursForName('living room') === 4
      && model.defaultHoursForName('kitchen') === 2
      && model.defaultHoursForName('bathroom') === 1
      && model.defaultHoursForName('garage') === 4;

    const unknownRoom = model.computeRoomSeverityForRoom(null);
    const emptyRoom = model.computeRoomSeverityForRoom({ id: 'empty', name: 'Empty', primarySource: 'unknown', hoursOccupiedPerDay: 0 });
    const severeRoom = model.computeRoomSeverityForRoom({
      id: 'bedroom',
      name: 'Bedroom',
      primarySource: 'led-cool',
      hoursOccupiedPerDay: 6,
      eveningHoursAfterSunset: 2,
    }, [
      { tool: 'flicker', value: 1, capturedAt: 1 },
      { tool: 'flicker', value: 3, capturedAt: 4 },
      { tool: 'lux', value: 30, capturedAt: 3 },
      { tool: 'darkness', value: 2, capturedAt: 2 },
    ], {
      screens: [
        { id: 'phone', eveningUseAfterSunset: 3, blueBlockerEnabled: false },
        { id: 'blocked', eveningUseAfterSunset: 6, blueBlockerEnabled: true },
        { id: 'skip', eveningUseAfterSunset: 6, blueBlockerEnabled: false, skipToday: true },
      ],
      isActiveToday: item => !item.skipToday,
    });
    outcomes.roomSeverityCoversUnknownIncompleteAndCompoundedRedSignals =
      unknownRoom.label === 'Unknown'
      && unknownRoom.reason === 'No data yet'
      && emptyRoom.color === 'incomplete'
      && emptyRoom.label === 'Needs setup'
      && severeRoom.tier === 4
      && severeRoom.color === 'red'
      && severeRoom.label === 'Strong signal'
      && severeRoom.reason.includes('2 hr after sunset under a cool-spectrum source')
      && severeRoom.reason.includes('strong camera banding detected')
      && !severeRoom.reason.includes('sleep-time light measured')
      && severeRoom.reason.includes('9.0 hr evening screen use here')
      && severeRoom.reason.includes('blue reduction noted but not treated as zero exposure');

    const screenUnknown = model.computeScreenStatus(null);
    const screenMitigated = model.computeScreenStatus({ eveningUseAfterSunset: 5, blueBlockerEnabled: true });
    const screenDaytime = model.computeScreenStatus({ eveningUseAfterSunset: 0, blueBlockerEnabled: false });
    const screenMild = model.computeScreenStatus({ eveningUseAfterSunset: 0.5, blueBlockerEnabled: false });
    const screenModerate = model.computeScreenStatus({ eveningUseAfterSunset: 2, blueBlockerEnabled: false });
    const screenHeavy = model.computeScreenStatus({ eveningUseAfterSunset: 4, blueBlockerEnabled: false });
    outcomes.screenStatusCoversNullMitigatedDaytimeAndEscalatingEveningUse =
      screenUnknown.label === 'Unknown'
      && screenMitigated.tier === 2
      && screenMitigated.label === 'Moderate'
      && screenDaytime.label === 'Daytime only'
      && screenMild.color === 'yellow'
      && screenModerate.color === 'orange'
      && screenHeavy.color === 'red'
      && screenHeavy.reason === '4 evening hours';

    const environment = {
      rooms: [
        { id: 'office', hoursOccupiedPerDay: 8, primarySource: 'led-cool', eveningHoursAfterSunset: 2 },
        { id: 'outside-day', hoursOccupiedPerDay: 5, primarySource: 'natural-only', skipToday: true },
        { id: 'lamp', hoursOccupiedPerDay: 1, primarySource: 'incandescent', eveningHoursAfterSunset: 4 },
      ],
      screens: [
        { id: 'phone', eveningUseAfterSunset: 4, blueBlockerEnabled: false },
        { id: 'tv', eveningUseAfterSunset: 6, blueBlockerEnabled: true },
        { id: 'skipped-screen', eveningUseAfterSunset: 6, blueBlockerEnabled: false, skipToday: true },
      ],
    };
    const isActiveToday = item => !item.skipToday;
    const axes = model.computeDeficitAxesForEnvironment(environment, { isActiveToday });
    const heavyBurden = model.computeIndoorBurdenForEnvironment(environment, { isActiveToday });
    const emptyBurden = model.computeIndoorBurdenForEnvironment({ rooms: [], screens: [] });
    const skippedBurden = model.computeIndoorBurdenForEnvironment({
      rooms: [{ id: 'out', hoursOccupiedPerDay: 8, primarySource: 'natural-only', skipToday: true }],
      screens: [{ id: 'phone', eveningUseAfterSunset: 3, blueBlockerEnabled: false, skipToday: true }],
    }, { isActiveToday });
    const axisOverrideBurden = model.computeIndoorBurdenForEnvironment(environment, {
      axes: { d2: 2, d3: 3, daylightKnown: 1, eveningKnown: 1, missingDaylightRooms: 0 },
    });
    outcomes.environmentAxesAndBurdenRespectSkippedItemsAndInterpretationBranches =
      axes.d2 === 0
      && closeTo(axes.d3, 10)
      && axes.missingDaylightRooms === 2
      && axes.daylightKnown === 0
      && axes.eveningKnown === 4
      && heavyBurden.tier === 2
      && heavyBurden.color === 'red'
      && heavyBurden.parts.includes('Evening light: high')
      && heavyBurden.parts.includes('2 daylight answers missing')
      && heavyBurden.interp.includes('after-sunset light exposure')
      && emptyBurden.interp.includes('No mapped exposure yet')
      && skippedBurden.interp.includes('Everything mapped is skipped today')
      && axisOverrideBurden.tier === 1
      && axisOverrideBurden.interp.includes('Evening timing');

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    modelUrl: moduleUrl('/js/light-env-model.js'),
  });

  const expectedOutcomeKeys = [
    'pickerHelpersNormalizeSourcesHoursEveningAndDefaultRooms',
    'roomSeverityCoversUnknownIncompleteAndCompoundedRedSignals',
    'screenStatusCoversNullMitigatedDaytimeAndEscalatingEveningUse',
    'environmentAxesAndBurdenRespectSkippedItemsAndInterpretationBranches',
    'allOutcomesReached',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
