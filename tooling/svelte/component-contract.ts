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

import PassphraseDialog from '../../js/components/PassphraseDialog.svelte';
import type NativePassphraseDialog from '../../js/components/PassphraseDialog.svelte.native.js';
export const passphraseCompatible: typeof NativePassphraseDialog = PassphraseDialog;

import SyncSettings from "../../js/components/SyncSettings.svelte";
import type NativeSyncSettings from "../../js/components/SyncSettings.svelte.native.js";
export const syncSettingsCompatible: typeof NativeSyncSettings = SyncSettings;

import SyncDialog from '../../js/components/SyncDialog.svelte';
import type NativeSyncDialog from '../../js/components/SyncDialog.svelte.native.js';
export const syncDialogCompatible: typeof NativeSyncDialog = SyncDialog;

import WearablesSettings from '../../js/components/WearablesSettings.svelte';
import type NativeWearablesSettings from '../../js/components/WearablesSettings.svelte.native.js';
export const wearablesSettingsCompatible: typeof NativeWearablesSettings = WearablesSettings;
