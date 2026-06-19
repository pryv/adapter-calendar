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
    }
  };
}
