/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * UI handler: create a mapping config on the user's Pryv account and emit the
 * subscription URL to paste into a calendar app.
 *
 * Transport-agnostic — the HTTP server validates/forwards the request body and
 * writes the JSON result. Depends on a {@link PryvClientFactory} so it is
 * testable without a network.
 */
import { encodePlaintext, encodeSealed } from '../feed/envelope.ts';
import type { Mapping } from '../feed/mapping.ts';
import type { PryvClientFactory } from '../pryv/types.ts';

/** Parsed request to create a mapping + subscription URL. */
export interface CreateMappingInput {
  /** The user's Pryv apiEndpoint (carries the access token). */
  apiEndpoint: string;
  /** The mapping definition to store. */
  mapping: Mapping;
  /** Emit a sealed (AES-256-GCM) URL instead of plaintext. */
  sealed?: boolean;
  /** For sealed URLs: lifetime in seconds (0 / omitted = no expiry). */
  ttlSeconds?: number;
}

/** Result returned to the UI. */
export interface CreateMappingResult {
  mappingId: string;
  url: string;
}

/** Configuration the UI handler needs to build URLs. */
export interface UiConfig {
  /** Externally reachable base URL, e.g. `https://core.example.com`. */
  baseUrl: string;
  /** Feed route prefix, e.g. `cal`. */
  prefix: string;
  /** AES key for sealed URLs (required when `sealed` is requested). */
  key?: Buffer;
  /** Current time as unix seconds (defaults to now). Injectable for tests. */
  now?: number;
}

/** Raised for invalid create-mapping input. */
export class UiRequestError extends Error {
  constructor (message: string) {
    super(message);
    this.name = 'UiRequestError';
  }
}

/** Validate a raw parsed JSON body into a {@link CreateMappingInput}. */
export function parseCreateMappingInput (raw: unknown): CreateMappingInput {
  if (raw == null || typeof raw !== 'object') throw new UiRequestError('request body must be an object');
  const body = raw as Record<string, unknown>;
  if (typeof body.apiEndpoint !== 'string' || !/^https?:\/\//.test(body.apiEndpoint)) {
    throw new UiRequestError('apiEndpoint must be an http(s) URL');
  }
  if (body.mapping == null || typeof body.mapping !== 'object') {
    throw new UiRequestError('mapping must be an object');
  }
  const input: CreateMappingInput = {
    apiEndpoint: body.apiEndpoint,
    mapping: body.mapping as Mapping
  };
  if (body.sealed === true) input.sealed = true;
  if (typeof body.ttlSeconds === 'number' && body.ttlSeconds > 0) input.ttlSeconds = Math.floor(body.ttlSeconds);
  return input;
}

/** Create the mapping and return the subscription URL. */
export async function handleCreateMapping (
  input: CreateMappingInput,
  config: UiConfig,
  makeClient: PryvClientFactory
): Promise<CreateMappingResult> {
  const client = makeClient(input.apiEndpoint);
  const { id } = await client.createMapping(input.mapping);
  const target = { apiEndpoint: input.apiEndpoint, mappingId: id };

  let envelope: string;
  if (input.sealed === true) {
    if (config.key == null) throw new UiRequestError('sealed URLs are not enabled on this server');
    const exp = input.ttlSeconds != null
      ? (config.now ?? Math.floor(Date.now() / 1000)) + input.ttlSeconds
      : 0;
    envelope = encodeSealed(target, exp, config.key);
  } else {
    envelope = encodePlaintext(target);
  }

  const base = config.baseUrl.replace(/\/+$/, '');
  const prefix = config.prefix.replace(/^\/+|\/+$/g, '');
  return { mappingId: id, url: `${base}/${prefix}/${envelope}.ics` };
}
