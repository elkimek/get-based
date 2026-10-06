import type { DiscoveredAgent } from './agent-host-discovery.js';
import type { CliAgentSettingsSnapshot, CompanionPresentation } from './cli-agent-settings-contract.js';
import type { CompanionPlatform } from './cli-companion-commands.js';
import { getCompanionCommand } from './cli-companion-commands.js';
import { getCLIAgentBrandAsset } from './cli-agent-brand-assets.js';
import { AGENT_HOST_CAPABILITIES as caps, isAllowedCompanionManagementParent } from '../shared/agent-host-protocol.js';

function companionPresentation(agent: DiscoveredAgent, origin: string, theme: string): CompanionPresentation {
  const installed = agent.runtimeMode === 'installed';
  const description = `${installed ? 'Starts automatically at login' : 'Connected for this terminal session'}${agent.companionVersion ? ` · v${agent.companionVersion}` : ''}`;
  const has = (capability: string) => agent.capabilities?.includes(capability) === true;
  const common = { title:'Companion', description, guidance:'', managementHref:'', controls:[] };
  if (!has(caps.COMPANION_CONTROL) || (installed && !has(caps.COMPANION_RESTART))) return { ...common,mode:'outdated',title:'Update required',description:'This companion needs an update to support the current controls. Restarting the same file will not update it.' };
  if (agent.controlAuthorized === false || has(caps.COMPANION_MANAGEMENT_EMBEDDED)) {
    let url: URL | null = null;
    try { url = new URL(agent.endpoint); } catch { /* no invalid management navigation */ }
    if (url?.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.username || url.password) url = null;
    if (url) { url.hostname = '127.0.0.1'; url.pathname = '/manage'; url.search = ''; url.hash = ''; }
    const allowed = isAllowedCompanionManagementParent(origin);
    if (url && allowed && has(caps.COMPANION_MANAGEMENT_EMBEDDED)) {
      url.pathname = '/manage/embed'; url.searchParams.set('parentOrigin',origin); url.searchParams.set('theme',theme === 'light' ? 'light' : 'dark');
      return { ...common,mode:'embedded',managementHref:url.href };
    }
    const link = url && has(caps.COMPANION_MANAGEMENT) ? url.href : '';
    return { ...common,mode:'linked',title:'Connected for chat',description: `${description}${url ? ` · ${url.host}` : ''}`,
      managementHref:link,guidance:link ? (allowed ? 'Update Companion once to manage it directly in Settings. Until then, its controls open in local management.' : 'Open local management to control Companion from this deployment.') : 'Update Companion to enable its local management page. Until then, manage it from the terminal.' };
  }
  return { ...common,mode:'direct',controls:getDirectCompanionControls(agent) };
}
/** Shared presentation and dispatch policy for private companion control authority. */
export function getDirectCompanionControls(agent: DiscoveredAgent): CompanionPresentation['controls'] {
  const installed = agent.runtimeMode === 'installed', paused = agent.paused || agent.status === 'paused';
  if (!agent.controlAuthorized || !agent.capabilities.includes(caps.COMPANION_CONTROL)
    || agent.capabilities.includes(caps.COMPANION_MANAGEMENT_EMBEDDED)
    || (installed && !agent.capabilities.includes(caps.COMPANION_RESTART))) return [];
  return [
    { action:paused ? 'resume' : 'pause',label:paused ? 'Resume' : 'Pause',disabled:false,title:'' },
    { action:'restart',label:'Reconnect CLIs',disabled:paused,title:paused ? 'Resume the companion first' : 'Close and reopen the CLI agent connections without stopping the companion' },
    ...(installed ? [
      { action:'restart-companion' as const,label:'Restart companion',disabled:false,title:'Restart the getbased Companion service' },
      { action:'update' as const,label:'Check for update',disabled:false,title:'' },
      { action:'uninstall' as const,label:'Uninstall',disabled:false,title:'',danger:true },
    ] : [{ action:'install' as const,label:'Start automatically',disabled:false,title:'' }]),
  ];
}
export function selectCliCompanion(agents: readonly DiscoveredAgent[], selectedAgent: string): DiscoveredAgent | undefined {
  const available = agents.filter(agent => agent.compatible && ['available','paused','login_required'].includes(agent.status));
  return available.find(agent => agent.id === selectedAgent) || available[0];
}
export function buildCliAgentSettingsSnapshot(agents: readonly DiscoveredAgent[], context: {
  selectedAgent: string; backend: string; collapsed: ReadonlySet<string>; platform: CompanionPlatform; origin: string; theme: string;
}): CliAgentSettingsSnapshot {
  const rows = agents.map(agent => {
    const ready = agent.status === 'available', paused = agent.status === 'paused' || agent.paused;
    const selected = context.backend === 'codex' && agent.id === context.selectedAgent;
    return { id:agent.id,name:agent.name || agent.id,metadata:[agent.description,agent.version].filter(Boolean).join(' · '),icon:getCLIAgentBrandAsset(agent.id),
      ready,compatible:agent.compatible,selected,expandable:selected && ready,collapsed:context.collapsed.has(agent.id),
      status:ready ? 'Ready · companion running' : paused ? 'Companion paused' : agent.status === 'starting' ? 'Companion starting…' : agent.status === 'login_required' ? (agent.message || 'Installed · sign-in required') : agent.compatible ? 'Installed · companion not running' : 'Installed · adapter unavailable',
      testReason:ready ? '' : paused ? 'Resume the companion first' : agent.status === 'login_required' ? 'Sign in to this CLI first' : 'Start the companion first',
      login:agent.status === 'login_required' && ['codex','claude'].includes(agent.id) };
  });
  const companion = selectCliCompanion(agents,context.selectedAgent);
  return { phase:'ready',error:'',rows,showSetup:!(companion || agents.some(agent => agent.compatible && agent.status === 'starting')),
    platform:context.platform,runCommand:getCompanionCommand(context.platform,'run',{ origin:context.origin }),startCommand:getCompanionCommand(context.platform,'start',{ origin:context.origin }),
    companion:companion ? companionPresentation(companion,context.origin,context.theme) : null };
}
