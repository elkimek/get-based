// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureLightDevicesActions,
  installLightDevicesActionDelegates,
} from '../js/light-devices-actions.js';

const defaultActions = configureLightDevicesActions();

describe('light device delegated actions', () => {
  afterEach(() => {
    configureLightDevicesActions(defaultActions);
    document.body.innerHTML = '';
  });

  it('routes each card action once and allows callbacks to be removed', () => {
    const stopDeviceSessionAndNotify = vi.fn();
    const openAddDeviceDialog = vi.fn();
    const deleteLightDevice = vi.fn();
    const openDeviceSessionDialog = vi.fn();
    configureLightDevicesActions({
      stopDeviceSessionAndNotify,
      openAddDeviceDialog,
      deleteLightDevice,
      openDeviceSessionDialog,
    });

    const root = document.createElement('div');
    root.innerHTML = `
      <button data-light-devices-action="stop-device-session" data-light-device-session-id="session-1">Stop</button>
      <button data-light-devices-action="add-device">Add</button>
      <button data-light-devices-action="delete-device" data-light-device-id="device-1">Delete</button>
      <button data-light-devices-action="log-device-session" data-light-device-id="device-2">Log</button>
    `;
    document.body.appendChild(root);
    installLightDevicesActionDelegates(root);
    installLightDevicesActionDelegates(root);

    root.querySelector('[data-light-devices-action="stop-device-session"]').click();
    root.querySelector('[data-light-devices-action="add-device"]').click();
    root.querySelector('[data-light-devices-action="delete-device"]').click();
    root.querySelector('[data-light-devices-action="log-device-session"]').click();

    expect(stopDeviceSessionAndNotify).toHaveBeenCalledOnce();
    expect(stopDeviceSessionAndNotify).toHaveBeenCalledWith('session-1');
    expect(openAddDeviceDialog).toHaveBeenCalledOnce();
    expect(deleteLightDevice).toHaveBeenCalledWith('device-1');
    expect(openDeviceSessionDialog).toHaveBeenCalledWith('device-2');

    configureLightDevicesActions({ openAddDeviceDialog: null });
    root.querySelector('[data-light-devices-action="add-device"]').click();
    expect(openAddDeviceDialog).toHaveBeenCalledOnce();
  });
});
