const _ESCAPE_HTML_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHTML(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => _ESCAPE_HTML_MAP[c]!);
}


export const escapeAttr = escapeHTML;
