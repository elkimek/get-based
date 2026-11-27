import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {expect, type BrowserContext, type Page} from '@playwright/test';
import {CodexAppServerClient} from '../../lib/codex-app-server-client.js';
import {createAgentHostService} from '../../lib/agent-host-service.js';
import {companionChatPairingCode, companionManagementCode} from '../../lib/agent-host-boundary.js';

class CatalogClient extends CodexAppServerClient {
  readonly target: string;

  constructor(target: string) {
    super({spawnImpl: () => { throw new Error('This catalog fixture cannot launch a CLI'); }});
    this.target = target;
  }

  override async initialize() {}

  override async request<T>(method: string): Promise<T> {
    if (method !== 'model/list') throw new Error('Unexpected synthetic CLI method');
    const data = ['first', 'second'].map((name, index) => ({
      id: `${this.target}-${name}`,
      model: `${this.target}-${name}`,
      displayName: `${this.target} ${name}`,
      isDefault: index === 0,
      inputModalities: ['text', 'image'],
      defaultReasoningEffort: 'low',
      supportedReasoningEfforts: [
        {reasoningEffort: 'low', description: 'Low'},
        {reasoningEffort: 'high', description: 'High'},
      ],
    }));
    return {data} as T;
  }

  override respond(): never { throw new Error('Unexpected synthetic CLI response'); }
}

const permittedPaths = new Set(['/v1/status', '/v1/pairing', '/v1/discovery', '/v1/models', '/v1/targets',
  '/v1/control', '/manage', '/manage/pair', '/manage/status', '/manage/control', '/favicon.ico']);

/** Exercise genuine local pairing, session issuance, discovery and management.
 * Model catalogs and OS installation operations use synthetic implementations. */
export async function startTestCompanion(appOrigin: string, {includeHermes = false} = {}) {
  const installation = randomBytes(32).toString('hex');
  let mode = 'installed';
  let outdated = false;
  const calls: Array<{path: string; method: string; status: number; action?: string; authenticated: boolean}> = [];
  const local = new CatalogClient('local');
  const service = createAgentHostService({
    appServer: local, token: installation, allowedOrigins: [appOrigin], workspaceRoot: '/unused-fixture',
    agents: [...(includeHermes ? [{
      id: 'hermes', name: 'Hermes Agent', description: 'Synthetic second agent', status: 'available',
      compatible: true, protocol: 'codex' as const, client: new CatalogClient('hermes'),
    }] : []), {
      id: 'codex', name: 'Codex CLI', description: 'Synthetic model catalog', status: 'available',
      compatible: true, protocol: 'codex', client: local,
      routes: [{
        id: 'gateway', label: 'Personal gateway', kind: 'gateway', status: 'available',
        supportsLocalTools: false, supportsFeatureJobs: false, protocol: 'codex', client: new CatalogClient('gateway'),
      }],
    }],
    runtimeInfo: () => ({runtimeMode: mode}),
    controlHandler: async action => {
      if (action === 'install') mode = 'installed';
      if (action === 'uninstall') mode = 'temporary';
      return {runtimeMode: mode, updated: action === 'update', restartRequired: action === 'update'};
    },
  });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, endpoint);
      if (!permittedPaths.has(url.pathname)) { res.writeHead(404).end(); return; }
      const bytes: Uint8Array[] = [];
      for await (const chunk of req) bytes.push(chunk);
      const body = Buffer.concat(bytes).toString();
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const reply = await service.handleRequest(new Request(url, {method: req.method!, headers, ...(body ? {body} : {})}));
      calls.push({
        path: url.pathname, method: req.method!, status: reply.status, authenticated: headers.has('Authorization'),
        ...(url.pathname === '/manage/control' && body ? {action: JSON.parse(body).action} : {}),
      });
      res.writeHead(reply.status, Object.fromEntries(reply.headers));
      if (outdated && url.pathname === '/v1/discovery' && reply.ok && req.method === 'GET') {
        const discovery = await reply.json();
        discovery.capabilities = ['chat-stream'];
        for (const agent of discovery.agents) agent.capabilities = discovery.capabilities;
        res.end(JSON.stringify(discovery));
      } else {
        res.end(Buffer.from(await reply.arrayBuffer()));
      }
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const code = companionChatPairingCode(installation, endpoint);
  return {
    endpoint, calls, installation, code,
    managementCode: () => companionManagementCode(installation, endpoint),
    setOutdated(value: boolean) { outdated = value; },
    async restrictConnections(context: BrowserContext) {
      // Preserve the deployed CSP and further limit this profile to its synthetic endpoints.
      await context.addInitScript(({app, companion}) => {
        if (location.origin !== app && location.origin !== companion) return;
        const policy = document.createElement('meta');
        policy.httpEquiv = 'Content-Security-Policy';
        policy.content = `connect-src 'self' ${companion}`;
        const install = () => document.head.prepend(policy);
        if (document.head) install();
        else {
          const observer = new MutationObserver(() => {
            if (document.head) { install(); observer.disconnect(); }
          });
          observer.observe(document, {childList: true, subtree: true});
        }
      }, {app: appOrigin, companion: endpoint});
    },
    async pair(page: Page) {
      await expect(page.locator('.local-agent-row')).toHaveCount(0);
      await page.getByText('Pair this browser with Companion', {exact: true}).click();
      await page.getByLabel('Chat pairing code').fill(code);
      await page.getByRole('button', {name: 'Pair browser', exact: true}).click();
      await expect(page.locator('.local-agent-row')).toHaveCount(includeHermes ? 2 : 1);
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
