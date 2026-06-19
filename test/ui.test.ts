/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import {
  parseCreateMappingInput,
  handleCreateMapping,
  UiRequestError,
  type UiConfig
} from '../src/ui/handler.ts';
import { decodeEnvelope } from '../src/feed/envelope.ts';
import type { PryvClientFactory } from '../src/pryv/types.ts';

const KEY = randomBytes(32);
const BASE: UiConfig = { baseUrl: 'https://core.example.com', prefix: 'cal' };

let lastCreated: unknown;
const client: PryvClientFactory = () => ({
  async getMapping () { return {}; },
  async getEvents () { return []; },
  async createMapping (mapping: unknown) { lastCreated = mapping; return { id: 'm-99' }; }
});

test('parseCreateMappingInput validates apiEndpoint and mapping', () => {
  assert.throws(() => parseCreateMappingInput({ mapping: {} }), UiRequestError);
  assert.throws(() => parseCreateMappingInput({ apiEndpoint: 'ftp://x', mapping: {} }), UiRequestError);
  assert.throws(() => parseCreateMappingInput({ apiEndpoint: 'https://x/' }), UiRequestError);
  const ok = parseCreateMappingInput({ apiEndpoint: 'https://t@h/', mapping: { name: 'W' }, sealed: true, ttlSeconds: 60 });
  assert.equal(ok.sealed, true);
  assert.equal(ok.ttlSeconds, 60);
});

test('handleCreateMapping stores the mapping and emits a plaintext URL', async () => {
  const input = parseCreateMappingInput({ apiEndpoint: 'https://t@user.pryv.me/', mapping: { name: 'Weight' } });
  const res = await handleCreateMapping(input, BASE, client);
  assert.deepEqual(lastCreated, { name: 'Weight' });
  assert.equal(res.mappingId, 'm-99');
  assert.match(res.url, /^https:\/\/core\.example\.com\/cal\/p.+\.ics$/);
  // Round-trips back to the source target.
  const envelope = res.url.slice('https://core.example.com/cal/'.length, -'.ics'.length);
  const decoded = decodeEnvelope(envelope);
  assert.equal(decoded.apiEndpoint, 'https://t@user.pryv.me/');
  assert.equal(decoded.mappingId, 'm-99');
});

test('handleCreateMapping emits a sealed URL with expiry when requested', async () => {
  const input = parseCreateMappingInput({ apiEndpoint: 'https://t@user.pryv.me/', mapping: {}, sealed: true, ttlSeconds: 3600 });
  const res = await handleCreateMapping(input, { ...BASE, key: KEY, now: 1000 }, client);
  const envelope = res.url.slice('https://core.example.com/cal/'.length, -'.ics'.length);
  assert.equal(envelope[0], 's');
  const decoded = decodeEnvelope(envelope, { key: KEY, now: 1000 });
  assert.equal(decoded.mode, 'sealed');
  if (decoded.mode === 'sealed') assert.equal(decoded.exp, 1000 + 3600);
});

test('handleCreateMapping refuses sealed mode without a key', async () => {
  const input = parseCreateMappingInput({ apiEndpoint: 'https://t@user.pryv.me/', mapping: {}, sealed: true });
  await assert.rejects(() => handleCreateMapping(input, BASE, client), /not enabled/);
});
