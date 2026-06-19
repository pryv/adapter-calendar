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
import type { PryvClient, EventsQuery, PryvEvent } from './types.ts';

const { Connection } = pryv;

/** Stream and event type the mapping configs are stored under. */
export const MAPPING_STREAM_ID = 'adapter-calendar-mappings';
export const MAPPING_STREAM_NAME = 'Calendar adapter mappings';
/** Stored as a JSON string under a standard text type to avoid type validation. */
export const MAPPING_EVENT_TYPE = 'note/txt';

/** Build a PryvClient for a single apiEndpoint. */
export function createPryvClient (apiEndpoint: string): PryvClient {
  const connection = new Connection(apiEndpoint);
  return {
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
      // Ensure the mappings stream exists; an existing stream is not an error.
      const created = await connection.post('streams', { id: MAPPING_STREAM_ID, name: MAPPING_STREAM_NAME }) as { error?: { id?: string } };
      if (created?.error != null && created.error.id !== 'item-already-exists') {
        throw new Error('failed to create mappings stream: ' + JSON.stringify(created.error));
      }
      const body = await connection.post('events', {
        streamIds: [MAPPING_STREAM_ID],
        type: MAPPING_EVENT_TYPE,
        content: JSON.stringify(mapping)
      }) as { event?: { id?: string }; error?: unknown };
      if (body?.event?.id == null) throw new Error('failed to create mapping event: ' + JSON.stringify(body?.error));
      return { id: body.event.id };
    }
  };
}
