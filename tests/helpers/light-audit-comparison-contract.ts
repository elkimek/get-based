// Compare behavior independently of the native-template/Svelte utility syntax.
// Every displayed value, direction, severity state and action remains explicit.
export function describeAuditComparison(host: ParentNode) {
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim();
  const arrow = (node: Element) => {
    const inline = (node as HTMLElement).style.color;
    const colors = ['green', 'red', 'text-muted'];
    const utility = colors.find(color => node.classList.contains(`gb:environment-audit:[color:var(--${color})]`));
    return {glyph: text(node), color: inline || (utility ? `var(--${utility})` : null)};
  };
  const severity = (node: Element) => ({classes: [...node.classList].filter(name => /^light-env-sev-|^light-audit-sev-empty$/.test(name)), title: node.getAttribute('title')});
  return {
    labels: [...host.querySelectorAll('.light-audit-compare-label')].map(text),
    note: text(host.querySelector('.light-audit-compare-note')),
    interpret: [...host.querySelectorAll('[data-light-env-action="interpret-audit-compare"]')].map(node => ({text: text(node), action: node.getAttribute('data-light-env-action'), oldId: node.getAttribute('data-light-env-old-id'), newId: node.getAttribute('data-light-env-new-id'), title: node.getAttribute('title')})),
    rooms: [...host.querySelectorAll('.light-audit-compare-room')].map(room => ({
      classes: [...room.classList].filter(name => name.startsWith('light-audit-compare-room')),
      name: text(room.querySelector('.light-audit-compare-room-name')),
      severity: [...room.querySelectorAll('.light-audit-compare-room-head .light-env-sev-dot,.light-audit-sev-empty')].map(severity),
      headingArrow: [...room.querySelectorAll('.light-audit-compare-room-head .light-audit-arrow')].map(arrow),
      verdict: text(room.querySelector('.light-audit-compare-verdict')),
      verdictClasses: [...(room.querySelector('.light-audit-compare-verdict')?.classList || [])].filter(name => name.startsWith('light-audit-compare-verdict')),
      rows: [...room.querySelectorAll('.light-audit-compare-channel')].map(row => ({
        label: text(row.querySelector('.light-audit-compare-channel-label')),
        title: row.querySelector('.light-audit-compare-channel-label')?.getAttribute('title'),
        before: text(row.querySelector('.light-audit-compare-channel-before')),
        after: text(row.querySelector('.light-audit-compare-channel-after')),
        arrows: [...row.querySelectorAll('.light-audit-arrow')].map(arrow),
      })),
    })),
    empty: [...host.querySelectorAll('.light-audit-compare-rooms .light-audit-empty')].map(text),
  };
}
