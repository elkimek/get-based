import type { BrowserContext } from '@playwright/test';
// Controlled weather transport only; native shaping, spectrum and dose owners remain real.
export async function installSunWeatherFixture(context: Pick<BrowserContext, 'route'>, now = Date.now()) {
  const start = Math.floor(now / 3600000) * 3600000 - 72 * 3600000;
  const time = Array.from({ length: 120 }, (_, index) => new Date(start + index * 3600000).toISOString().slice(0, 16));
  const series = (value: number) => time.map(() => value); let calls = 0;
  await context.route(/https:\/\/(?:api|historical-forecast-api)\.open-meteo\.com\/v1\/forecast/, async route => {
    calls++; await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ latitude: 12.3, longitude: 45.1, timezone: 'UTC', utc_offset_seconds: 0,
      hourly: { time, uv_index: series(3), uv_index_clear_sky: series(3), cloud_cover: series(20), ozone: series(300), temperature_2m: series(20) } }) });
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
