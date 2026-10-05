interface ChatSyncFixture {seed(id:string): Promise<ReturnType<typeof import('../../js/sync-payload.js').buildSyncPayload> extends Promise<infer T> ? T : ReturnType<typeof import('../../js/sync-payload.js').buildSyncPayload>>;pull(wire:string|undefined):Promise<void>;deleteThread(id:string):Promise<void>;reconcile(wire:string|undefined):Promise<void>;snapshot():ReturnType<typeof import('../../js/sync-payload-collectors.js').collectChatData>;wire():string|undefined;pushes():number}
import { routeHtml } from '../helpers/browser-static-routes.js';
import { expect, test } from '@playwright/test';

// Three independent browser stores with synthetic replica snapshots. The real
// app push/pull paths run; this deliberately does not contact a production relay.
async function createDevice(browser: import("@playwright/test").Browser) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await routeHtml(page, '**/__chat-sync-regression', '<!doctype html><title>Chat sync regression</title>');
  await page.goto('/__chat-sync-regression');
  await page.evaluate(async () => {
    const [{ state }, chat, collectors, payload, pull, push, delta, refresh, reconcile] = await Promise.all([
      import('/js/state.js'), import('/js/sync-chat-apply.js'), import('/js/sync-payload-collectors.js'),
      import('/js/sync-payload.js'), import('/js/sync-pull.js'), import('/js/sync-push.js'),
      import('/js/sync-delta.js'), import('/js/sync-pull-active-refresh-runtime.js'), import('/js/sync-reconcile.js'),
    ]);
    const profileId = 'chat-convergence';
    const profiles = [{ id: profileId, name: 'Synthetic sync regression' }];
    state.currentProfile = profileId; (state as {importedData: unknown}).importedData = {}; state.currentView = 'dashboard';
    localStorage.setItem('labcharts-profiles', JSON.stringify(profiles));
    let rows: {id?: unknown;profileId?:unknown;dataJson?:string | undefined; syncedAt?:unknown}[] = [];
    let pushes = 0;
    const query = {};
    const evolu = {
      getQueryRows: () => rows,
      update(_table: unknown, value: object, { onComplete }: {onComplete: ()=>unknown}) { rows = [{ ...rows[0], ...value }]; pushes++; onComplete(); },
      insert(_table: unknown, value: object, { onComplete }: {onComplete: ()=>unknown}) { rows = [{ id: 'replica', ...value }]; pushes++; onComplete(); },
    };
    const deps = { getEvolu: () => evolu, getProfileQuery: () => query, getProfiles: () => profiles, isSyncEnabled: () => true };
    payload.configureSyncPayload({ getProfiles: () => profiles });
    delta.configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null });
    push.configureSyncPush({ ...deps, isPhase2CutoverEnabled: () => false });
    (pull.configureSyncPull as (deps: Omit<NonNullable<Parameters<typeof pull.configureSyncPull>[0]>, "pushDirtyProfiles"> & {pushDirtyProfiles?: ()=>Promise<{succeeded:number;failed:number;skipped:number}>})=>ReturnType<typeof pull.configureSyncPull>)({ ...deps, pushProfile: push.pushProfile,
      pushDirtyProfiles: async () => ({ succeeded: 0, failed: 0, skipped: 0 }),
    });
    (reconcile.configureSyncReconcile as (deps: Omit<NonNullable<Parameters<typeof reconcile.configureSyncReconcile>[0]>, "getEvolu"> & {getEvolu: ()=>Pick<typeof evolu, "getQueryRows">})=>ReturnType<typeof reconcile.configureSyncReconcile>)({ ...deps, pushProfile: push.pushProfile });
    refresh.configureSyncPullActiveRefreshDeps({ buildSidebar: null, navigate: null,
      loadChatThreads: () => false, renderThreadList: () => {}, refreshChatPersonalities: () => {},
    });
    (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression = {
      async seed(id: string) {
        await chat.applyChatData(profileId, { threads: [{ id, updatedAt: '2026-09-01T12:00:00Z', messageCount: 1 }],
          messages: { [id]: [{ role: 'user', content: `Synthetic ${id}` }] } });
        return payload.buildSyncPayload(profileId, {});
      },
      async pull(wire: string | undefined) {
        rows = [{ id: 'replica', profileId, dataJson: wire, syncedAt: '2026-09-14T12:00:00Z' }];
        await pull.onSyncReceived();
      },
      async deleteThread(id: string) {
        await chat.applyChatData(profileId, { threads: [], deletedThreads: { [id]: Date.parse('2026-09-13T12:00:00Z') } });
        await push.pushProfile(profileId, {});
      },
      async reconcile(wire: string | undefined) {
        rows = [{ id: 'replica', profileId, dataJson: wire }];
        await reconcile.reconcileLocalStorageWithEvolu();
      },
      async snapshot() { return collectors.collectChatData(profileId); },
      wire: () => rows[0]?.dataJson,
      pushes: () => pushes,
    };
  });
  return { context, page };
}

