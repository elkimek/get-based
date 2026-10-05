// Copied portable JSON leaves retain their original unchecked values.
export interface ClientDataReader extends Record<string, unknown> { entries?: {length?:unknown}|null; customMarkers?:unknown }
export interface ChatThreadReader { id?: unknown }
export interface ClientExportObject extends Record<string, unknown> {version:number;exportedAt:string;profile:Record<string,unknown>;chat?:unknown;nutrition?:unknown;nutritionContextDays:number}
export interface BundleProfile extends Record<string,unknown> {id:string;data:unknown;nutrition:unknown;chat?:unknown}
export interface ExportBundle {version:number;type:string;exportedAt:string;profiles:BundleProfile[];wallet?:{nodeUrl:unknown}}
