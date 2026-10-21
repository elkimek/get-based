import {createServer, type Server} from 'node:http';
import type {AddressInfo, LookupFunction} from 'node:net';
import {Agent} from 'undici';
import {afterEach, expect, it, vi} from 'vitest';
import {fetchWithPinnedProxyDns, type PinnedProxyLookup} from '../lib/proxy-network.js';

const servers: Server[] = [], agents: Agent[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map(agent => agent.destroy()));
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  })));
});

async function transport() {
  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url!);
    if (request.url === '/redirect') {
      response.writeHead(302, {location: 'http://127.0.0.1/private'});
      response.end('redirect blocked by caller policy');
    } else {
      response.writeHead(200, {'content-type': 'text/plain'});
      response.write('first');
      if (request.url !== '/stream') setImmediate(() => response.end(' second'));
    }
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://pinned.synthetic.test:${(server.address() as AddressInfo).port}`;
  const lookup = vi.fn(async () => [{address: '93.184.216.34', family: 4}]);
  const socketLookups = vi.fn();
  let agent: Agent;
  const close = vi.fn(async () => {await agent.close();});
  const destroy = vi.fn(async (error: Error) => {await agent.destroy(error);});
  const createDispatcher = (pinned: PinnedProxyLookup) => {
    // The real production lookup must supply the validated public address.
    // Only this test bridge maps that address to our isolated loopback server;
    // Undici still owns the actual socket, streaming and cancellation lifecycle.
    const bridge: LookupFunction = (hostname, options, callback) => {
      pinned(hostname, options, (error, address, family) => {
        expect(error).toBeNull();
        expect(address).toEqual(options.all ? [{address: '93.184.216.34', family: 4}] : '93.184.216.34');
        socketLookups(hostname);
        if (options.all) callback(null, [{address: '127.0.0.1', family: 4}]);
        else callback(null, '127.0.0.1', family);
      });
    };
    agent = new Agent({connect: {lookup: bridge}});
    agents.push(agent);
    return {dispatch: agent.dispatch.bind(agent), close, destroy};
  };
  return {url, paths, lookup, socketLookups, createDispatcher, close, destroy};
}

it('uses the installed Undici transport with pinned DNS and closes only after the complete body', async () => {
  const test = await transport();
  const response = await fetchWithPinnedProxyDns(test.url + '/', {}, test);
  expect(test.close).not.toHaveBeenCalled();
  expect(await response.text()).toBe('first second');
  expect(test.close).toHaveBeenCalledOnce();
  expect(test.destroy).not.toHaveBeenCalled();
  expect(test.lookup).toHaveBeenCalledExactlyOnceWith('pinned.synthetic.test', {all: true, verbatim: true});
  expect(test.socketLookups).toHaveBeenCalledWith('pinned.synthetic.test');
  expect(test.paths).toEqual(['/']);
});

it('keeps manual redirects visible without following a private destination', async () => {
  const test = await transport();
  const response = await fetchWithPinnedProxyDns(test.url + '/redirect', {redirect: 'manual'}, test);
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('http://127.0.0.1/private');
  expect(await response.text()).toBe('redirect blocked by caller policy');
  expect(test.paths).toEqual(['/redirect']);
  expect(test.close).toHaveBeenCalledOnce();
});

it('destroys the installed dispatcher when an in-flight response is aborted', async () => {
  const test = await transport(), controller = new AbortController();
  const response = await fetchWithPinnedProxyDns(test.url + '/stream', {signal: controller.signal}, test);
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('first');
  controller.abort(new Error('synthetic cancellation'));
  await expect(reader.read()).rejects.toThrow('synthetic cancellation');
  await vi.waitFor(() => expect(test.destroy).toHaveBeenCalledOnce());
  expect(test.close).not.toHaveBeenCalled();
  expect(test.paths).toEqual(['/stream']);
});
