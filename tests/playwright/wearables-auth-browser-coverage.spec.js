import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?wearablesAuthCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('confidential wearable OAuth modules cover callback refresh and token guards', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ cases }) => {
    const outcomes = {};
    const originalFetch = window.fetch;

    const makeResponse = ({ body = {}, status = 200 } = {}) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const exerciseBeginOAuth = async (spec) => {
      const frame = document.createElement('iframe');
      let timeoutId = null;
      const loaded = new Promise((resolve, reject) => {
        frame.onload = () => {
          if (timeoutId != null) clearTimeout(timeoutId);
          resolve();
        };
        timeoutId = setTimeout(() => reject(new Error(`Timed out loading auth iframe for ${spec.id}`)), 5000);
      });
      frame.src = `/app?wearables-auth-frame=${encodeURIComponent(spec.id)}-${Date.now()}`;
      document.body.appendChild(frame);
      try {
        await loaded;
        const win = frame.contentWindow;
        win.sessionStorage.removeItem(spec.stateKey);
        sessionStorage.removeItem(spec.stateKey);
        const frameMod = await win.eval(`import(${JSON.stringify(`${spec.url}&beginFrame=1`)})`);
        const maybePromise = frameMod.beginOAuth({
          clientId: 'client-id',
          registeredUris: [`${location.origin}/app`],
          scopes: ['scope:one'],
          profileId: 'wearables-auth-profile',
        });
        if (maybePromise?.catch) maybePromise.catch(() => {});
        const raw = sessionStorage.getItem(spec.stateKey) || win.sessionStorage.getItem(spec.stateKey);
        return JSON.parse(raw || '{}');
      } finally {
        if (timeoutId != null) clearTimeout(timeoutId);
        frame.remove();
      }
    };

    try {
      for (const spec of cases) {
        try {
          const mod = await import(spec.url);
          const requests = [];
          const fetchQueue = [];
          window.fetch = async (url, options = {}) => {
            const parsedBody = JSON.parse(String(options.body || '{}'));
            requests.push({
              url: String(url),
              method: options.method,
              body: parsedBody,
            });
            const next = fetchQueue.shift();
            if (!next) throw new Error(`Unexpected fetch for ${spec.id}`);
            return makeResponse(next);
          };
          const enqueue = (body, status = 200) => fetchQueue.push({ body, status });

          const exact = mod.pickRedirectUri([
            `${location.origin}/app`,
            'https://example.invalid/callback',
          ], { origin: location.origin, pathname: '/app' });
          const byOrigin = mod.pickRedirectUri([
            `${location.origin}/registered-callback`,
          ], { origin: location.origin, pathname: '/app' });
          let noMatchThrows = false;
          try {
            mod.pickRedirectUri(['https://example.invalid/callback'], { origin: location.origin, pathname: '/app' });
          } catch {
            noMatchThrows = true;
          }
          outcomes[`${spec.id}RedirectPicker`] = exact === `${location.origin}/app`
            && byOrigin === `${location.origin}/registered-callback`
            && noMatchThrows;

          const authUrl = mod.buildAuthorizeUrl({
            clientId: 'client-id',
            redirectUri: `${location.origin}/app`,
            scopes: ['scope:one', 'scope:two'],
            state: 'state-ok',
          });
          const parsedAuthUrl = new URL(authUrl);
          outcomes[`${spec.id}AuthorizeUrl`] = parsedAuthUrl.hostname === spec.authorizeHost
            && parsedAuthUrl.searchParams.get('client_id') === 'client-id'
            && parsedAuthUrl.searchParams.get('redirect_uri') === `${location.origin}/app`
            && parsedAuthUrl.searchParams.get('response_type') === 'code'
            && parsedAuthUrl.searchParams.get('scope') === spec.scopeValue
            && parsedAuthUrl.searchParams.get('state') === 'state-ok'
            && !parsedAuthUrl.searchParams.has('code_challenge');

          const beginState = await exerciseBeginOAuth(spec);
          outcomes[`${spec.id}BeginOAuthStoresPending`] = beginState.clientId === 'client-id'
            && beginState.redirectUri === `${location.origin}/app`
            && beginState.profileId === 'wearables-auth-profile'
            && typeof beginState.startedAt === 'number'
            && typeof beginState.state === 'string'
            && beginState.state.length === 32
            && beginState.codeVerifier === undefined;
          sessionStorage.removeItem(spec.stateKey);

          sessionStorage.setItem(spec.stateKey, JSON.stringify({
            state: 'state-ok',
            redirectUri: `${location.origin}/app`,
            startedAt: Date.now(),
            clientId: 'client-id',
            profileId: 'wearables-auth-profile',
          }));
          enqueue(spec.exchangeResponse);
          const callback = await mod[spec.completeName](new URLSearchParams('code=code-123&state=state-ok'));
          const exchangeBody = requests.at(-1)?.body?.[spec.exchangeKey];
          outcomes[`${spec.id}CallbackSuccess`] = callback.ok === true
            && callback.tokens.accessToken === spec.exchangeAccess
            && callback.tokens.refreshToken === spec.exchangeRefresh
            && callback.tokens.tokenType === spec.exchangeTokenType
            && callback.redirectUri === `${location.origin}/app`
            && callback.profileId === 'wearables-auth-profile'
            && exchangeBody?.code === 'code-123'
            && exchangeBody?.redirect_uri === `${location.origin}/app`
            && exchangeBody?.client_id === 'client-id'
            && (!spec.exchangeUserId || callback.tokens.userId === spec.exchangeUserId);

          const errorCallback = await mod[spec.completeName](new URLSearchParams('error=access_denied&error_description=nope'));
          const missingStateCallback = await mod[spec.completeName](new URLSearchParams('code=only-code'));
          const missingCodeCallback = await mod[spec.completeName](new URLSearchParams('state=only-state'));
          outcomes[`${spec.id}CallbackEarlyErrors`] = errorCallback.ok === false
            && errorCallback.error.includes('access_denied')
            && missingStateCallback.ok === false
            && missingStateCallback.error === 'Missing code or state in callback'
            && missingCodeCallback.ok === false
            && missingCodeCallback.error === 'Missing code or state in callback';

          sessionStorage.setItem(spec.stateKey, JSON.stringify({
            state: 'expected-state',
            redirectUri: `${location.origin}/app`,
            startedAt: Date.now(),
            clientId: 'client-id',
          }));
          const mismatch = await mod[spec.completeName](new URLSearchParams('code=code-123&state=wrong-state'));
          outcomes[`${spec.id}CallbackConsumesMismatch`] = mismatch.ok === false
            && mismatch.error.includes('State mismatch')
            && sessionStorage.getItem(spec.stateKey) === null;

          sessionStorage.setItem(spec.stateKey, JSON.stringify({
            state: 'state-ok',
            redirectUri: `${location.origin}/app`,
            startedAt: Date.now() - (11 * 60 * 1000),
            clientId: 'client-id',
          }));
          const stale = await mod[spec.completeName](new URLSearchParams('code=code-123&state=state-ok'));
          outcomes[`${spec.id}CallbackRejectsStale`] = stale.ok === false
            && stale.error.includes('expired');

          sessionStorage.setItem(spec.stateKey, '{bad json');
          const corrupt = await mod[spec.completeName](new URLSearchParams('code=code-123&state=state-ok'));
          outcomes[`${spec.id}CallbackRejectsCorrupt`] = corrupt.ok === false
            && corrupt.error.includes('Corrupt pending state');

          sessionStorage.setItem(spec.stateKey, JSON.stringify({ state: 'callback-state' }));
          outcomes[`${spec.id}CallbackDetector`] = mod[spec.callbackName](new URLSearchParams('state=callback-state')) === true
            && mod[spec.callbackName](new URLSearchParams('state=other-state')) === false;
          sessionStorage.setItem(spec.stateKey, '{bad json');
          outcomes[`${spec.id}CallbackDetectorRejectsCorrupt`] = mod[spec.callbackName](new URLSearchParams('state=callback-state')) === false;
          sessionStorage.removeItem(spec.stateKey);

          enqueue(spec.refreshResponse);
          const refreshed = await mod.refreshTokens({ clientId: 'client-id', refreshToken: 'refresh-old' });
          const refreshBody = requests.at(-1)?.body?.[spec.refreshKey];
          outcomes[`${spec.id}RefreshSuccess`] = refreshed.accessToken === spec.refreshAccess
            && refreshed.refreshToken === spec.refreshRefresh
            && refreshed.tokenType === spec.refreshTokenType
            && refreshBody?.refresh_token === 'refresh-old'
            && refreshBody?.client_id === 'client-id'
            && (!spec.refreshUserId || refreshed.userId === spec.refreshUserId);

          enqueue(spec.httpErrorResponse, 401);
          let refreshHttpError = null;
          try {
            await mod.refreshTokens({ clientId: 'client-id', refreshToken: 'bad-refresh' });
          } catch (error) {
            refreshHttpError = error;
          }
          outcomes[`${spec.id}RefreshHttpError`] = refreshHttpError?.status === 401
            && refreshHttpError.message.includes(spec.httpErrorText);

          if (spec.withingsStatusError) {
            enqueue(spec.withingsStatusError);
            let withingsStatusError = null;
            try {
              await mod.refreshTokens({ clientId: 'client-id', refreshToken: 'dead-refresh' });
            } catch (error) {
              withingsStatusError = error;
            }
            outcomes[`${spec.id}RefreshProviderError`] = withingsStatusError?.status === 401
              && withingsStatusError.withingsCode === spec.withingsStatusError.status
              && withingsStatusError.message.toLowerCase().includes('token');
          }

          const validConnection = {
            accessToken: 'still-valid',
            refreshToken: 'refresh-valid',
            expiresAt: Date.now() + (60 * 60 * 1000),
            scope: 'old-scope',
            userId: spec.refreshUserId ? 'user-old' : undefined,
          };
          const noWrite = [];
          const validResult = await mod.withFreshToken(validConnection, 'client-id', async updated => noWrite.push(updated));
          outcomes[`${spec.id}WithFreshTokenSkipsValid`] = validResult === validConnection
            && noWrite.length === 0;

          const latestConnection = {
            accessToken: 'latest-access',
            refreshToken: 'latest-refresh',
            expiresAt: Date.now() + (60 * 60 * 1000),
            scope: 'latest-scope',
            userId: spec.refreshUserId ? 'latest-user' : undefined,
          };
          const latestWrites = [];
          const latestResult = await mod.withFreshToken({
            accessToken: 'expired',
            refreshToken: 'refresh-old',
            expiresAt: Date.now() - 1,
          }, 'client-id', async updated => latestWrites.push(updated), () => latestConnection);
          outcomes[`${spec.id}WithFreshTokenUsesLatest`] = latestResult === latestConnection
            && latestWrites.length === 0;

          enqueue(spec.freshResponse);
          const writes = [];
          const updated = await mod.withFreshToken({
            accessToken: 'expired',
            refreshToken: 'refresh-old',
            expiresAt: Date.now() - 1,
            scope: 'old-scope',
            userId: spec.refreshUserId ? 'old-user' : undefined,
          }, 'client-id', async next => writes.push(next), () => null);
          outcomes[`${spec.id}WithFreshTokenRefreshesAndWrites`] = updated.accessToken === spec.freshAccess
            && updated.refreshToken === spec.freshRefresh
            && updated.scope === spec.freshScope
            && writes.length === 1
            && writes[0].accessToken === spec.freshAccess
            && (!spec.freshUserId || updated.userId === spec.freshUserId);

          const missingRefreshWrites = [];
          let missingRefreshError = null;
          let missingRefreshResult = null;
          try {
            missingRefreshResult = await mod.withFreshToken({
              accessToken: 'expired',
              expiresAt: Date.now() - 1,
            }, 'client-id', async next => missingRefreshWrites.push(next), () => null);
          } catch (error) {
            missingRefreshError = error;
          }
          outcomes[`${spec.id}WithFreshTokenMissingRefresh`] = spec.id === 'polar'
            ? missingRefreshResult?.accessToken === 'expired' && missingRefreshWrites.length === 0
            : missingRefreshError?.code === 'needs-reauth' && missingRefreshWrites.length === 0;
          outcomes[`${spec.id}ProviderCompleted`] = true;
        } catch (error) {
          outcomes[`${spec.id}ProviderError: ${error?.message || error}`] = false;
        } finally {
          sessionStorage.removeItem(spec.stateKey);
        }
      }
    } finally {
      window.fetch = originalFetch;
      for (const spec of cases) sessionStorage.removeItem(spec.stateKey);
    }

    return outcomes;
  }, {
    cases: [
      {
        id: 'oura',
        url: moduleUrl('/js/wearables-oura-auth.js'),
        stateKey: 'oura-oauth-pending',
        authorizeHost: 'cloud.ouraring.com',
        scopeValue: 'scope:one scope:two',
        completeName: 'completeOAuthCallback',
        callbackName: 'isOuraCallback',
        exchangeKey: 'oura_token_exchange',
        refreshKey: 'oura_token_refresh',
        exchangeResponse: { access_token: 'oura-access', refresh_token: 'oura-refresh', expires_in: 120, scope: 'daily', token_type: 'bearer' },
        exchangeAccess: 'oura-access',
        exchangeRefresh: 'oura-refresh',
        exchangeTokenType: 'bearer',
        refreshResponse: { access_token: 'oura-refreshed', refresh_token: 'oura-refresh-2', expires_in: 120, scope: 'daily heartrate', token_type: 'bearer' },
        refreshAccess: 'oura-refreshed',
        refreshRefresh: 'oura-refresh-2',
        refreshTokenType: 'bearer',
        freshResponse: { access_token: 'oura-fresh', refresh_token: 'oura-refresh-3', expires_in: 120, scope: 'fresh-scope', token_type: 'bearer' },
        freshAccess: 'oura-fresh',
        freshRefresh: 'oura-refresh-3',
        freshScope: 'fresh-scope',
        httpErrorResponse: { error: 'oura refresh denied' },
        httpErrorText: 'oura refresh denied',
      },
      {
        id: 'withings',
        url: moduleUrl('/js/wearables-withings-auth.js'),
        stateKey: 'withings-oauth-pending',
        authorizeHost: 'account.withings.com',
        scopeValue: 'scope:one,scope:two',
        completeName: 'completeOAuthCallback',
        callbackName: 'isWithingsCallback',
        exchangeKey: 'withings_token_exchange',
        refreshKey: 'withings_token_refresh',
        exchangeResponse: { status: 0, body: { access_token: 'withings-access', refresh_token: 'withings-refresh', expires_in: 120, scope: 'user.info', token_type: 'Bearer', userid: 'withings-user' } },
        exchangeAccess: 'withings-access',
        exchangeRefresh: 'withings-refresh',
        exchangeTokenType: 'Bearer',
        exchangeUserId: 'withings-user',
        refreshResponse: { status: 0, body: { access_token: 'withings-refreshed', refresh_token: 'withings-refresh-2', expires_in: 120, scope: 'user.metrics', token_type: 'Bearer', userid: 'withings-user-2' } },
        refreshAccess: 'withings-refreshed',
        refreshRefresh: 'withings-refresh-2',
        refreshTokenType: 'Bearer',
        refreshUserId: 'withings-user-2',
        freshResponse: { status: 0, body: { access_token: 'withings-fresh', refresh_token: 'withings-refresh-3', expires_in: 120, scope: 'fresh-scope', token_type: 'Bearer', userid: 'withings-user-3' } },
        freshAccess: 'withings-fresh',
        freshRefresh: 'withings-refresh-3',
        freshScope: 'fresh-scope',
        freshUserId: 'withings-user-3',
        httpErrorResponse: { error: 'withings refresh denied' },
        httpErrorText: 'withings refresh denied',
        withingsStatusError: { status: 284, error: 'token not found' },
      },
      {
        id: 'ultrahuman',
        url: moduleUrl('/js/wearables-ultrahuman-auth.js'),
        stateKey: 'ultrahuman-oauth-pending',
        authorizeHost: 'auth.ultrahuman.com',
        scopeValue: 'scope:one scope:two',
        completeName: 'completeOAuthCallback',
        callbackName: 'isUltrahumanCallback',
        exchangeKey: 'ultrahuman_token_exchange',
        refreshKey: 'ultrahuman_token_refresh',
        exchangeResponse: { access_token: 'ultrahuman-access', refresh_token: 'ultrahuman-refresh', expires_in: 120, scope: 'profile', token_type: 'Bearer' },
        exchangeAccess: 'ultrahuman-access',
        exchangeRefresh: 'ultrahuman-refresh',
        exchangeTokenType: 'Bearer',
        refreshResponse: { access_token: 'ultrahuman-refreshed', refresh_token: 'ultrahuman-refresh-2', expires_in: 120, scope: 'ring_data', token_type: 'Bearer' },
        refreshAccess: 'ultrahuman-refreshed',
        refreshRefresh: 'ultrahuman-refresh-2',
        refreshTokenType: 'Bearer',
        freshResponse: { access_token: 'ultrahuman-fresh', refresh_token: 'ultrahuman-refresh-3', expires_in: 120, scope: 'fresh-scope', token_type: 'Bearer' },
        freshAccess: 'ultrahuman-fresh',
        freshRefresh: 'ultrahuman-refresh-3',
        freshScope: 'fresh-scope',
        httpErrorResponse: { error_description: 'ultrahuman refresh denied' },
        httpErrorText: 'ultrahuman refresh denied',
      },
      {
        id: 'whoop',
        url: moduleUrl('/js/wearables-whoop-auth.js'),
        stateKey: 'whoop-oauth-pending',
        authorizeHost: 'api.prod.whoop.com',
        scopeValue: 'scope:one scope:two',
        completeName: 'completeOAuthCallback',
        callbackName: 'isWhoopCallback',
        exchangeKey: 'whoop_token_exchange',
        refreshKey: 'whoop_token_refresh',
        exchangeResponse: { access_token: 'whoop-access', refresh_token: 'whoop-refresh', expires_in: 120, scope: 'read:recovery', token_type: 'bearer' },
        exchangeAccess: 'whoop-access',
        exchangeRefresh: 'whoop-refresh',
        exchangeTokenType: 'bearer',
        refreshResponse: { access_token: 'whoop-refreshed', refresh_token: 'whoop-refresh-2', expires_in: 120, scope: 'read:sleep', token_type: 'bearer' },
        refreshAccess: 'whoop-refreshed',
        refreshRefresh: 'whoop-refresh-2',
        refreshTokenType: 'bearer',
        freshResponse: { access_token: 'whoop-fresh', refresh_token: 'whoop-refresh-3', expires_in: 120, scope: 'fresh-scope', token_type: 'bearer' },
        freshAccess: 'whoop-fresh',
        freshRefresh: 'whoop-refresh-3',
        freshScope: 'fresh-scope',
        httpErrorResponse: { error_description: 'whoop refresh denied' },
        httpErrorText: 'whoop refresh denied',
      },
      {
        id: 'polar',
        url: moduleUrl('/js/wearables-polar-auth.js'),
        stateKey: 'polar-oauth-pending',
        authorizeHost: 'flow.polar.com',
        scopeValue: 'scope:one scope:two',
        completeName: 'completeOAuthCallback',
        callbackName: 'isPolarCallback',
        exchangeKey: 'polar_token_exchange',
        refreshKey: 'polar_token_refresh',
        exchangeResponse: { access_token: 'polar-access', refresh_token: 'polar-refresh', expires_in: 120, scope: 'accesslink.read_all', token_type: 'Bearer', x_user_id: 42 },
        exchangeAccess: 'polar-access',
        exchangeRefresh: 'polar-refresh',
        exchangeTokenType: 'Bearer',
        exchangeUserId: '42',
        refreshResponse: { access_token: 'polar-refreshed', refresh_token: 'polar-refresh-2', expires_in: 120, scope: 'accesslink.read_all', token_type: 'Bearer', x_user_id: 43 },
        refreshAccess: 'polar-refreshed',
        refreshRefresh: 'polar-refresh-2',
        refreshTokenType: 'Bearer',
        refreshUserId: '43',
        freshResponse: { access_token: 'polar-fresh', refresh_token: '', expires_in: 120, scope: 'fresh-scope', token_type: 'Bearer', x_user_id: 44 },
        freshAccess: 'polar-fresh',
        freshRefresh: 'refresh-old',
        freshScope: 'fresh-scope',
        freshUserId: '44',
        httpErrorResponse: { error: 'polar refresh denied' },
        httpErrorText: 'polar refresh denied',
      },
    ],
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('PKCE wearable OAuth modules cover callback refresh and challenge paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ cases }) => {
    const outcomes = {};
    const originalFetch = window.fetch;
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const makeResponse = ({ body = {}, status = 200 } = {}) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const exerciseBeginOAuth = async (spec) => {
      const frame = document.createElement('iframe');
      let timeoutId = null;
      const loaded = new Promise((resolve, reject) => {
        frame.onload = () => {
          if (timeoutId != null) clearTimeout(timeoutId);
          resolve();
        };
        timeoutId = setTimeout(() => reject(new Error(`Timed out loading auth iframe for ${spec.id}`)), 5000);
      });
      frame.src = `/app?wearables-auth-frame=${encodeURIComponent(spec.id)}-${Date.now()}`;
      document.body.appendChild(frame);
      try {
        await loaded;
        const win = frame.contentWindow;
        win.sessionStorage.removeItem(spec.stateKey);
        sessionStorage.removeItem(spec.stateKey);
        const frameMod = await win.eval(`import(${JSON.stringify(`${spec.url}&beginFrame=1`)})`);
        const maybePromise = frameMod.beginOAuth({
          clientId: 'client-id',
          registeredUris: [`${location.origin}/app`],
          scopes: ['scope:one'],
          profileId: 'wearables-auth-profile',
        });
        if (maybePromise?.catch) maybePromise.catch(() => {});
        const raw = sessionStorage.getItem(spec.stateKey) || win.sessionStorage.getItem(spec.stateKey);
        return JSON.parse(raw || '{}');
      } finally {
        if (timeoutId != null) clearTimeout(timeoutId);
        frame.remove();
      }
    };

    try {
      for (const spec of cases) {
        try {
          const mod = await import(spec.url);
          const requests = [];
          const fetchQueue = [];
          window.fetch = async (url, options = {}) => {
            const parsedBody = JSON.parse(String(options.body || '{}'));
            requests.push({
              url: String(url),
              method: options.method,
              body: parsedBody,
            });
            const next = fetchQueue.shift();
            if (!next) throw new Error(`Unexpected fetch for ${spec.id}`);
            return makeResponse(next);
          };
          const enqueue = (body, status = 200) => fetchQueue.push({ body, status });

          const exact = mod.pickRedirectUri([
            `${location.origin}/app`,
            'https://example.invalid/callback',
          ], { origin: location.origin, pathname: '/app' });
          const byOrigin = mod.pickRedirectUri([
            `${location.origin}/registered-callback`,
          ], { origin: location.origin, pathname: '/app' });
          let noMatchThrows = false;
          try {
            mod.pickRedirectUri(['https://example.invalid/callback'], { origin: location.origin, pathname: '/app' });
          } catch {
            noMatchThrows = true;
          }
          outcomes[`${spec.id}RedirectPicker`] = exact === `${location.origin}/app`
            && byOrigin === `${location.origin}/registered-callback`
            && noMatchThrows;

          const derived = await mod.deriveCodeChallenge(verifier);
          const authUrl = await mod.buildAuthorizeUrl({
            clientId: 'client-id',
            redirectUri: `${location.origin}/app`,
            scopes: ['scope:one', 'scope:two'],
            state: 'state-ok',
            codeVerifier: verifier,
          });
          const parsedAuthUrl = new URL(authUrl);
          outcomes[`${spec.id}AuthorizeUrl`] = derived === challenge
            && parsedAuthUrl.hostname === spec.authorizeHost
            && parsedAuthUrl.searchParams.get('client_id') === 'client-id'
            && parsedAuthUrl.searchParams.get('redirect_uri') === `${location.origin}/app`
            && parsedAuthUrl.searchParams.get('response_type') === 'code'
            && parsedAuthUrl.searchParams.get('scope') === 'scope:one scope:two'
            && parsedAuthUrl.searchParams.get('state') === 'state-ok'
            && parsedAuthUrl.searchParams.get('code_challenge') === challenge
            && parsedAuthUrl.searchParams.get('code_challenge_method') === 'S256';

          const beginState = await exerciseBeginOAuth(spec);
          outcomes[`${spec.id}BeginOAuthStoresPending`] = beginState.clientId === 'client-id'
            && beginState.redirectUri === `${location.origin}/app`
            && beginState.profileId === 'wearables-auth-profile'
            && typeof beginState.startedAt === 'number'
            && typeof beginState.state === 'string'
            && beginState.state.length >= 20
            && typeof beginState.codeVerifier === 'string'
            && beginState.codeVerifier.length >= 40;
          sessionStorage.removeItem(spec.stateKey);

          sessionStorage.setItem(spec.stateKey, JSON.stringify({
            state: 'state-ok',
            redirectUri: `${location.origin}/app`,
            startedAt: Date.now(),
            clientId: 'client-id',
            codeVerifier: verifier,
            profileId: 'wearables-auth-profile',
          }));
          enqueue(spec.exchangeResponse);
          const callback = await mod[spec.completeName](new URLSearchParams('code=code-123&state=state-ok'));
          const exchangeBody = new URLSearchParams(requests.at(-1)?.body?.body || '');
          outcomes[`${spec.id}CallbackSuccess`] = callback.ok === true
            && callback.tokens.accessToken === spec.exchangeAccess
            && callback.tokens.refreshToken === spec.exchangeRefresh
            && callback.tokens.tokenType === spec.exchangeTokenType
            && callback.redirectUri === `${location.origin}/app`
            && callback.profileId === 'wearables-auth-profile'
            && requests.at(-1)?.body?.url === spec.tokenUrl
            && exchangeBody.get('grant_type') === 'authorization_code'
            && exchangeBody.get('code') === 'code-123'
            && exchangeBody.get('client_id') === 'client-id'
            && exchangeBody.get('code_verifier') === verifier
            && (!spec.exchangeUserId || callback.tokens.userId === spec.exchangeUserId);

          const errorCallback = await mod[spec.completeName](new URLSearchParams('error=access_denied&error_description=nope'));
          const missingStateCallback = await mod[spec.completeName](new URLSearchParams('code=only-code'));
          const missingCodeCallback = await mod[spec.completeName](new URLSearchParams('state=only-state'));
          outcomes[`${spec.id}CallbackEarlyErrors`] = errorCallback.ok === false
            && errorCallback.error.includes('access_denied')
            && missingStateCallback.ok === false
            && missingStateCallback.error === 'Missing code or state in callback'
            && missingCodeCallback.ok === false
            && missingCodeCallback.error === 'Missing code or state in callback';

          sessionStorage.setItem(spec.stateKey, JSON.stringify({
            state: 'expected-state',
            redirectUri: `${location.origin}/app`,
            startedAt: Date.now(),
            clientId: 'client-id',
            codeVerifier: verifier,
          }));
          const mismatch = await mod[spec.completeName](new URLSearchParams('code=code-123&state=wrong-state'));
          outcomes[`${spec.id}CallbackConsumesMismatch`] = mismatch.ok === false
            && mismatch.error.includes('State mismatch')
            && sessionStorage.getItem(spec.stateKey) === null;

          sessionStorage.setItem(spec.stateKey, JSON.stringify({
            state: 'state-ok',
            redirectUri: `${location.origin}/app`,
            startedAt: Date.now() - (11 * 60 * 1000),
            clientId: 'client-id',
            codeVerifier: verifier,
          }));
          const stale = await mod[spec.completeName](new URLSearchParams('code=code-123&state=state-ok'));
          outcomes[`${spec.id}CallbackRejectsStale`] = stale.ok === false
            && stale.error.includes('expired');

          sessionStorage.setItem(spec.stateKey, '{bad json');
          const corrupt = await mod[spec.completeName](new URLSearchParams('code=code-123&state=state-ok'));
          outcomes[`${spec.id}CallbackRejectsCorrupt`] = corrupt.ok === false
            && corrupt.error.includes('Corrupt pending state');

          sessionStorage.setItem(spec.stateKey, JSON.stringify({ state: 'callback-state' }));
          outcomes[`${spec.id}CallbackDetector`] = mod[spec.callbackName](new URLSearchParams('state=callback-state')) === true
            && mod[spec.callbackName](new URLSearchParams('state=other-state')) === false;
          sessionStorage.setItem(spec.stateKey, '{bad json');
          outcomes[`${spec.id}CallbackDetectorRejectsCorrupt`] = mod[spec.callbackName](new URLSearchParams('state=callback-state')) === false;
          sessionStorage.removeItem(spec.stateKey);

          enqueue(spec.refreshResponse);
          const refreshed = await mod.refreshTokens({ clientId: 'client-id', refreshToken: 'refresh-old' });
          const refreshBody = new URLSearchParams(requests.at(-1)?.body?.body || '');
          outcomes[`${spec.id}RefreshSuccess`] = refreshed.accessToken === spec.refreshAccess
            && refreshed.refreshToken === spec.refreshRefresh
            && refreshed.tokenType === spec.refreshTokenType
            && requests.at(-1)?.body?.url === spec.tokenUrl
            && refreshBody.get('grant_type') === 'refresh_token'
            && refreshBody.get('refresh_token') === 'refresh-old'
            && refreshBody.get('client_id') === 'client-id'
            && (!spec.refreshScope || refreshBody.get('scope') === spec.refreshScope)
            && (!spec.refreshUserId || refreshed.userId === spec.refreshUserId);

          enqueue(spec.httpErrorResponse, 401);
          let refreshHttpError = null;
          try {
            await mod.refreshTokens({ clientId: 'client-id', refreshToken: 'bad-refresh' });
          } catch (error) {
            refreshHttpError = error;
          }
          outcomes[`${spec.id}RefreshHttpError`] = refreshHttpError?.status === 401
            && refreshHttpError.message.includes(spec.httpErrorText);

          const validConnection = {
            accessToken: 'still-valid',
            refreshToken: 'refresh-valid',
            expiresAt: Date.now() + (60 * 60 * 1000),
            scope: 'old-scope',
            userId: spec.refreshUserId ? 'user-old' : undefined,
          };
          const noWrite = [];
          const validResult = await mod.withFreshToken(validConnection, 'client-id', async updated => noWrite.push(updated));
          outcomes[`${spec.id}WithFreshTokenSkipsValid`] = validResult === validConnection
            && noWrite.length === 0;

          const latestConnection = {
            accessToken: 'latest-access',
            refreshToken: 'latest-refresh',
            expiresAt: Date.now() + (60 * 60 * 1000),
            scope: 'latest-scope',
            userId: spec.refreshUserId ? 'latest-user' : undefined,
          };
          const latestWrites = [];
          const latestResult = await mod.withFreshToken({
            accessToken: 'expired',
            refreshToken: 'refresh-old',
            expiresAt: Date.now() - 1,
          }, 'client-id', async updated => latestWrites.push(updated), () => latestConnection);
          outcomes[`${spec.id}WithFreshTokenUsesLatest`] = latestResult === latestConnection
            && latestWrites.length === 0;

          enqueue(spec.freshResponse);
          const writes = [];
          const updated = await mod.withFreshToken({
            accessToken: 'expired',
            refreshToken: 'refresh-old',
            expiresAt: Date.now() - 1,
            scope: 'old-scope',
            userId: spec.refreshUserId ? 'old-user' : undefined,
          }, 'client-id', async next => writes.push(next), () => null);
          outcomes[`${spec.id}WithFreshTokenRefreshesAndWrites`] = updated.accessToken === spec.freshAccess
            && updated.refreshToken === spec.freshRefresh
            && updated.scope === spec.freshScope
            && writes.length === 1
            && writes[0].accessToken === spec.freshAccess
            && (!spec.freshUserId || updated.userId === spec.freshUserId);

          const missingRefreshWrites = [];
          let missingRefreshError = null;
          try {
            await mod.withFreshToken({
              accessToken: 'expired',
              expiresAt: Date.now() - 1,
            }, 'client-id', async next => missingRefreshWrites.push(next), () => null);
          } catch (error) {
            missingRefreshError = error;
          }
          outcomes[`${spec.id}WithFreshTokenMissingRefresh`] = missingRefreshError?.code === 'needs-reauth'
            && missingRefreshWrites.length === 0;
          outcomes[`${spec.id}ProviderCompleted`] = true;
        } catch (error) {
          outcomes[`${spec.id}ProviderError: ${error?.message || error}`] = false;
        } finally {
          sessionStorage.removeItem(spec.stateKey);
        }
      }
    } finally {
      window.fetch = originalFetch;
      for (const spec of cases) sessionStorage.removeItem(spec.stateKey);
    }

    return outcomes;
  }, {
    cases: [
      {
        id: 'fitbit',
        url: moduleUrl('/js/wearables-fitbit-auth.js'),
        stateKey: 'fitbit-oauth-pending',
        authorizeHost: 'www.fitbit.com',
        tokenUrl: 'https://api.fitbit.com/oauth2/token',
        completeName: 'completeOAuthCallback',
        callbackName: 'isFitbitCallback',
        exchangeResponse: { access_token: 'fitbit-access', refresh_token: 'fitbit-refresh', expires_in: 120, scope: 'activity', token_type: 'Bearer', user_id: 'fitbit-user' },
        exchangeAccess: 'fitbit-access',
        exchangeRefresh: 'fitbit-refresh',
        exchangeTokenType: 'Bearer',
        exchangeUserId: 'fitbit-user',
        refreshResponse: { access_token: 'fitbit-refreshed', refresh_token: 'fitbit-refresh-2', expires_in: 120, scope: 'sleep', token_type: 'Bearer', user_id: 'fitbit-user-2' },
        refreshAccess: 'fitbit-refreshed',
        refreshRefresh: 'fitbit-refresh-2',
        refreshTokenType: 'Bearer',
        refreshUserId: 'fitbit-user-2',
        freshResponse: { access_token: 'fitbit-fresh', refresh_token: 'fitbit-refresh-3', expires_in: 120, scope: 'fresh-scope', token_type: 'Bearer', user_id: 'fitbit-user-3' },
        freshAccess: 'fitbit-fresh',
        freshRefresh: 'fitbit-refresh-3',
        freshScope: 'fresh-scope',
        freshUserId: 'fitbit-user-3',
        httpErrorResponse: { errors: [{ message: 'fitbit refresh denied' }] },
        httpErrorText: 'fitbit refresh denied',
      },
    ],
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
