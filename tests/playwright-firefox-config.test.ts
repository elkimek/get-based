import {expect,it} from 'vitest';
import {devices} from '@playwright/test';
import base from '../playwright.config.js';
import firefox from '../playwright.firefox.config.js';
it('retains the isolated headless environment while omitting Chromium-only launch options',()=>{
 expect(firefox.use?.headless).toBe(true);
 expect(firefox.use?.launchOptions).toEqual({env:base.use?.launchOptions?.env});
 const environment=firefox.use?.launchOptions?.env;expect(environment).toBeDefined();
 for(const key of ['DISPLAY','WAYLAND_DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','DESKTOP_STARTUP_ID','XDG_ACTIVATION_TOKEN'])expect(environment).not.toHaveProperty(key);
 expect(environment?.['MOZ_HEADLESS']).toBe('1');expect(environment?.['XDG_RUNTIME_DIR']).toContain('.local-notes/headless-runtime');
 expect(firefox.projects?.[0]?.use).toEqual(devices['Desktop Firefox']);
 expect(firefox.use?.launchOptions).not.toHaveProperty('args');expect(firefox.use?.launchOptions).not.toHaveProperty('executablePath');
});
