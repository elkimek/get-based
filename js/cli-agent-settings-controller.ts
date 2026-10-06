import type { AgentConnectionOptions, DiscoveredAgent } from './agent-host-discovery.js';
import type { AgentHostConnection } from './agent-chat-client.js';
import type { CliAgentSettingsView, CompanionAction, CliCopyAction } from './cli-agent-settings-contract.js';
import { getCompanionCommand, type CompanionPlatform } from './cli-companion-commands.js';
import { getDirectCompanionControls, selectCliCompanion } from './cli-agent-settings-presentation.js';

interface CliContext {
  agent: string;
  target: string;
  model: string;
  effort: string;
  backend: string;
}
interface CompanionIdentity { id: string; endpoint: string; token: string }
interface CliControllerPorts {
  view(): CliAgentSettingsView | null;
  platform(): CompanionPlatform;
  context(): CliContext;
  connection(): { endpoint: string; token: string };
  companion(): CompanionIdentity | null;
  connect(agent: string, options: AgentConnectionOptions): Promise<unknown>;
  discover(options: { refresh: true }): Promise<DiscoveredAgent[]>;
  models(options: AgentHostConnection & { target: string }): Promise<unknown[]>;
  save(settings: { agent: string }): Promise<unknown>;
  control(options: AgentHostConnection & { action: CompanionAction }): Promise<Record<string, unknown>>;
  setBackend(value: string): unknown;
  notify(text: string, tone: string, duration?: number): unknown;
  confirm(text: string): Promise<unknown>;
  clipboard(text: string): Promise<unknown>;
  refresh(options?: { refresh?: boolean }): Promise<unknown>;
  resetModels(): void;
  busyChanged(value: boolean): void;
}
const actions: readonly CompanionAction[] = ['pause', 'resume', 'install', 'restart', 'restart-companion', 'update', 'uninstall'];

