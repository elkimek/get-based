import { test } from './coverage-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('History workspace preferences'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Always show nutrition history as Trends for the last year.','Use the history controls to choose the view and range.'));
