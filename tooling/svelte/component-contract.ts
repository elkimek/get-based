// Compare actual inferred component exports with the native artifact boundary.
import DisplaySettings from '../../js/components/DisplaySettings.svelte';
import type NativeDisplaySettings from '../../js/components/DisplaySettings.svelte.native.js';
export const compatible: typeof NativeDisplaySettings = DisplaySettings;

import SettingsShell from '../../js/components/SettingsShell.svelte';
import type NativeSettingsShell from '../../js/components/SettingsShell.svelte.native.js';
export const shellCompatible: typeof NativeSettingsShell = SettingsShell;

import PrivacySettings from '../../js/components/PrivacySettings.svelte';
import type NativePrivacySettings from '../../js/components/PrivacySettings.svelte.native.js';
export const privacyCompatible: typeof NativePrivacySettings = PrivacySettings;

import VoiceSettings from '../../js/components/VoiceSettings.svelte';
import type NativeVoiceSettings from '../../js/components/VoiceSettings.svelte.native.js';
export const voiceCompatible: typeof NativeVoiceSettings = VoiceSettings;

import AgentAccessSettings from '../../js/components/AgentAccessSettings.svelte';
import type NativeAgentAccessSettings from '../../js/components/AgentAccessSettings.svelte.native.js';
export const agentAccessCompatible: typeof NativeAgentAccessSettings = AgentAccessSettings;

import DataEntriesSettings from '../../js/components/DataEntriesSettings.svelte';
import type NativeDataEntriesSettings from '../../js/components/DataEntriesSettings.svelte.native.js';
export const dataEntriesSettingsCompatible: typeof NativeDataEntriesSettings = DataEntriesSettings;

import AIUsageSettings from '../../js/components/AIUsageSettings.svelte';
import type NativeAIUsageSettings from '../../js/components/AIUsageSettings.svelte.native.js';
export const aIUsageSettingsCompatible: typeof NativeAIUsageSettings = AIUsageSettings;
