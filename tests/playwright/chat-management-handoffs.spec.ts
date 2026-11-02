import { test } from './coverage-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('Backup and export'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Make a backup and export my profile.','Use Settings → Data for backups and exports.'));
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('Sharing'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Create a share link for this profile.','Use the profile sharing controls to review what you share.'));
