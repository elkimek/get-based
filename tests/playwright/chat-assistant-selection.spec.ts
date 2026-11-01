import { test } from './coverage-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const provider of ['custom','venice'] as const) for (const protocol of ['native','structured'] as const) test('Model and reasoning selection'+' '+provider+' '+protocol+' stays in native UI', nativeManagementCase(provider,protocol,'Switch to model-b with high reasoning.','Choose the model and reasoning effort in the model picker.'));
