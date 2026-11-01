import { test } from './coverage-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('Comparison workspace preferences'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Set the default Compare workspace date selections.','Choose collection dates in the Compare view.'));
