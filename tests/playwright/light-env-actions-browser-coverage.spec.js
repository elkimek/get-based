import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?lightEnvActionsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/light-env-actions-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/light-env-actions-coverage', { waitUntil: 'load' });
}

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('light environment action delegates route DOM events and attrs in browser', async ({ page }) => {
  await openBlankPage(page);

  const outcomes = await page.evaluate(async ({ actionsUrl }) => {
    const actionsModule = await import(actionsUrl);
    const outcomes = {};
    const calls = [];
    const root = document.getElementById('fixture');
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
    const input = (id, value) => {
      const el = byId(id);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const change = (id, value, checked) => {
      const el = byId(id);
      if (value !== undefined) el.value = value;
      if (checked !== undefined) el.checked = checked;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const called = (name, predicate = () => true) => calls.some(call => call[0] === name && predicate(call));
    const callCount = name => calls.filter(call => call[0] === name).length;

    const sourceAttrs = actionsModule.lightEnvActionAttrs('set-room-source-archetype', {
      id: 'room-1',
      key: 'warm-led',
      roomId: 'room-1',
      active: false,
      empty: '',
      label: 'Warm "LED" <2700K>',
    });
    const addNamedAttrs = actionsModule.lightEnvActionAttrs('add-room-named', { name: 'Studio & Lab' });
    const screenAttrs = actionsModule.lightEnvActionAttrs('add-screen-with-device', { roomId: 'room-1', device: 'laptop' });

    root.innerHTML = `
      <button id="source" ${sourceAttrs}>Source</button>
      <button id="today" ${actionsModule.lightEnvActionAttrs('set-today-active', { id: 'room-1', kind: 'room', active: true })}>Today</button>
      <div id="screen-toggle" role="button" tabindex="0" ${actionsModule.lightEnvActionAttrs('toggle-screen-expanded', { id: 'screen-1' })}>Screen</div>
      <div id="room-toggle" role="button" tabindex="0" ${actionsModule.lightEnvActionAttrs('toggle-room-expanded', { id: 'room-1' })}>Room</div>
      <button id="delete-screen" ${actionsModule.lightEnvActionAttrs('delete-screen-confirm', { id: 'screen-1' })}>Delete screen</button>
      <button id="delete-room" ${actionsModule.lightEnvActionAttrs('delete-room-confirm', { id: 'room-1' })}>Delete room</button>
      <button id="room-hours-bucket" ${actionsModule.lightEnvActionAttrs('set-room-hours-bucket', { id: 'room-1', key: 'workday' })}>Hours bucket</button>
      <button id="room-evening-bucket" ${actionsModule.lightEnvActionAttrs('set-room-evening-bucket', { id: 'room-1', key: 'gt3' })}>Evening bucket</button>
      <button id="screen-hours-bucket" ${actionsModule.lightEnvActionAttrs('set-screen-hours-bucket', { id: 'screen-1', key: 'most' })}>Screen hours bucket</button>
      <button id="screen-evening-bucket" ${actionsModule.lightEnvActionAttrs('set-screen-evening-bucket', { id: 'screen-1', key: 'gt3' })}>Screen evening bucket</button>
      <button id="add-named" ${addNamedAttrs}>Add named</button>
      <button id="add-custom" ${actionsModule.lightEnvActionAttrs('add-room-custom')}>Add custom</button>
      <button id="add-screen-device" ${screenAttrs}>Add screen device</button>
      <button id="add-screen" ${actionsModule.lightEnvActionAttrs('add-screen', { roomId: 'room-1' })}>Add screen</button>
      <button id="add-room" ${actionsModule.lightEnvActionAttrs('add-room')}>Add room</button>
      <button id="open-assessment" ${actionsModule.lightEnvActionAttrs('open-assessment')}>Open</button>
      <button id="open-save-audit" ${actionsModule.lightEnvActionAttrs('open-assessment-save-audit')}>Open and save</button>
      <button id="close-assessment" ${actionsModule.lightEnvActionAttrs('close-assessment')}>Close</button>
      <button id="open-tool" ${actionsModule.lightEnvActionAttrs('open-tool', { id: 'room-1', tool: 'flicker' })}>Tool</button>
      <select id="room-source" ${actionsModule.lightEnvActionAttrs('update-room-primary-source', { id: 'room-1' })}>
        <option value="unknown">Unknown</option>
        <option value="led-warm">Warm LED</option>
      </select>
      <input id="room-hours" ${actionsModule.lightEnvActionAttrs('update-room-hours', { id: 'room-1' })} />
      <input id="room-name" ${actionsModule.lightEnvActionAttrs('update-room-name', { id: 'room-1' })} />
      <select id="screen-room" ${actionsModule.lightEnvActionAttrs('update-screen-room', { id: 'screen-1' })}>
        <option value="">Portable</option>
        <option value="room-1">Room 1</option>
      </select>
      <select id="screen-device" ${actionsModule.lightEnvActionAttrs('update-screen-device', { id: 'screen-1' })}>
        <option value="phone">Phone</option>
        <option value="laptop">Laptop</option>
      </select>
      <input id="blue-blocker" type="checkbox" ${actionsModule.lightEnvActionAttrs('update-screen-blue-blocker', { id: 'screen-1' })} />
      <input id="ignored-click-input" ${actionsModule.lightEnvActionAttrs('add-room')} />
    `;

    document.addEventListener('click', () => push('document-click'));
    document.addEventListener('keydown', () => push('document-keydown'));

    const actions = {
      setLightEnvRoomSourceArchetype: (id, key) => push('setLightEnvRoomSourceArchetype', id, key),
      updateLightEnvRoomAndRender: (id, patch) => push('updateLightEnvRoomAndRender', id, patch),
      setLightEnvRoomHoursBucket: (id, key) => push('setLightEnvRoomHoursBucket', id, key),
      updateLightEnvRoom: (id, patch) => push('updateLightEnvRoom', id, patch),
      setLightEnvRoomEveningBucket: (id, key) => push('setLightEnvRoomEveningBucket', id, key),
      setLightEnvTodayActive: (kind, id, active) => push('setLightEnvTodayActive', kind, id, active),
      toggleLightEnvScreenExpanded: (id, event) => push('toggleLightEnvScreenExpanded', id, event.type),
      deleteLightEnvScreenConfirm: id => push('deleteLightEnvScreenConfirm', id),
      setLightEnvScreenHoursBucket: (id, key) => push('setLightEnvScreenHoursBucket', id, key),
      setLightEnvScreenEveningBucket: (id, key) => push('setLightEnvScreenEveningBucket', id, key),
      updateLightEnvScreenAndRender: (id, patch) => push('updateLightEnvScreenAndRender', id, patch),
      addLightEnvRoomNamed: name => push('addLightEnvRoomNamed', name),
      addLightEnvRoomCustom: () => push('addLightEnvRoomCustom'),
      addLightEnvScreenWithDevice: (roomId, device) => push('addLightEnvScreenWithDevice', roomId, device),
      addLightEnvScreen: roomId => push('addLightEnvScreen', roomId),
      openLightEnvironmentAssessment: () => push('openLightEnvironmentAssessment'),
      saveLightAuditFromUI: () => push('saveLightAuditFromUI'),
      closeLightEnvironmentAssessment: () => push('closeLightEnvironmentAssessment'),
      toggleLightEnvRoomExpanded: (id, event) => push('toggleLightEnvRoomExpanded', id, event.type),
      deleteLightEnvRoomConfirm: id => push('deleteLightEnvRoomConfirm', id),
      openLightEnvTool: (tool, id) => push('openLightEnvTool', tool, id),
      addLightEnvRoom: () => push('addLightEnvRoom'),
    };

    actionsModule.installLightEnvActionDelegates(actions, root);
    actionsModule.installLightEnvActionDelegates(actions, root);

    outcomes.attrsConvertCamelCaseEscapeValuesAndOmitFalsey =
      sourceAttrs.includes('data-light-env-room-id="room-1"')
      && sourceAttrs.includes('Warm &quot;LED&quot; &lt;2700K&gt;')
      && !sourceAttrs.includes('data-light-env-active')
      && !sourceAttrs.includes('data-light-env-empty')
      && byId('add-named').dataset.lightEnvName === 'Studio & Lab';

    const sourceBefore = callCount('setLightEnvRoomSourceArchetype');
    click('source');
    outcomes.clickRoutesNormalActionsAndInstallIsIdempotent =
      callCount('setLightEnvRoomSourceArchetype') === sourceBefore + 1
      && called('setLightEnvRoomSourceArchetype', call => call[1] === 'room-1' && call[2] === 'warm-led')
      && called('document-click');

    const docClicksBeforeStop = callCount('document-click');
    const todayDefaultAllowed = click('today');
    outcomes.captureStoppingClickPreventsDefaultAndStopsDocumentBubble =
      todayDefaultAllowed === false
      && called('setLightEnvTodayActive', call => call[1] === 'room' && call[2] === 'room-1' && call[3] === true)
      && callCount('document-click') === docClicksBeforeStop;

    click('room-hours-bucket');
    click('room-evening-bucket');
    click('screen-hours-bucket');
    click('screen-evening-bucket');
    click('add-named');
    click('add-custom');
    click('add-screen-device');
    click('add-screen');
    click('add-room');
    click('open-assessment');
    click('open-save-audit');
    await new Promise(resolve => setTimeout(resolve, 0));
    click('close-assessment');
    click('open-tool');
    outcomes.clickRoutesRemainingButtonActions =
      called('setLightEnvRoomHoursBucket', call => call[1] === 'room-1' && call[2] === 'workday')
      && called('setLightEnvRoomEveningBucket', call => call[1] === 'room-1' && call[2] === 'gt3')
      && called('setLightEnvScreenHoursBucket', call => call[1] === 'screen-1' && call[2] === 'most')
      && called('setLightEnvScreenEveningBucket', call => call[1] === 'screen-1' && call[2] === 'gt3')
      && called('addLightEnvRoomNamed', call => call[1] === 'Studio & Lab')
      && called('addLightEnvRoomCustom')
      && called('addLightEnvScreenWithDevice', call => call[1] === 'room-1' && call[2] === 'laptop')
      && called('addLightEnvScreen', call => call[1] === 'room-1')
      && called('addLightEnvRoom')
      && callCount('openLightEnvironmentAssessment') === 2
      && called('saveLightAuditFromUI')
      && called('closeLightEnvironmentAssessment')
      && called('openLightEnvTool', call => call[1] === 'flicker' && call[2] === 'room-1');

    const ignoredBefore = callCount('addLightEnvRoom');
    click('ignored-click-input');
    outcomes.clickIgnoresFormControls = callCount('addLightEnvRoom') === ignoredBefore;

    change('room-source', 'led-warm');
    input('room-hours', '7.5');
    input('room-name', 'Office');
    change('screen-room', '');
    change('screen-device', 'laptop');
    change('blue-blocker', undefined, true);
    outcomes.inputAndChangeRouteFormActions =
      called('updateLightEnvRoomAndRender', call => call[1] === 'room-1' && call[2].primarySource === 'led-warm')
      && called('updateLightEnvRoom', call => call[1] === 'room-1' && call[2].hoursOccupiedPerDay === 7.5)
      && called('updateLightEnvRoom', call => call[1] === 'room-1' && call[2].name === 'Office')
      && called('updateLightEnvScreenAndRender', call => call[1] === 'screen-1' && call[2].roomId === null)
      && called('updateLightEnvScreenAndRender', call => call[1] === 'screen-1' && call[2].device === 'laptop')
      && called('updateLightEnvScreenAndRender', call => call[1] === 'screen-1' && call[2].blueBlockerEnabled === true);

    const docKeysBeforeStop = callCount('document-keydown');
    const screenSpaceAllowed = keydown('screen-toggle', ' ');
    const docKeysAfterStop = callCount('document-keydown');
    const roomEnterAllowed = keydown('room-toggle', 'Enter');
    outcomes.keyboardRoutesRoleButtonActionsAndStopsConfiguredPropagation =
      screenSpaceAllowed === false
      && roomEnterAllowed === false
      && called('toggleLightEnvScreenExpanded', call => call[1] === 'screen-1' && call[2] === 'keydown')
      && docKeysAfterStop === docKeysBeforeStop
      && called('toggleLightEnvRoomExpanded', call => call[1] === 'room-1' && call[2] === 'keydown')
      && callCount('document-keydown') === docKeysBeforeStop;

    const docClicksBeforeDelete = callCount('document-click');
    const deleteScreenAllowed = click('delete-screen');
    const deleteRoomAllowed = click('delete-room');
    outcomes.captureStoppingDeleteActionsPreventDefaultAndStopDocumentBubble =
      deleteScreenAllowed === false
      && deleteRoomAllowed === false
      && called('deleteLightEnvScreenConfirm', call => call[1] === 'screen-1')
      && called('deleteLightEnvRoomConfirm', call => call[1] === 'room-1')
      && callCount('document-click') === docClicksBeforeDelete;

    return outcomes;
  }, {
    actionsUrl: moduleUrl('/js/light-env-actions.js'),
  });

  expectAll(outcomes);
});
