/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Pryv data shapes the adapter reads, and the client port it depends on.
 *
 * These are intentionally a minimal subset of the Pryv API surface — only what
 * the calendar feed needs. The concrete lib-js-backed implementation lives in
 * `client.ts`; the feed handler depends on the {@link PryvClient} interface so
 * it can be tested without a network.
 */

/** A Pryv event (minimal subset). Timestamps are unix seconds (may be fractional). */
export interface PryvEvent {
  id: string;
  streamIds: string[];
  type: string;
  /** Event time, unix seconds. */
  time: number;
  /** Duration in seconds, when the event spans an interval. */
  duration?: number;
  /** Event payload; shape depends on the event type. */
  content: unknown;
  /** Last-modified time, unix seconds. */
  modified?: number;
}

/** A subset of `events.get` query parameters. */
export interface EventsQuery {
  streams?: string[];
  types?: string[];
  fromTime?: number;
  toTime?: number;
  limit?: number;
}

/**
 * Read side: what the feed handler needs from a single Pryv account (bound at
 * construction time to one apiEndpoint).
 */
export interface PryvReader {
  /** Read the raw `content` of the mapping-config event by id. */
  getMapping (mappingId: string): Promise<unknown>;
  /** Fetch events matching the query. */
  getEvents (query: EventsQuery): Promise<PryvEvent[]>;
}

/** An event to create on a Pryv account. */
export interface NewEvent {
  streamIds: string[];
  type: string;
  /** Unix seconds; defaults to the server's now when omitted. */
  time?: number;
  duration?: number;
  content: unknown;
  clientData?: Record<string, unknown>;
}

/** Write side: what the mapping-creation UI and the ingest path need. */
export interface PryvWriter {
  /** Persist a mapping config (ensuring its stream) and return the new event id. */
  createMapping (mapping: unknown): Promise<{ id: string }>;
  /** Create the stream if absent (an existing stream is not an error). */
  ensureStream (streamId: string, name: string): Promise<void>;
  /** Create a single event and return its id. */
  createEvent (event: NewEvent): Promise<{ id: string }>;
}

/** A Pryv account client (read + write). */
export interface PryvClient extends PryvReader, PryvWriter {}

/** Builds a read-only client bound to a single user's apiEndpoint. */
export type PryvReaderFactory = (apiEndpoint: string) => PryvReader;

/** Builds a full read/write client bound to a single user's apiEndpoint. */
export type PryvClientFactory = (apiEndpoint: string) => PryvClient;
