import type { PreparedReportPayload, ReportAISummary } from '../js/export-report.js';
import type { state } from '../js/state.js';
export interface ReportBuilderOptions {
 preset: string; presetLabel: string; dateRange: string; rangeMode: string; purpose: string;
 appendixSections: Array<string | undefined>; contextTitles: Array<string | undefined>; genomeMode: string;
 sections: Array<string | undefined>; categoryKeys: Array<string | undefined>; aiSummary?: ReportAISummary;
}
export interface ReportNoteReader { date?: unknown; text?: unknown }
export interface ReportNoteSnapshot {
 profile: typeof state.currentProfile; data: typeof state.importedData; notes: unknown[];
}
export interface ReportAISnapshot { profile: typeof state.currentProfile; payload: PreparedReportPayload | null }
