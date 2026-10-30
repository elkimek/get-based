import {expect, test, devices} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const mnemonic = 'oven federal awkward resist alter sound social version apart misery differ power buyer cloud avocado amount lady wedding silent nest fragile blanket oval fame';
// A separate synthetic owner ensures preceding current-runtime smoke tests
// cannot pre-create this fixture's old-format database.
const heldMnemonic = [...Array<string>(23).fill('abandon'), 'art'].join(' ');
const previousBridge = stripTypeScriptTypes(readFileSync(new URL('../fixtures/evolu8-web-3.1-bridge.ts.txt', import.meta.url), 'utf8'));

test('upgrades an existing Evolu 8 database in place and preserves it across a reload', async ({browserName, context: defaultContext, page: defaultPage, playwright}, info) => {
  // WebKit's isolated test contexts intentionally have no persistent OPFS.
  // Match normal Safari with a disposable persistent profile, as in smoke.spec.
  const persistent = browserName === 'webkit' ? await playwright.webkit.launchPersistentContext(info.outputPath('upgrade-profile'), {
    ...devices['Desktop Safari'], baseURL: String(info.project.use.baseURL), serviceWorkers: 'block',
  }) : null;
  const context = persistent ?? defaultContext;
  const page = persistent ? persistent.pages()[0] ?? await persistent.newPage() : defaultPage;
  const failedRequests: string[] = [];
  page.on('response', response => {if (response.status() >= 400 && /\/vendor\/evolu8\//.test(response.url())) failedRequests.push(new URL(response.url()).pathname);});
  await context.route('**/evolu-sqlite-upgrade-fixture', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Synthetic database migration</title>'}));
  const phase = async (version: 'previous' | 'current', insert: string | null, count: number) => {
    await page.goto('/evolu-sqlite-upgrade-fixture');
    return page.evaluate(async ({version, insert, count, mnemonic}) => {
      const bundle = version === 'previous' ? '/vendor/evolu8/evolu-bundle.js' : '/vendor/evolu8/v8.24.1-web3.6.5/evolu-bundle.js';
      const modern = await import(bundle) as typeof import('../../scripts/vendor-entries/evolu8.js');
      modern.installPolyfills();
      const schema = {todo: {id: modern.id('Todo'), title: modern.EvoluString}};
      const owner = modern.createAppOwner(modern.mnemonicToOwnerSecret(modern.Mnemonic.orThrow(mnemonic)));
      const deps = modern.createEvoluDeps(); const run = modern.createRun(deps);
      const errors: string[] = [];
      const unsubscribe = deps.evoluError.subscribe(() => {const error = deps.evoluError.get(); if (error) errors.push(error.type);});
      const evolu = await run.ok(modern.createEvolu(schema, {appName: modern.AppName.orThrow('getbasedupgradefixture'), appOwner: owner, transports: []}));
      const query = modern.createQueryBuilder(schema)(db => db.selectFrom('todo').selectAll());
      try {
        await evolu.loadQuery(query);
        if (insert) evolu.insert('todo', {title: insert});
        for (let attempt = 0; attempt < 100; attempt++) {
          await evolu.loadQuery(query);
          if (evolu.getQueryRows(query).length >= count) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        return {name: evolu.name, ownerId: owner.id, rows: evolu.getQueryRows(query).map(row => row.title).sort(), errors,
          persistence: version === 'current' ? await evolu.devicePersistence : null};
      } finally {
        unsubscribe(); await evolu[Symbol.asyncDispose](); await run[Symbol.asyncDispose](); deps[Symbol.dispose]();
      }
    }, {version, insert, count, mnemonic});
  };
  try {
    const previous = await phase('previous', 'before upgrade', 1);
    expect(previous.rows).toEqual(['before upgrade']); expect(previous.errors).toEqual([]);
    const upgraded = await phase('current', 'after upgrade', 2);
    expect(upgraded.ownerId).toBe(previous.ownerId); expect(upgraded.name).toBe(previous.name);
    expect(upgraded.rows).toEqual(['after upgrade', 'before upgrade']); expect(upgraded.errors).toEqual([]);
    expect(['Persisted', 'Unknown']).toContain(upgraded.persistence);
    const reopened = await phase('current', null, 2);
    expect(reopened.rows).toEqual(upgraded.rows); expect(reopened.ownerId).toBe(upgraded.ownerId); expect(reopened.errors).toEqual([]);
    expect(failedRequests).toEqual([]);
  } finally {await persistent?.close();}
});

test('refuses a database still held by the previous runtime and recovers its rows after an explicit reload', async ({browserName, context: defaultContext, playwright}, info) => {
  const relay = String(info.project.use.baseURL).replace(/^http/, 'ws') + '/unavailable-relay';
  const persistent = browserName === 'webkit' ? await playwright.webkit.launchPersistentContext(info.outputPath('held-profile'), {
    ...devices['Desktop Safari'], baseURL: String(info.project.use.baseURL), serviceWorkers: 'block',
  }) : null;
  const context = persistent ?? defaultContext;
  await context.route('**/evolu-held-database-fixture', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Synthetic held database</title>'}));
  const oldPage = persistent?.pages()[0] ?? await context.newPage();
  let page = oldPage;
  await oldPage.route(url => url.pathname === '/js/sync-evolu8-candidate.js', route => route.fulfill({contentType: 'text/javascript', body: previousBridge}));
  try {
    await oldPage.goto('/evolu-held-database-fixture');
    await oldPage.evaluate(async ({mnemonic, relay}) => {
      const [{createEvolu8SyncClient}, {createEvolu8IdentityVault}, {createSyncSchema, createSyncQueries}] = await Promise.all([
        import('/js/sync-evolu8-candidate.js'), import('/js/sync-evolu8-identity-vault.js'), import('/js/sync-schema.js'),
      ]);
      const previousBundle = '/vendor/evolu8/evolu-bundle.js';
      const previous = await import(previousBundle) as typeof import('../../scripts/vendor-entries/evolu8.js');
      const owner = previous.createAppOwner(previous.mnemonicToOwnerSecret(previous.Mnemonic.orThrow(mnemonic)));
      await createEvolu8IdentityVault().write({ownerId: owner.id, mnemonic});
      const client = await createEvolu8SyncClient({createSyncSchema, relay, reloadUrl: '/', enableLogging: false});
      const {profileQuery} = createSyncQueries(client);
      await client.loadQuery(profileQuery);
      if (client.getQueryRows(profileQuery)?.length) throw new Error('Held-database fixture must start with an empty old database');
      client.subscribeQuery(profileQuery)(() => {});
      client.insert('profileData', {profileId: 'held-fixture', dataJson: '{"synthetic":"preserved"}', syncedAt: '100'});
      const read = async () => {await client.loadQuery(profileQuery); return client.getQueryRows(profileQuery)?.map(row => row.dataJson) ?? [];};
      Reflect.set(globalThis, '__readHeldFixture', read);
      Reflect.set(globalThis, '__heldClient', client);
    }, {mnemonic: heldMnemonic, relay});
    await expect.poll(() => oldPage.evaluate(() => (Reflect.get(globalThis, '__readHeldFixture') as () => Promise<unknown>)())).toEqual(['{"synthetic":"preserved"}']);
    // Initialize the previous runtime in the foreground before opening the
    // competitor; Safari suspends work in background pages during startup.
    page = await context.newPage();
    await page.goto('/evolu-held-database-fixture');
    await page.evaluate(relay => {
      void Promise.all([import('/js/sync-evolu8-candidate.js'), import('/js/sync-schema.js'), import('/js/sync-subscriptions.js'), import('/js/sync-state.js')]).then(async ([factory, schema, subscriptions, state]) => {
        const client = await factory.createEvolu8SyncClient({createSyncSchema: schema.createSyncSchema, relay, reloadUrl: '/', enableLogging: false});
        // As in initSync, the facade can exist before its database is ready.
        // Bind the real error/status ports before awaiting the first query.
        const queries = schema.createSyncQueries(client);
        subscriptions.configureSyncSubscriptions({updateSyncStatus: state.updateSyncStatus, isSyncEnabled: () => true});
        subscriptions.bindSyncSubscriptions({evolu: client, ...queries});
        Reflect.set(globalThis, '__heldClient', client);
        void client.loadQuery(queries.profileQuery).then(() => {Reflect.set(globalThis, '__heldQueryLoaded', true);}).catch(() => {});
      }).catch(() => {Reflect.set(globalThis, '__heldStartRejected', true);});
    }, relay);
    await expect.poll(() => page.evaluate(async () => {
      const {getSyncStatus} = await import('/js/sync-state.js'); return getSyncStatus().databaseError;
    }), {timeout: 20_000}).toMatch(/^(DatabaseHeldError|OtherBuildRunningError)$/);
    expect(await page.evaluate(() => Reflect.has(globalThis, '__heldQueryLoaded'))).toBe(false);
    expect(await page.evaluate(async () => {
      const state = await import('/js/sync-state.js'); return state.getSyncStatusNotice(state.getSyncStatus());
    })).toMatch(/Close|close/);
    expect(await oldPage.evaluate(() => (Reflect.get(globalThis, '__readHeldFixture') as () => Promise<unknown>)())).toEqual(['{"synthetic":"preserved"}']);
    await oldPage.close();
    await page.reload();
    const rows = await page.evaluate(async relay => {
      const [{createEvolu8SyncClient}, {createSyncSchema, createSyncQueries}] = await Promise.all([import('/js/sync-evolu8-candidate.js'), import('/js/sync-schema.js')]);
      const client = await createEvolu8SyncClient({createSyncSchema, relay, reloadUrl: '/', enableLogging: false});
      const {profileQuery} = createSyncQueries(client); await client.loadQuery(profileQuery);
      const rows = client.getQueryRows(profileQuery)?.map(row => row.dataJson) ?? [];
      await client[Symbol.asyncDispose]?.(); return rows;
    }, relay);
    expect(rows).toEqual(['{"synthetic":"preserved"}']);
  } finally {await page.close(); if (!oldPage.isClosed()) await oldPage.close(); await persistent?.close();}
});
