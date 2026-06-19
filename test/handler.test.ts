/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { handleFeed } from '../src/feed/handler.ts';
import { encodePlaintext, encodeSealed } from '../src/feed/envelope.ts';
import type { PryvReaderFactory, PryvEvent } from '../src/pryv/types.ts';

const TARGET = { apiEndpoint: 'https://token@user.pryv.me/', mappingId: 'm1' };
const KEY = randomBytes(32);

const EVENTS: PryvEvent[] = [
  { id: 'e1', streamIds: ['body'], type: 'mass/kg', time: 1_750_000_000, content: 82.4, modified: 1_750_000_000 }
];

const goodClient: PryvReaderFactory = () => ({
  async getMapping () {
    return { name: 'My weight', source: { streams: ['body'], types: ['mass/kg'] }, target: { summary: '{content} kg' } };
  },
  async getEvents () {
    return EVENTS;
  }
});

const failingClient: PryvReaderFactory = () => ({
  async getMapping () { throw new Error('boom'); },
  async getEvents () { return []; }
});

test('plaintext envelope yields a calendar document', async () => {
  const res = await handleFeed(encodePlaintext(TARGET), {}, goodClient);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'text/calendar; charset=utf-8');
  assert.match(res.body, /BEGIN:VCALENDAR/);
  assert.match(res.body, /X-WR-CALNAME:My weight/);
  assert.match(res.body, /SUMMARY:82\.4 kg/);
});

test('sealed envelope decodes with the configured key', async () => {
  const env = encodeSealed(TARGET, 0, KEY);
  const res = await handleFeed(env, { key: KEY }, goodClient);
  assert.equal(res.status, 200);
  assert.match(res.body, /BEGIN:VEVENT/);
});

test('malformed envelope returns 400', async () => {
  const res = await handleFeed('xnonsense', {}, goodClient);
  assert.equal(res.status, 400);
});

test('expired sealed envelope returns 410', async () => {
  const env = encodeSealed(TARGET, 1000, KEY);
  const res = await handleFeed(env, { key: KEY, now: 2000 }, goodClient);
  assert.equal(res.status, 410);
});

test('a Pryv read failure returns 502', async () => {
  const res = await handleFeed(encodePlaintext(TARGET), {}, failingClient);
  assert.equal(res.status, 502);
});
