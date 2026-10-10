/** Preserve every existing native token; receiver-only keys must use Utilities. */
import { panelClasses } from "./knowledge-base-panel-classes.js";
import { documentsClasses } from "./knowledge-base-documents-classes.js";
import { createClasses } from "./knowledge-base-create-classes.js";
import { ingestClasses } from "./knowledge-base-ingest-classes.js";
import { chatClasses } from "./knowledge-base-chat-classes.js";
import { settingsClasses } from "./knowledge-base-settings-classes.js";

const catalogs = [panelClasses, documentsClasses, createClasses, ingestClasses, chatClasses, settingsClasses] as const;

export function knowledgeBaseUtilities(name: string): string {
  return catalogs.flatMap(catalog => Object.hasOwn(catalog, name) ? [catalog[name]!] : []).join(" ");
}

export function knowledgeBaseClasses(names: string): string {
  const native = names.split(/\s+/).filter(Boolean);
  return [...native, ...native.map(knowledgeBaseUtilities)].filter(Boolean).join(" ");
}
