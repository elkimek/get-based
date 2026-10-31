import { test } from './coverage-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('Profile selection'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Switch to my other profile.','Use the profile picker to switch profiles.'));
