/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Per-user addressing: behind a Pryv core, a request addressed to an account
 * carries `X-Adapter-Base`; the adapter is mounted under its route root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createFeedServer, configFromEnv, type ServerConfig } from '../src/server.ts';
import { buildManifest } from '../src/manifest.ts';
import { encodePlaintext } from '../src/feed/envelope.ts';
import type { PryvClientFactory } from '../src/pryv/types.ts';

const BASE = 'https://alice.example.com/adapter/calendar/';
const PLATFORM = 'https://core-a.example.com/adapter/calendar/';

const client: PryvClientFactory = () => ({
  async getMapping () { return { target: { summary: '{content}' } }; },
  async getEvents () {
    return [{ id: 'e1', streamIds: ['body'], type: 'mass/kg', time: 1_750_000_000, content: 82.4, modified: 1_750_000_000 }];
  },
  async createMapping () { return { id: 'created-1' }; },
  async ensureStream () { /* noop */ },
  async createEvent () { return { id: 'e-1' }; }
});

function listen (server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}
function close (server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function withServer (config: ServerConfig, fn: (port: number) => Promise<void>): Promise<void> {
  const server = createFeedServer(config, client);
  const port = await listen(server);
  try {
    await fn(port);
  } finally {
    await close(server);
  }
}

async function createMapping (port: number, path: string, headers: Record<string, string> = {}): Promise<{ status: number; url?: string }> {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ apiEndpoint: 'https://token@user.example.com/', mapping: { source: { streams: ['body'] } } })
  });
  if (res.status !== 200) return { status: res.status };
  const data = await res.json() as { url: string };
  return { status: res.status, url: data.url };
}

test('[CALB1] emitted URLs use X-Adapter-Base, ahead of the configured base', async () => {
  await withServer({ prefix: 'cal', baseUrl: PLATFORM }, async (port) => {
    const res = await createMapping(port, '/adapter/calendar/ui/mappings', { 'x-adapter-name': 'alice', 'x-adapter-base': BASE });
    assert.equal(res.status, 200);
    assert.match(res.url ?? '', /^https:\/\/alice\.example\.com\/adapter\/calendar\/cal\/p.+\.ics$/);
  });
});

test('[CALB3] no header: the configured platform base, never a label from Host', async () => {
  await withServer({ prefix: 'cal', baseUrl: PLATFORM }, async (port) => {
    const res = await createMapping(port, '/adapter/calendar/ui/mappings', { 'x-forwarded-host': 'alice.example.com' });
    assert.equal(res.status, 200);
    assert.match(res.url ?? '', /^https:\/\/core-a\.example\.com\/adapter\/calendar\/cal\/p.+\.ics$/);
  });
});

test('[CALB4] a malformed X-Adapter-Base is ignored', async () => {
  await withServer({ prefix: 'cal', baseUrl: PLATFORM }, async (port) => {
    for (const bad of ['https://alice.example.com/adapter/calendar', 'javascript:x/', 'https://alice.example.com/a/?q=1/']) {
      const res = await createMapping(port, '/adapter/calendar/ui/mappings', { 'x-adapter-base': bad });
      assert.equal(res.status, 200, bad);
      assert.ok((res.url ?? '').startsWith(PLATFORM + 'cal/'), bad);
    }
  });
});

test('[CALB5] routes are served under the mount path of X-Adapter-Base', async () => {
  await withServer({ prefix: 'cal' }, async (port) => {
    const headers = { 'x-adapter-name': 'alice', 'x-adapter-base': BASE };
    const manifest = await fetch(`http://localhost:${port}/adapter/calendar/manifest.json`, { headers });
    assert.equal(manifest.status, 200);
    assert.equal((await manifest.json() as { name: string }).name, 'calendar');
    const env = encodePlaintext({ apiEndpoint: 'https://token@user.example.com/', mappingId: 'm1' });
    const feed = await fetch(`http://localhost:${port}/adapter/calendar/cal/${env}.ics`, { headers });
    assert.equal(feed.status, 200);
    assert.match(await feed.text(), /BEGIN:VCALENDAR/);
    const ui = await fetch(`http://localhost:${port}/adapter/calendar/`, { headers });
    assert.equal(ui.status, 200);
    assert.match(ui.headers.get('content-type') ?? '', /text\/html/);
  });
});

test('[CALB6] routes are served under the mount path of the configured base, and at the root', async () => {
  await withServer({ prefix: 'cal', baseUrl: PLATFORM }, async (port) => {
    assert.equal((await fetch(`http://localhost:${port}/adapter/calendar/manifest.json`)).status, 200);
    assert.equal((await fetch(`http://localhost:${port}/manifest.json`)).status, 200);
    assert.equal((await fetch(`http://localhost:${port}/adapter/other/manifest.json`)).status, 404);
  });
});

test('[CALB2] the manifest carries baseTemplate when PUBLIC_BASE_TEMPLATE is set', async () => {
  assert.equal(buildManifest().baseTemplate, undefined);
  assert.equal(buildManifest({ baseTemplate: 'https://{username}.example.com/adapter/calendar/' }).baseTemplate,
    'https://{username}.example.com/adapter/calendar/');

  const saved = process.env.PUBLIC_BASE_TEMPLATE;
  try {
    delete process.env.PUBLIC_BASE_TEMPLATE;
    assert.equal(configFromEnv().baseTemplate, undefined);
    process.env.PUBLIC_BASE_TEMPLATE = 'https://{username}.example.com/adapter/calendar/';
    const config = configFromEnv();
    assert.equal(config.baseTemplate, 'https://{username}.example.com/adapter/calendar/');
    await withServer(config, async (port) => {
      const manifest = await (await fetch(`http://localhost:${port}/manifest.json`)).json() as { baseTemplate?: string };
      assert.equal(manifest.baseTemplate, 'https://{username}.example.com/adapter/calendar/');
    });
    process.env.PUBLIC_BASE_TEMPLATE = 'https://alice.example.com/adapter/calendar/';
    assert.throws(() => configFromEnv(), /PUBLIC_BASE_TEMPLATE/);
  } finally {
    if (saved == null) delete process.env.PUBLIC_BASE_TEMPLATE;
    else process.env.PUBLIC_BASE_TEMPLATE = saved;
  }
});