/** The facade creates one controller so accepted work stays single-flight across remounts. */
export function createCliAgentSettingsController(ports: CliControllerPorts) {
  let busy = false;
  const connectionMatches = (connection: ReturnType<CliControllerPorts['connection']>) => {
    const latest = ports.connection();
    return latest.endpoint === connection.endpoint && latest.token === connection.token;
  };
  function capture() {
    const view = ports.view();
    if (!view?.isCurrent() || busy) return null;
    const context = ports.context(), stamp = JSON.stringify(context), connection = ports.connection(), companion = ports.companion();
    const current = () => view.isCurrent() && JSON.stringify(ports.context()) === stamp;
    const companionCurrent = () => {
      const latest = ports.companion();
      return !!companion && latest?.id === companion.id && latest.endpoint === companion.endpoint && latest.token === companion.token;
    };
    return { view, context, current, companion, companionCurrent, connectionCurrent: () => connectionMatches(connection) };
  }
  async function run<T>(work: (scope: NonNullable<ReturnType<typeof capture>>) => Promise<T>): Promise<T | undefined> {
    const scope = capture();
    if (!scope) return;
    busy = true;
    ports.busyChanged(true);
    try { return await work(scope); }
    finally {
      busy = false;
      ports.busyChanged(false);
    }
  }
  async function copy(action: CliCopyAction) {
    const platform = ports.platform();
    return run(async scope => {
      const current = () => scope.current() && ports.platform() === platform;
      try {
        await ports.clipboard(getCompanionCommand(platform, action));
        if (!current()) return;
        const terminal = platform === 'windows' ? 'PowerShell' : 'Terminal';
        const message = action === 'run' ? `Run-once command copied. Paste it into ${terminal}, then check the connection.`
          : action === 'start' ? `Start command copied. Paste it into ${terminal}.`
          : `Update command copied. Run it in ${terminal}, then check the connection.`;
        ports.notify(message, 'success', action === 'install' ? 8000 : 7000);
      } catch { if (current()) ports.notify('Could not access the clipboard', 'error'); }
    });
  }
  async function login(agent: string) {
    const command = agent === 'claude' ? 'claude auth login --console' : agent === 'codex' ? 'codex login' : '';
    if (!command) return;
    return run(async scope => {
      try {
        await ports.clipboard(command);
        if (scope.current()) ports.notify(`${agent === 'claude' ? 'Claude Agent' : 'Codex'} sign-in command copied`, 'success');
      } catch { if (scope.current()) ports.notify('Could not access the clipboard', 'error'); }
    });
  }
  async function test(agent: string) {
    return run(async scope => {
      let connected: ReturnType<CliControllerPorts['connection']> | null = null;
      const current = () => scope.current() && (connected ? connectionMatches(connected) : scope.connectionCurrent());
      scope.view.setStatus('Testing CLI agent…');
      try {
        await ports.connect(agent, { isCurrent: () => scope.current() && scope.connectionCurrent() });
        if (!scope.current()) return;
        connected = ports.connection();
        await ports.models({ ...connected, agent, target: agent === scope.context.agent ? scope.context.target : 'local' });
        if (!current()) return;
        scope.view.setStatus('CLI agent is ready.');
        ports.notify('CLI agent is ready', 'success');
        await ports.refresh();
      } catch (error) {
        if (!current()) return;
        scope.view.setStatus('CLI agent could not connect.');
        ports.notify(error instanceof Error ? error.message : 'CLI agent could not connect.', 'error', 9000);
      }
    });
  }
  async function toggle(enabled: boolean, agent: string) {
    return run(async scope => {
      if (!enabled) {
        ports.setBackend('direct');
        ports.notify('API or Local AI selected for chat', 'success');
        await ports.refresh();
        return;
      }
      let connected: ReturnType<CliControllerPorts['connection']> | null = null;
      try {
        await ports.connect(agent, { isCurrent: () => scope.current() && scope.connectionCurrent() });
        if (!scope.current()) return;
        connected = ports.connection();
        await ports.save({ agent });
        if (!scope.view.isCurrent() || !connectionMatches(connected)
          || ports.context().agent !== agent || ports.context().backend !== scope.context.backend) return;
        ports.resetModels();
        ports.setBackend('codex');
        ports.notify('CLI agent selected for chat', 'success');
        await ports.refresh();
      } catch (error) {
        if (!scope.current() || !(connected ? connectionMatches(connected) : scope.connectionCurrent())) return;
        ports.setBackend('direct');
        ports.notify(error instanceof Error ? error.message : 'CLI agent could not connect.', 'error', 9000);
        await ports.refresh();
      }
    });
  }
  async function control(requested: string) {
    if (!actions.includes(requested as CompanionAction)) return;
    const action = requested as CompanionAction;
    return run(async scope => {
      if (!scope.companionCurrent()) return;
      if (!scope.view.getSnapshot().companion?.controls.some(control => control.action === action && !control.disabled)) return;
      if (action === 'uninstall' && !await ports.confirm('Remove the getbased Companion from automatic startup? The current connection will remain available until this session ends.')) return;
      if (!scope.current() || !scope.connectionCurrent() || !scope.companionCurrent()) return;
      try {
        const agents = await ports.discover({ refresh: true });
        if (!scope.current() || !scope.connectionCurrent() || !scope.companionCurrent()) return;
        const companion = selectCliCompanion(agents, scope.context.agent);
        if (!companion?.endpoint || !companion.token) throw new Error('The getbased Companion is not running. Use the connection command first.');
        if (companion.id !== scope.companion?.id || companion.endpoint !== scope.companion.endpoint || companion.token !== scope.companion.token
          || !getDirectCompanionControls(companion).some(control => control.action === action && !control.disabled)) {
          throw new Error('Companion controls changed. Check the connection again.');
        }
        const result = await ports.control({ endpoint: companion.endpoint, token: companion.token, action });
        // An accepted pause affects the still-selected host even after Settings closes.
        if (action === 'pause' && ports.connection().endpoint === companion.endpoint
          && scope.connectionCurrent() && ports.context().backend === 'codex') ports.setBackend('direct');
        const expectedBackend = action === 'pause' && scope.context.backend === 'codex'
          && ports.connection().endpoint === companion.endpoint ? 'direct' : scope.context.backend;
        const feedbackCurrent = () => scope.view.isCurrent() && scope.connectionCurrent() && scope.companionCurrent()
          && JSON.stringify(ports.context()) === JSON.stringify({ ...scope.context, backend: expectedBackend });
        if (!feedbackCurrent()) return result;
        const messages: Record<CompanionAction, string> = {
          pause: 'Companion paused. getbased switched to direct AI.', resume: 'Companion resumed', restart: 'CLI connections reopened',
          'restart-companion': 'Companion is restarting. It will reconnect in a moment.', install: 'Companion will now start automatically at login',
          uninstall: 'Companion removed from automatic startup',
          update: result.restartRequired ? 'Update installed. Select Restart companion to use it now.' : 'Companion is up to date',
        };
        ports.notify(messages[action], 'success', action === 'update' ? 8000 : 7000);
        if (action === 'restart-companion') setTimeout(() => { if (feedbackCurrent()) void ports.refresh({ refresh: true }); }, 1800);
        else await ports.refresh({ refresh: true });
        return result;
      } catch (error) {
        if (scope.current() && scope.connectionCurrent() && scope.companionCurrent()) ports.notify(error instanceof Error ? error.message : 'Could not manage the companion.', 'error', 9000);
      }
      return undefined;
    });
  }
  return { isBusy: () => busy, copy, login, test, toggle, control };
}
