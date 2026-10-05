import fs from 'node:fs';

/** A headless binary must also be unable to connect to the user's desktop. */
export function headlessBrowserEnvironment(runtimeDirectory: string, inherited = process.env): Record<string, string> {
  fs.mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(runtimeDirectory, 0o700);
  const environment = Object.fromEntries(Object.entries(inherited).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  for (const name of ['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS',
    'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'DESKTOP_STARTUP_ID', 'XDG_ACTIVATION_TOKEN']) delete environment[name];
  environment['XDG_RUNTIME_DIR'] = runtimeDirectory;
  environment['MOZ_HEADLESS'] = '1';
  return environment;
}
