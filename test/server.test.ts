/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createFeedServer } from '../src/server.ts';
import { encodePlaintext } from '../src/feed/envelope.ts';
import type { PryvClientFactory } from '../src/pryv/types.ts';

const client: PryvClientFactory = () => ({
  async getMapping () { return { target: { summary: '{content}' } }; },
  async getEvents () {
    return [{ id: 'e1', streamIds: ['body'], type: 'mass/kg', time: 1_750_000_000, content: 82.4, modified: 1_750_000_000 }];
  }
});

function listen (server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}
function close (server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function withServer (fn: (port: number) => Promise<void>): Promise<void> {
  const server = createFeedServer({ prefix: 'cal' }, client);
  const port = await listen(server);
  try {
    await fn(port);
  } finally {
    await close(server);
  }
}

test('serves a feed at /<prefix>/<envelope>.ics', async () => {
  await withServer(async (port) => {
    const env = encodePlaintext({ apiEndpoint: 'https://token@user.pryv.me/', mappingId: 'm1' });
    const res = await fetch(`http://localhost:${port}/cal/${env}.ics`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/calendar; charset=utf-8');
    assert.match(await res.text(), /BEGIN:VCALENDAR[\s\S]*SUMMARY:82\.4/);
  });
});

test('unknown path returns 404', async () => {
  await withServer(async (port) => {
    assert.equal((await fetch(`http://localhost:${port}/other`)).status, 404);
  });
});

test('a path without the .ics suffix returns 404', async () => {
  await withServer(async (port) => {
    const env = encodePlaintext({ apiEndpoint: 'https://token@user.pryv.me/', mappingId: 'm1' });
    assert.equal((await fetch(`http://localhost:${port}/cal/${env}`)).status, 404);
  });
});

test('a non-GET method returns 405', async () => {
  await withServer(async (port) => {
    const env = encodePlaintext({ apiEndpoint: 'https://token@user.pryv.me/', mappingId: 'm1' });
    assert.equal((await fetch(`http://localhost:${port}/cal/${env}.ics`, { method: 'POST' })).status, 405);
  });
});

test('a malformed envelope returns 400', async () => {
  await withServer(async (port) => {
    assert.equal((await fetch(`http://localhost:${port}/cal/xbad.ics`)).status, 400);
  });
});
