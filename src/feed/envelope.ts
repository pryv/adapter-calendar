/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Subscription-URL envelope codec.
 *
 * A subscription URL embeds everything the feed endpoint needs to serve a
 * calendar without server-side state: the user's Pryv apiEndpoint, the mapping
 * id, and (sealed mode) an expiry. The opaque segment sits between the route
 * prefix and the `.ics` suffix:
 *
 *     https://<host>/<prefix>/<envelope>.ics
 *
 * Two modes, distinguished by the first character of the envelope:
 *
 * - `p` — **plaintext**: base64url of `apiEndpoint \n mappingId`. Simplest; the
 *   token (carried inside the apiEndpoint) is recoverable from the URL.
 * - `s` — **sealed**: AES-256-GCM over `apiEndpoint \n mappingId \n exp`. The
 *   token is opaque, the envelope is authenticated, and it carries an expiry.
 *   Revoke by rotating the adapter key or deleting the inner Pryv token.
 *
 * Every envelope is kept under the Google Calendar ~225-character URL ceiling
 * (see docs/url-length-constraints.md).
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const MODE_PLAINTEXT = 'p';
const MODE_SEALED = 's';
const FIELD_SEP = '\n';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** What a subscription URL resolves to. */
export interface FeedTarget {
  /** The user's Pryv apiEndpoint, e.g. `https://<token>@<host>/`. */
  apiEndpoint: string;
  /** Id of the mapping-config event on the user's account. */
  mappingId: string;
}

/** A decoded plaintext envelope. */
export interface DecodedPlaintext extends FeedTarget {
  mode: 'plaintext';
}

/** A decoded sealed envelope (expiry already validated). */
export interface DecodedSealed extends FeedTarget {
  mode: 'sealed';
  /** Expiry as unix seconds; `0` means no expiry. */
  exp: number;
}

export type DecodedFeed = DecodedPlaintext | DecodedSealed;

/** Options for {@link decodeEnvelope}. */
export interface DecodeOptions {
  /** 32-byte AES key, required to decode sealed envelopes. */
  key?: Buffer;
  /** Current time as unix seconds (defaults to now). Injectable for tests. */
  now?: number;
}

/** Raised for any malformed, unauthenticated or expired envelope. */
export class EnvelopeError extends Error {
  constructor (message: string) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

/** Validate and return a 32-byte AES key from a base64 string. */
export function keyFromBase64 (encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new EnvelopeError(`AES key must be ${KEY_BYTES} bytes (got ${key.length})`);
  }
  return key;
}

function assertNoSeparator (target: FeedTarget): void {
  if (target.apiEndpoint.includes(FIELD_SEP) || target.mappingId.includes(FIELD_SEP)) {
    throw new EnvelopeError('apiEndpoint and mappingId must not contain a newline');
  }
}

/** Encode a plaintext (`p`) envelope. */
export function encodePlaintext (target: FeedTarget): string {
  assertNoSeparator(target);
  const raw = `${target.apiEndpoint}${FIELD_SEP}${target.mappingId}`;
  return MODE_PLAINTEXT + Buffer.from(raw, 'utf8').toString('base64url');
}

/**
 * Encode a sealed (`s`) AES-256-GCM envelope.
 * @param exp expiry as unix seconds, or `0` for no expiry.
 */
export function encodeSealed (target: FeedTarget, exp: number, key: Buffer): string {
  assertNoSeparator(target);
  if (key.length !== KEY_BYTES) throw new EnvelopeError(`AES key must be ${KEY_BYTES} bytes`);
  const raw = `${target.apiEndpoint}${FIELD_SEP}${target.mappingId}${FIELD_SEP}${exp}`;
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return MODE_SEALED + Buffer.concat([nonce, ciphertext, tag]).toString('base64url');
}

function decodePlaintext (body: string): DecodedPlaintext {
  const raw = Buffer.from(body, 'base64url').toString('utf8');
  const parts = raw.split(FIELD_SEP);
  if (parts.length !== 2 || parts[0].length === 0) {
    throw new EnvelopeError('malformed plaintext envelope');
  }
  return { mode: 'plaintext', apiEndpoint: parts[0], mappingId: parts[1] };
}

function decodeSealed (body: string, options: DecodeOptions): DecodedSealed {
  if (options.key == null) throw new EnvelopeError('sealed envelope requires a key');
  const buf = Buffer.from(body, 'base64url');
  if (buf.length < NONCE_BYTES + TAG_BYTES) throw new EnvelopeError('sealed envelope too short');

  const nonce = buf.subarray(0, NONCE_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(NONCE_BYTES, buf.length - TAG_BYTES);

  let raw: string;
  try {
    const decipher = createDecipheriv('aes-256-gcm', options.key, nonce);
    decipher.setAuthTag(tag);
    raw = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new EnvelopeError('sealed envelope authentication failed');
  }

  const parts = raw.split(FIELD_SEP);
  if (parts.length !== 3 || parts[0].length === 0) throw new EnvelopeError('malformed sealed envelope');
  const exp = Number(parts[2]);
  if (!Number.isInteger(exp) || exp < 0) throw new EnvelopeError('malformed sealed envelope expiry');

  if (exp > 0) {
    const now = options.now ?? Math.floor(Date.now() / 1000);
    if (now > exp) throw new EnvelopeError('subscription URL expired');
  }
  return { mode: 'sealed', apiEndpoint: parts[0], mappingId: parts[1], exp };
}

/**
 * Decode an envelope segment (the part between the route prefix and `.ics`).
 * Throws {@link EnvelopeError} for any malformed, unauthenticated or expired
 * input.
 */
export function decodeEnvelope (envelope: string, options: DecodeOptions = {}): DecodedFeed {
  if (envelope.length < 2) throw new EnvelopeError('empty envelope');
  const mode = envelope[0];
  const body = envelope.slice(1);
  if (mode === MODE_PLAINTEXT) return decodePlaintext(body);
  if (mode === MODE_SEALED) return decodeSealed(body, options);
  throw new EnvelopeError('unknown envelope mode');
}
