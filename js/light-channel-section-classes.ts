// Channel container ownership stays local; saved widget IDs and lazy CSS URLs stay stable.
const section = [
  'gb:channel-section:mt-0 gb:channel-section:[padding:18px_20px]',
  'gb:channel-section:[border:1px_solid_color-mix(in_srgb,_var(--border)_82%,_transparent)]',
  'gb:channel-section:[border-radius:var(--radius)] gb:channel-section:[background:color-mix(in_srgb,_var(--bg-card)_94%,_transparent)] gb:channel-section:[box-shadow:var(--shadow)]',
  "gb:channel-section:[.dashboard-widget[data-widget-id='light-channels']_&]:m-0 gb:channel-section:[.dashboard-widget[data-widget-id='light-channels']_&]:p-0",
  "gb:channel-section:[.dashboard-widget[data-widget-id='light-channels']_&]:[border:0] gb:channel-section:[.dashboard-widget[data-widget-id='light-channels']_&]:rounded-none gb:channel-section:[.dashboard-widget[data-widget-id='light-channels']_&]:bg-transparent gb:channel-section:[.dashboard-widget[data-widget-id='light-channels']_&]:[box-shadow:none]",
  'gb:channel-section:pill-narrow:[&_.light-section-title]:text-[15px]',
].join(' ');
export function channelSectionClasses(dashboard: boolean): string {
  return `light-channels-section ${section}${dashboard ? ' light-channels-section-dashboard gb:channel-section:grid gb:channel-section:gap-3' : ''}`;
}
