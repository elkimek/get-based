import {beforeEach, expect, it, vi} from 'vitest';

const ports = vi.hoisted(() => ({calls: [] as string[], encryption: vi.fn<() => Promise<void>>(),
  config: vi.fn<() => Promise<void>>(), backup: vi.fn<() => Promise<void>>() }));
vi.mock('../js/crypto.js', () => ({
  initEncryption: () => {ports.calls.push('encryption'); return ports.encryption();},
  initBroadcastChannel: () => {ports.calls.push('broadcast');},
  initFolderBackup: () => {ports.calls.push('backup'); return ports.backup();},
}));
vi.mock('../js/sun-uvdata-config.js', () => ({
  initMeteoConfigCache: () => {ports.calls.push('config'); return ports.config();},
}));
import {initializeStartupFoundation} from '../js/startup-foundation.js';

beforeEach(() => {
  ports.calls.length = 0;
  ports.encryption.mockReset().mockResolvedValue(undefined);
  ports.config.mockReset().mockResolvedValue(undefined);
  ports.backup.mockReset().mockResolvedValue(undefined);
});

it('keeps encrypted meteo hydration behind unlock and before broadcast and backup', async () => {
  let unlock!: () => void; let hydrated!: () => void;
  ports.encryption.mockReturnValueOnce(new Promise<void>(resolve => {unlock = resolve;}));
  ports.config.mockReturnValueOnce(new Promise<void>(resolve => {hydrated = resolve;}));
  const startup = initializeStartupFoundation();
  expect(ports.calls).toEqual(['encryption']);
  unlock(); await Promise.resolve();
  expect(ports.calls).toEqual(['encryption', 'config']);
  hydrated(); await startup;
  expect(ports.calls).toEqual(['encryption', 'config', 'broadcast', 'backup']);
});

it('does not read encrypted meteo credentials or start services after unlock fails', async () => {
  const failure = new Error('unlock failed'); ports.encryption.mockRejectedValueOnce(failure);
  await expect(initializeStartupFoundation()).rejects.toBe(failure);
  expect(ports.calls).toEqual(['encryption']);
});

it('does not start broadcast or backup before a failed meteo initialization settles', async () => {
  const failure = new Error('meteo initialization failed'); ports.config.mockRejectedValueOnce(failure);
  await expect(initializeStartupFoundation()).rejects.toBe(failure);
  expect(ports.calls).toEqual(['encryption', 'config']);
});
