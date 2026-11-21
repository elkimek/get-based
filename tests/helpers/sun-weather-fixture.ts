import type { BrowserContext } from '@playwright/test';

function forecastFixture(now: number) {
  const start = Math.floor(now / 3600000) * 3600000 - 72 * 3600000;
  const time = Array.from({ length: 120 }, (_, index) => new Date(start + index * 3600000).toISOString().slice(0, 16));
  const series = (value: number) => time.map(() => value);
  return { latitude: 12.3, longitude: 45.1, timezone: 'UTC', utc_offset_seconds: 0,
    hourly: { time, uv_index: series(3), uv_index_clear_sky: series(3), cloud_cover: series(20), ozone: series(300), temperature_2m: series(20) } };
}

// Controlled weather transport only; native shaping, spectrum and dose owners remain real.
export async function installSunWeatherFixture(context: Pick<BrowserContext, 'route'>, now = Date.now()) {
  const forecast = forecastFixture(now);
  let calls = 0;
  await context.route(/https:\/\/(?:api|historical-forecast-api)\.open-meteo\.com\/v1\/forecast/, async route => {
    calls++;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(forecast) });
  });
  await context.route('**/*', async route => {
    let payload: unknown;
    try { payload = route.request().postDataJSON(); } catch { /* Non-JSON requests are unrelated. */ }
    if (payload && typeof payload === 'object' && 'meteo' in payload && payload.meteo === 'cams') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Controlled CAMS unavailability; use the native fallback."}' });
    } else await route.fallback();
  });
  return () => calls;
}

/** A service-worker-controlled page must receive weather before network routing.
 * The isolated shipping fixture also denies all external connections. */
export async function installOfflineSunWeatherFixture(context: BrowserContext, now = Date.now()) {
  const forecast = forecastFixture(now);
  const binding = 'getbasedSyntheticSunWeather';
  let calls = 0;
  await context.exposeBinding(binding, () => {
    calls++;
    return forecast;
  });
  await context.addInitScript(binding => {
    const fetchNext = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.protocol === 'https:' && ['api.open-meteo.com', 'historical-forecast-api.open-meteo.com'].includes(url.hostname)
          && url.pathname === '/v1/forecast') {
        const request = new Request(input, init);
        request.signal.throwIfAborted();
        const reply = Reflect.get(window, binding) as () => Promise<unknown>;
        const weather = await reply();
        request.signal.throwIfAborted();
        return Response.json(weather);
      }
      if ((init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase() === 'POST') {
        const request = new Request(input, init);
        const payload = await request.clone().json().catch(() => null);
        if (payload?.meteo === 'cams') return Response.json({ error: 'Controlled CAMS unavailability' }, { status: 503 });
      }
      return fetchNext(input, init);
    };
  }, binding);
  return () => calls;
}
