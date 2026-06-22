/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * End-to-end integration over real HTTP, using a stub Pryv server.
 *
 * Unlike the handler/server unit tests (which inject a fake PryvClient), this
 * drives the actual lib-js-backed `createPryvClient` against a node:http stand-in
 * for the Pryv API — exercising the auth header, query-string building and
 * response-shape handling that only a real transport reveals. No external
 * network, no credentials.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createPryvClient } from '../src/pryv/client.ts';
import { handleFeed } from '../src/feed/handler.ts';
import { encodePlaintext } from '../src/feed/envelope.ts';

const TOKEN = 'ctesttoken';
const MAPPING = {
  name: 'My weight',
  source: { streams: ['body'], types: ['mass/kg'] },
  target: { summary: '{content} kg' }
};

interface StubState {
  authSeen: string[];
  createdEvents: Array<Record<string, unknown>>;
  eventsQuery: string | null;
}

function readJson (req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve(raw.length > 0 ? JSON.parse(raw) : {});
    });
  });
}

// Every Pryv response carries meta.serverTime — lib-js throws without it.
function send (res: ServerResponse, status: number, obj: Record<string, unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ meta: { serverTime: 1_750_000_000 }, ...obj }));
}

function makeStub (state: StubState): Server {
  return createServer(async (req, res) => {
    try {
      state.authSeen.push(req.headers.authorization ?? '');
      const url = new URL(req.url ?? '/', 'http://stub');
      const path = url.pathname;

      if (req.method === 'POST' && path === '/streams') {
        await readJson(req);
        return send(res, 201, { stream: { id: 'adapter-calendar-mappings' } });
      }
      if (req.method === 'POST' && path === '/events') {
        const body = await readJson(req);
        state.createdEvents.push(body);
        return send(res, 201, { event: { id: 'mapping-evt-1', streamIds: body.streamIds, type: body.type, content: body.content } });
      }
      if (req.method === 'GET' && path === '/events/mapping-evt-1') {
        return send(res, 200, { event: { id: 'mapping-evt-1', content: JSON.stringify(MAPPING) } });
      }
      if (req.method === 'GET' && path === '/events') {
        state.eventsQuery = decodeURIComponent(url.search);
        return send(res, 200, {
          events: [
            { id: 'e1', streamIds: ['body'], type: 'mass/kg', time: 1_750_000_000, content: 82.4, modified: 1_750_000_000 },
            { id: 'e2', streamIds: ['body'], type: 'mass/kg', time: 1_750_086_400, content: 81.9, modified: 1_750_086_400 }
          ]
        });
      }
      send(res, 404, { error: { id: 'unknown-route' } });
    } catch {
      send(res, 500, { error: { id: 'stub-error' } });
    }
  });
}

function listen (server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}
function close (server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function withStub (fn: (apiEndpoint: string, state: StubState) => Promise<void>): Promise<void> {
  const state: StubState = { authSeen: [], createdEvents: [], eventsQuery: null };
  const server = makeStub(state);
  const port = await listen(server);
  try {
    await fn(`http://${TOKEN}@127.0.0.1:${port}/`, state);
  } finally {
    await close(server);
  }
}

test('createPryvClient.createMapping posts a note/txt JSON event with the token', async () => {
  await withStub(async (apiEndpoint, state) => {
    const client = createPryvClient(apiEndpoint);
    const { id } = await client.createMapping(MAPPING);
    assert.equal(id, 'mapping-evt-1');
    assert.ok(state.authSeen.includes(TOKEN), 'token sent as Authorization');
    const event = state.createdEvents[0];
    assert.equal(event.type, 'note/txt');
    assert.deepEqual(JSON.parse(event.content as string), MAPPING);
    assert.deepEqual(event.streamIds, ['adapter-calendar-mappings']);
  });
});

test('handleFeed resolves a real round-trip into a calendar document', async () => {
  await withStub(async (apiEndpoint, state) => {
    const envelope = encodePlaintext({ apiEndpoint, mappingId: 'mapping-evt-1' });
    const res = await handleFeed(envelope, {}, createPryvClient);
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'text/calendar; charset=utf-8');
    // Both events mapped, name applied, summary template rendered.
    assert.match(res.body, /X-WR-CALNAME:My weight/);
    assert.match(res.body, /SUMMARY:82\.4 kg/);
    assert.match(res.body, /SUMMARY:81\.9 kg/);
    assert.equal((res.body.match(/BEGIN:VEVENT/g) ?? []).length, 2);
    // The mapping's source filter reached the events query.
    assert.ok((state.eventsQuery ?? '').includes('body'), 'streams filter forwarded');
    assert.ok((state.eventsQuery ?? '').includes('mass/kg'), 'types filter forwarded');
  });
});

test('a missing mapping event surfaces as a 502', async () => {
  await withStub(async (apiEndpoint) => {
    const envelope = encodePlaintext({ apiEndpoint, mappingId: 'does-not-exist' });
    const res = await handleFeed(envelope, {}, createPryvClient);
    assert.equal(res.status, 502);
  });
});
