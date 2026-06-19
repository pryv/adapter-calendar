/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import {
  encodePlaintext,
  encodeSealed,
  decodeEnvelope,
  keyFromBase64,
  EnvelopeError,
  type FeedTarget
} from '../src/feed/envelope.ts';

const TARGET: FeedTarget = {
  apiEndpoint: 'https://cktoken1234567890abcdef@username.pryv.me/',
  mappingId: 'm-abc123'
};
const KEY = randomBytes(32);

test('plaintext envelope round-trips', () => {
  const env = encodePlaintext(TARGET);
  assert.equal(env[0], 'p');
  const decoded = decodeEnvelope(env);
  assert.equal(decoded.mode, 'plaintext');
  assert.equal(decoded.apiEndpoint, TARGET.apiEndpoint);
  assert.equal(decoded.mappingId, TARGET.mappingId);
});

test('sealed envelope round-trips with the key', () => {
  const env = encodeSealed(TARGET, 0, KEY);
  assert.equal(env[0], 's');
  const decoded = decodeEnvelope(env, { key: KEY });
  assert.equal(decoded.mode, 'sealed');
  assert.equal(decoded.apiEndpoint, TARGET.apiEndpoint);
  assert.equal(decoded.mappingId, TARGET.mappingId);
});

test('sealed envelope is opaque — token not present in the URL segment', () => {
  const env = encodeSealed(TARGET, 0, KEY);
  assert.ok(!env.includes('cktoken1234567890abcdef'));
});

test('sealed envelope rejects a wrong key', () => {
  const env = encodeSealed(TARGET, 0, KEY);
  assert.throws(() => decodeEnvelope(env, { key: randomBytes(32) }), EnvelopeError);
});

test('sealed envelope rejects tampering', () => {
  const env = encodeSealed(TARGET, 0, KEY);
  // Flip a character in the body (after the mode prefix).
  const flipped = env.slice(0, 5) + (env[5] === 'A' ? 'B' : 'A') + env.slice(6);
  assert.throws(() => decodeEnvelope(flipped, { key: KEY }), EnvelopeError);
});

test('sealed envelope requires a key to decode', () => {
  const env = encodeSealed(TARGET, 0, KEY);
  assert.throws(() => decodeEnvelope(env), /requires a key/);
});

test('sealed envelope enforces expiry', () => {
  const env = encodeSealed(TARGET, 1000, KEY);
  assert.throws(() => decodeEnvelope(env, { key: KEY, now: 1001 }), /expired/);
  const ok = decodeEnvelope(env, { key: KEY, now: 999 });
  assert.equal(ok.mode, 'sealed');
});

test('exp of 0 means no expiry', () => {
  const env = encodeSealed(TARGET, 0, KEY);
  const decoded = decodeEnvelope(env, { key: KEY, now: 9_999_999_999 });
  assert.equal(decoded.mode, 'sealed');
});

test('unknown mode is rejected', () => {
  assert.throws(() => decodeEnvelope('xabcdef'), /unknown envelope mode/);
});

test('newline in fields is rejected at encode time', () => {
  assert.throws(() => encodePlaintext({ apiEndpoint: 'a\nb', mappingId: 'm' }), EnvelopeError);
});

test('keyFromBase64 validates length', () => {
  const good = randomBytes(32).toString('base64');
  assert.equal(keyFromBase64(good).length, 32);
  assert.throws(() => keyFromBase64(randomBytes(16).toString('base64')), /must be 32 bytes/);
});

test('sealed subscription URL stays within the 225-char Google cap', () => {
  // Realistic worst-ish case: 32-char token, typical host, expiry set.
  const target: FeedTarget = {
    apiEndpoint: 'https://abcdefghijklmnopqrstuvwxyz012345@username.pryv.me/',
    mappingId: 'm-abc123'
  };
  const env = encodeSealed(target, 1_900_000_000, KEY);
  const url = `https://username.pryv.me/cal/${env}.ics`;
  assert.ok(url.length <= 225, `sealed URL ${url.length} chars exceeds 225`);
});
