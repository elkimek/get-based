import { test } from './coverage-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('Correlation workspace preferences'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Set these as my default correlation workspace selections.','Use the Correlations controls to configure the workspace.'));
