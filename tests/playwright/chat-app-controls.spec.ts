import { test } from './coverage-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('Saved units'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Use US units for all future charts.','Use Display settings to change the saved unit system.'));
