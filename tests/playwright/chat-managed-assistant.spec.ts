import { test } from './coverage-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('Connection administration'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Change my managed assistant connection.','Manage the assistant connection in Settings → AI.'));
