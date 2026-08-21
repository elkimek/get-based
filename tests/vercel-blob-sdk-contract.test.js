import {
  BlobPreconditionFailedError,
  BlobRequestAbortedError,
  del,
  list,
  put,
} from '@vercel/blob';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

const requireFromBlob = createRequire(import.meta.resolve('@vercel/blob'));
const {
  MockAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
} = requireFromBlob('undici');

const API_ORIGIN = 'https://vercel.com';
const TOKEN = 'vercel_blob_rw_store123_secret';
const originalDispatcher = getGlobalDispatcher();
let agent;
let api;

function requestHeaders(options) {
  return new Headers(options.headers);
}

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  api = agent.get(API_ORIGIN);
});

afterEach(async () => {
  expect(agent.pendingInterceptors()).toEqual([]);
  await agent.close();
});

afterAll(() => {
  setGlobalDispatcher(originalDispatcher);
});

describe('@vercel/blob server SDK contract', () => {
  it('uses the explicit token and maps list timestamps to Date objects', async () => {
    let request;
    api.intercept({
      method: 'GET',
      path: '/api/blob?limit=2&prefix=proxy-rate%2Fv2%2F',
    }).reply(options => {
      request = options;
      return {
        statusCode: 200,
        data: JSON.stringify({
          blobs: [{
            url: 'https://store123.private.blob.vercel-storage.com/proxy-rate/v2/marker.json',
            downloadUrl: 'https://store123.private.blob.vercel-storage.com/proxy-rate/v2/marker.json?download=1',
            pathname: 'proxy-rate/v2/marker.json',
            size: 2,
            uploadedAt: '2026-08-21T00:00:00.000Z',
            etag: 'etag-1',
          }],
          cursor: null,
          hasMore: false,
        }),
      };
    });

    const page = await list({
      limit: 2,
      prefix: 'proxy-rate/v2/',
      token: TOKEN,
    });

    const headers = requestHeaders(request);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('x-vercel-blob-store-id')).toBe('store123');
    expect(headers.get('x-api-version')).toBe('12');
    expect(page.blobs[0].uploadedAt).toEqual(new Date('2026-08-21T00:00:00.000Z'));
  });

  it('preserves the private atomic-put and delete request shapes', async () => {
    let putRequest;
    let deleteRequest;
    api.intercept({
      method: 'PUT',
      path: '/api/blob/?pathname=proxy-rate%2Fv2%2Fmarker.json',
      body: '{}',
    }).reply(options => {
      putRequest = options;
      return {
        statusCode: 200,
        data: JSON.stringify({
          url: 'https://store123.private.blob.vercel-storage.com/proxy-rate/v2/marker.json',
          downloadUrl: 'https://store123.private.blob.vercel-storage.com/proxy-rate/v2/marker.json?download=1',
          pathname: 'proxy-rate/v2/marker.json',
          contentType: 'application/json',
          contentDisposition: 'inline',
          etag: 'etag-2',
        }),
      };
    });
    api.intercept({
      method: 'POST',
      path: '/api/blob/delete',
      body: JSON.stringify({ urls: ['proxy-rate/v2/marker.json'] }),
    }).reply(options => {
      deleteRequest = options;
      return { statusCode: 200, data: '{}' };
    });

    await put('proxy-rate/v2/marker.json', '{}', {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
      contentType: 'application/json',
      token: TOKEN,
    });
    await del('proxy-rate/v2/marker.json', { token: TOKEN });

    const putHeaders = requestHeaders(putRequest);
    expect(putHeaders.get('x-vercel-blob-access')).toBe('private');
    expect(putHeaders.get('x-add-random-suffix')).toBe('0');
    expect(putHeaders.get('x-allow-overwrite')).toBe('0');
    expect(putHeaders.get('x-cache-control-max-age')).toBe('60');
    expect(putHeaders.get('x-content-type')).toBe('application/json');
    expect(requestHeaders(deleteRequest).get('content-type')).toBe('application/json');
  });

  it('keeps 412 responses as typed precondition failures', async () => {
    api.intercept({
      method: 'PUT',
      path: '/api/blob/?pathname=proxy-rate%2Fv2%2Foccupied.json',
      body: '{}',
    }).reply(412, {
      error: { code: 'precondition_failed', message: 'already exists' },
    });

    await expect(put('proxy-rate/v2/occupied.json', '{}', {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      token: TOKEN,
    })).rejects.toBeInstanceOf(BlobPreconditionFailedError);
  });

  it('keeps aborted requests as typed abort failures', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(list({
      prefix: 'proxy-rate/v2/',
      token: TOKEN,
      abortSignal: controller.signal,
    })).rejects.toBeInstanceOf(BlobRequestAbortedError);
  });
});
