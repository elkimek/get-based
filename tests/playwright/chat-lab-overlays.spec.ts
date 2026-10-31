import { test } from './coverage-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('Chart layer preferences'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Always hide the supplement layer in my charts.','Use the native chart Layers menu to change saved layers.'));
