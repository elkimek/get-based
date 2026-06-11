import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?lightEnvEveningBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/light-env-evening-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/light-env-evening-browser-coverage', { waitUntil: 'load' });
}

test('light environment evening browser coverage normalizes canonical and legacy room fields', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ eveningUrl }) => {
    const evening = await import(eveningUrl);
    const outcomes = {};

    outcomes.normalizeEveningHoursClampsNullInvalidNegativeAndLargeValues =
      evening.normalizeEveningHours(null) === 0
      && evening.normalizeEveningHours('') === 0
      && evening.normalizeEveningHours('not-a-number') === 0
      && evening.normalizeEveningHours(-4) === 0
      && evening.normalizeEveningHours('3.5') === 3.5
      && evening.normalizeEveningHours(99) === 24;

    outcomes.roomReaderPrefersCanonicalAndFallsBackToLegacyValues =
      evening.getRoomEveningHoursAfterSunset({ eveningHoursAfterSunset: '4.25', eveningUseAfterSunset: true }) === 4.25
      && evening.getRoomEveningHoursAfterSunset({ eveningUseAfterSunset: true }) === evening.LEGACY_ROOM_EVENING_HOURS
      && evening.getRoomEveningHoursAfterSunset({ eveningUseAfterSunset: false }) === 0
      && evening.getRoomEveningHoursAfterSunset({ eveningUseAfterSunset: '1.75' }) === 1.75
      && evening.getRoomEveningHoursAfterSunset({ eveningHoursAfterSunset: '' }) === 0
      && evening.getRoomEveningHoursAfterSunset(null) === 0;

    outcomes.answerAndUsageHelpersDistinguishMissingZeroAndPositiveRooms =
      evening.hasRoomEveningAnswer(null) === false
      && evening.hasRoomEveningAnswer({}) === false
      && evening.hasRoomEveningAnswer({ eveningHoursAfterSunset: null }) === false
      && evening.hasRoomEveningAnswer({ eveningHoursAfterSunset: 0 }) === true
      && evening.roomUsesEveningAfterSunset({ eveningHoursAfterSunset: 0 }) === false
      && evening.roomUsesEveningAfterSunset({ eveningHoursAfterSunset: '0.25' }) === true;

    const canonicalRoom = { name: 'Office', eveningHoursAfterSunset: '27', eveningUseAfterSunset: true };
    const migratedRoom = { name: 'Bedroom', eveningUseAfterSunset: true };
    const unchangedRoom = { name: 'Kitchen', eveningHoursAfterSunset: 2 };
    const canonicalChanged = evening.normalizeRoomEveningFields(canonicalRoom);
    const migratedChanged = evening.normalizeRoomEveningFields(migratedRoom);
    const unchangedChanged = evening.normalizeRoomEveningFields(unchangedRoom);
    outcomes.normalizeRoomEveningFieldsRejectsInvalidInputs =
      evening.normalizeRoomEveningFields(null) === false
      && evening.normalizeRoomEveningFields('not-room') === false;
    outcomes.normalizeRoomEveningFieldsClampsCanonicalHoursAndDropsLegacy =
      canonicalChanged === true
      && canonicalRoom.eveningHoursAfterSunset === 24
      && !('eveningUseAfterSunset' in canonicalRoom);
    outcomes.normalizeRoomEveningFieldsMigratesLegacyBooleanAndDropsLegacy =
      migratedChanged === true
      && migratedRoom.eveningHoursAfterSunset === evening.LEGACY_ROOM_EVENING_HOURS
      && !('eveningUseAfterSunset' in migratedRoom);
    outcomes.normalizeRoomEveningFieldsReportsUnchangedCanonicalRoom =
      unchangedChanged === false
      && unchangedRoom.eveningHoursAfterSunset === 2;

    const lightEnvironment = {
      rooms: [
        { id: 'legacy-number', eveningUseAfterSunset: '1.5' },
        { id: 'invalid-canonical', eveningHoursAfterSunset: 'bad' },
        { id: 'unchanged', eveningHoursAfterSunset: 0 },
      ],
    };
    const nullLightEnvironmentChanged = evening.normalizeLightEnvironmentEveningFields(null);
    const invalidRoomsChanged = evening.normalizeLightEnvironmentEveningFields({ rooms: null });
    const lightEnvironmentChanged = evening.normalizeLightEnvironmentEveningFields(lightEnvironment);
    outcomes.normalizeLightEnvironmentEveningFieldsSkipsInvalidContainers =
      nullLightEnvironmentChanged === false
      && invalidRoomsChanged === false;
    outcomes.normalizeLightEnvironmentEveningFieldsWalksAndNormalizesRooms =
      lightEnvironmentChanged === true
      && lightEnvironment.rooms[0].eveningHoursAfterSunset === 1.5
      && !('eveningUseAfterSunset' in lightEnvironment.rooms[0])
      && lightEnvironment.rooms[1].eveningHoursAfterSunset === 0
      && lightEnvironment.rooms[2].eveningHoursAfterSunset === 0;

    const legacyPatch = { eveningUseAfterSunset: true, label: 'Bedroom' };
    const migratedPatch = evening.normalizeRoomEveningPatch(legacyPatch);
    const canonicalPatch = evening.normalizeRoomEveningPatch({
      eveningUseAfterSunset: true,
      eveningHoursAfterSunset: '6',
      label: 'Office',
    });
    const nullPatch = evening.normalizeRoomEveningPatch(null);
    outcomes.normalizeRoomEveningPatchCopiesMigratesClampsAndDropsLegacy =
      migratedPatch !== legacyPatch
      && legacyPatch.eveningUseAfterSunset === true
      && migratedPatch.label === 'Bedroom'
      && migratedPatch.eveningHoursAfterSunset === evening.LEGACY_ROOM_EVENING_HOURS
      && !('eveningUseAfterSunset' in migratedPatch)
      && canonicalPatch.eveningHoursAfterSunset === 6
      && !('eveningUseAfterSunset' in canonicalPatch)
      && nullPatch === null;

    return outcomes;
  }, {
    eveningUrl: moduleUrl('/js/light-env-evening.js'),
  });

  const expectedOutcomeKeys = [
    'normalizeEveningHoursClampsNullInvalidNegativeAndLargeValues',
    'roomReaderPrefersCanonicalAndFallsBackToLegacyValues',
    'answerAndUsageHelpersDistinguishMissingZeroAndPositiveRooms',
    'normalizeRoomEveningFieldsRejectsInvalidInputs',
    'normalizeRoomEveningFieldsClampsCanonicalHoursAndDropsLegacy',
    'normalizeRoomEveningFieldsMigratesLegacyBooleanAndDropsLegacy',
    'normalizeRoomEveningFieldsReportsUnchangedCanonicalRoom',
    'normalizeLightEnvironmentEveningFieldsSkipsInvalidContainers',
    'normalizeLightEnvironmentEveningFieldsWalksAndNormalizesRooms',
    'normalizeRoomEveningPatchCopiesMigratesClampsAndDropsLegacy',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
