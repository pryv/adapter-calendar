/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * lib-js-backed implementation of the {@link PryvClient} port.
 *
 * Each client is bound to one user's apiEndpoint (which carries the token). This
 * module is the only place that imports `pryv`; the handler and server depend on
 * the interface in `types.ts`, so they remain unit-testable without a network.
 */
import pryv from 'pryv';
import type { PryvClient, EventsQuery, PryvEvent, NewEvent } from './types.ts';

const { Connection } = pryv;

/** Stream and event type the mapping configs are stored under. */
export const MAPPING_STREAM_ID = 'adapter-calendar-mappings';
export const MAPPING_STREAM_NAME = 'Calendar adapter mappings';
/** Stored as a JSON string under a standard text type to avoid type validation. */
export const MAPPING_EVENT_TYPE = 'note/txt';

/** Build a PryvClient for a single apiEndpoint. */
export function createPryvClient (apiEndpoint: string): PryvClient {
  const connection = new Connection(apiEndpoint);

  async function ensureStream (streamId: string, name: string): Promise<void> {
    const res = await connection.post('streams', { id: streamId, name }) as { error?: { id?: string } };
    if (res?.error != null && res.error.id !== 'item-already-exists') {
      throw new Error('failed to create stream: ' + JSON.stringify(res.error));
    }
  }

  async function createEvent (event: NewEvent): Promise<{ id: string }> {
    const body = await connection.post('events', event) as { event?: { id?: string }; error?: unknown };
    if (body?.event?.id == null) throw new Error('failed to create event: ' + JSON.stringify(body?.error));
    return { id: body.event.id };
  }

  return {
    ensureStream,
    createEvent,
    async getMapping (mappingId: string): Promise<unknown> {
      const body = await connection.get('events/' + encodeURIComponent(mappingId)) as { event?: { content?: unknown } };
      if (body?.event == null) throw new Error('mapping event not found');
      return body.event.content;
    },
    async getEvents (query: EventsQuery): Promise<PryvEvent[]> {
      const body = await connection.get('events', query as unknown as Record<string, unknown>) as { events?: PryvEvent[] };
      return body?.events ?? [];
    },
    async createMapping (mapping: unknown): Promise<{ id: string }> {
      await ensureStream(MAPPING_STREAM_ID, MAPPING_STREAM_NAME);
      return createEvent({
        streamIds: [MAPPING_STREAM_ID],
        type: MAPPING_EVENT_TYPE,
        content: JSON.stringify(mapping)
      });
    }
  };
}
