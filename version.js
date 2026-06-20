// version.js — Single source of truth for app version (semver)
// Classic script (not ES module) so it works in both browser and service worker.
// Browser: <script src="version.js"> sets window.APP_VERSION
// Service worker: importScripts('/version.js') sets self.APP_VERSION
self.APP_VERSION = '1.9.2';
