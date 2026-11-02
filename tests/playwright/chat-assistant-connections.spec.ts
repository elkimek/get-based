import { test } from './coverage-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('Provider selection'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Switch from Venice to DeepSeek through another provider.','Choose your provider and model in Settings → AI.'));
