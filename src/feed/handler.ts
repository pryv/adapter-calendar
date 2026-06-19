/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Feed handler: resolves a subscription envelope to an iCalendar document.
 *
 * Transport-agnostic — it returns a status/headers/body triple that the HTTP
 * server writes out. It depends on a {@link PryvClientFactory} so it can be
 * exercised without a network.
 */
import { decodeEnvelope, EnvelopeError } from './envelope.ts';
import { parseMapping, sourceToQuery, eventToCalendarEvent } from './mapping.ts';
import { serializeCalendar } from '../ical/serialize.ts';
import type { PryvReaderFactory } from '../pryv/types.ts';

/** Runtime configuration for the handler. */
export interface FeedConfig {
  /** 32-byte AES key for sealed envelopes (omit to disable sealed mode). */
  key?: Buffer;
  /** Current time as unix seconds (defaults to now). Injectable for tests. */
  now?: number;
}

/** A transport-agnostic HTTP response. */
export interface FeedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function plain (status: number, body: string): FeedResponse {
  return { status, headers: { 'content-type': 'text/plain; charset=utf-8' }, body };
}

/**
 * Resolve an envelope segment (the part between the route prefix and `.ics`) to
 * a calendar document.
 *
 * Status codes: 200 on success; 400 for a malformed/unauthenticated envelope;
 * 410 for an expired one; 502 when reading from Pryv fails.
 */
export async function handleFeed (
  envelope: string,
  config: FeedConfig,
  makeClient: PryvReaderFactory
): Promise<FeedResponse> {
  let decoded;
  try {
    decoded = decodeEnvelope(envelope, { key: config.key, now: config.now });
  } catch (err) {
    if (err instanceof EnvelopeError) {
      const status = /expired/.test(err.message) ? 410 : 400;
      return plain(status, err.message);
    }
    throw err;
  }

  const client = makeClient(decoded.apiEndpoint);
  let mapping;
  let events;
  try {
    mapping = parseMapping(await client.getMapping(decoded.mappingId));
    events = await client.getEvents(sourceToQuery(mapping.source));
  } catch {
    return plain(502, 'failed to read from Pryv');
  }

  const calendarEvents = events.map((event) => eventToCalendarEvent(event, mapping));
  const ics = serializeCalendar(calendarEvents, mapping.name != null ? { name: mapping.name } : {});
  return {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'no-cache'
    },
    body: ics
  };
}