async function ids(page: import("@playwright/test").Page) {
  return page.evaluate(async () => (await (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.snapshot())?.threads.map(t => t.id).sort() || []);
}

test('three devices converge after independent chats, deletion and a stale reconnect', async ({ browser }) => {
  const devices: Awaited<ReturnType<typeof createDevice>>[] = [];
  try {
    for (let i = 0; i < 3; i++) devices.push(await createDevice(browser));
    const [a, b, c] = devices.map(d => d.page);
    await a!.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.seed('a'));
    const staleB = await b!.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.seed('b'));
    await a!.evaluate(wire => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.pull(wire), staleB);
    await expect.poll(() => a!.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.pushes())).toBe(1);
    const union = await a!.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.wire());
    await b!.evaluate(wire => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.pull(wire), union);
    await c!.evaluate(wire => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.pull(wire), union);
    for (const page of [a, b, c]) expect(await ids(page!)).toEqual(['a', 'b']);

    await a!.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.deleteThread('a'));
    const deletion = await a!.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.wire());
    for (const page of [b, c]) await page!.evaluate(wire => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.pull(wire), deletion);
    for (const page of [a, b, c]) expect(await ids(page!)).toEqual(['b']);

    // An old client still republishes its pre-deletion full snapshot.
    await c!.evaluate(wire => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.pull(wire), union);
    await expect.poll(() => c!.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.pushes())).toBe(1);
    const repaired = await c!.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.wire());
    await b!.evaluate(wire => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.pull(wire), repaired);
    expect(await ids(b!)).toEqual(['b']);
    expect(await c!.evaluate(async () => (await (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.snapshot())!.deletedThreads!.a)).toBeGreaterThan(0);
  } finally {
    for (const { context } of devices) await context.close();
  }
});

test('startup repairs chat-only divergence with no local edit', async ({ browser }) => {
  const { context, page } = await createDevice(browser);
  try {
    await page.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.seed('retained'));
    await page.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.reconcile(JSON.stringify({ _v: 4 })));
    expect(await page.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.pushes())).toBe(1);
    const wire = await page.evaluate(() => (window as unknown as Window & {chatSyncRegression: ChatSyncFixture}).chatSyncRegression.wire());
    expect((JSON.parse(wire as string) as {chatData:{threads:{id?:unknown}[]}}).chatData.threads[0]!.id).toBe('retained');
  } finally { await context.close(); }
});

test('deletions beyond 200 persist and incomplete histories recover without undoing clears', async ({ browser }) => {
  const { context, page } = await createDevice(browser);
  try {
    const result = await page.evaluate(async () => {
      const { applyChatData } = await import('/js/sync-chat-apply.js');
      const { collectChatData } = await import('/js/sync-payload-collectors.js');
      const profileId = 'chat-convergence';
      const old = '2026-09-01T12:00:00Z';
      const recent = '2026-09-12T12:00:00Z';
      const deletedThreads = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`d${i}`, Date.parse(recent) + i]));
      await applyChatData(profileId, { threads: [], deletedThreads });
      await applyChatData(profileId, { threads: [{ id: 'd0', updatedAt: old, messageCount: 1 }], messages: { d0: [] } });
      await applyChatData(profileId, { threads: [{ id: 'partial', updatedAt: recent, messageCount: 1 }], messages: {} });
      await applyChatData(profileId, { threads: [{ id: 'partial', updatedAt: old, messageCount: 1 }], messages: { partial: [{ role: 'user', content: 'Recovered' }] } });
      const recovered = await collectChatData(profileId);
      await applyChatData(profileId, { threads: [{ id: 'partial', updatedAt: '2026-09-14T12:00:00Z', messagesUpdatedAt: '2026-09-14T12:00:00Z', messageCount: 0 }], messages: {} });
      await applyChatData(profileId, recovered);
      return { recovered, cleared: await collectChatData(profileId) };
    });
    expect(Object.keys(result.recovered!.deletedThreads!)).toHaveLength(201);
    expect(result.recovered!.threads.map(t => t.id)).toEqual(['partial']);
    expect((result.recovered!.messages as Record<string, {content?:unknown}[]>).partial![0]!.content).toBe('Recovered');
    expect((result.cleared!.messages as Record<string,unknown>).partial).toEqual([]);
  } finally { await context.close(); }
});

test('opening a missing body cannot clear it and message edits advance their sync clock', async ({ browser }) => {
  const { context, page } = await createDevice(browser);
  try {
    const result = await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const { loadChatHistory, saveChatHistory } = await import('/js/chat-history.js');
      const { applyChatData } = await import('/js/sync-chat-apply.js');
      const oldDate = '2026-09-01T12:00:00.000Z';
      state.currentThreadId = 'guarded';
      (state as {chatThreads: unknown}).chatThreads = [{ id: 'guarded', updatedAt: oldDate, messageCount: 1 }];
      localStorage.setItem('labcharts-chat-convergence-chat-threads', JSON.stringify(state.chatThreads));
      const missingLoaded = await loadChatHistory();
      const missingSaved = await saveChatHistory();
      const absentBody = localStorage.getItem('labcharts-chat-convergence-chat-t_guarded');
      await applyChatData('chat-convergence', { threads: state.chatThreads, messages: { guarded: [{ role: 'user', content: 'Recovered' }] } });
      const recoveredLoaded = await loadChatHistory();
      state.chatHistory[0]!.content = 'Edited without changing message count';
      await saveChatHistory();
      const editedClock = state.chatThreads[0]!.messagesUpdatedAt;
      await saveChatHistory();
      return { missingLoaded, missingSaved, absentBody, recoveredLoaded,
        editedClock, noopClock: state.chatThreads[0]!.messagesUpdatedAt, count: state.chatThreads[0]!.messageCount };
    });
    expect(result).toMatchObject({ missingLoaded: false, missingSaved: false, absentBody: null, recoveredLoaded: true, count: 1 });
    expect(Date.parse(result.editedClock as string)).toBeGreaterThan(Date.parse('2026-09-01T12:00:00Z'));
    expect(result.noopClock).toBe(result.editedClock as string);
  } finally { await context.close(); }
});
