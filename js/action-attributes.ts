import { escapeAttr } from './utils.js';

/** Escape attribute names; omit missing and empty values while retaining false and zero. */
export function actionAttributes(namespace: string, action: unknown, attrs: Record<string, unknown> = {}, dataNamespace = namespace) {
  return [
    `data-${namespace}-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name, value]) => `data-${dataNamespace}-${escapeAttr(name)}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

/** Keep the established camel-case key convention and omit only nullish values. */
export function camelCaseActionAttributes(actionAttribute: string, dataNamespace: string, action: unknown, attrs: Record<string, unknown> = {}) {
  let html = `${actionAttribute}="${escapeAttr(action)}"`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    const attr = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    html += ` data-${dataNamespace}-${attr}="${escapeAttr(String(value))}"`;
  }
  return html;
}
