import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { headlessBrowserEnvironment } from '../scripts/headless-browser-environment.js';

it('keeps headless browsers disconnected from the real display, compositor and session bus', () => {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-headless-env-'));
  try {
    const inherited = { DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0', XAUTHORITY: '/desktop/auth',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/desktop/bus', DBUS_STARTER_ADDRESS: 'desktop-bus',
      DBUS_STARTER_BUS_TYPE: 'session', DESKTOP_STARTUP_ID: 'desktop-start', XDG_ACTIVATION_TOKEN: 'desktop-token',
      XDG_RUNTIME_DIR: '/desktop/runtime', PATH: '/fixture/bin' };
    const env = headlessBrowserEnvironment(runtime, inherited);
    for (const name of ['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS',
      'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'DESKTOP_STARTUP_ID', 'XDG_ACTIVATION_TOKEN']) expect(env).not.toHaveProperty(name);
    expect(env['XDG_RUNTIME_DIR']).toBe(runtime); expect(env['MOZ_HEADLESS']).toBe('1'); expect(env['PATH']).toBe('/fixture/bin');
    expect(inherited.DISPLAY).toBe(':0');
    if (process.platform !== 'win32') expect(fs.statSync(runtime).mode & 0o777).toBe(0o700);
  } finally { fs.rmSync(runtime, { recursive: true, force: true }); }
});
