/**
 * @license
 * [BSD-3-Clause](https://github.com/pryv/adapter-calendar/blob/master/LICENSE)
 */
/**
 * Ingest orchestration (UC2a): an iCalendar document → Pryv events.
 *
 * Parses the document, ensures the target stream, and creates a
 * `calendar/ical-event` per VEVENT — skipping any whose UID already exists in
 * the stream so re-ingesting the same feed is idempotent. Transport-agnostic:
 * the caller supplies the iCal text (the one-shot `cli.ts` fetches the URL).
 */
import { parseCalendar } from '../ical/parse.ts';
import { parsedEventToPryvEvent, CALENDAR_EVENT_TYPE } from './mapping.ts';
import type { PryvClient } from '../pryv/types.ts';

/** Where ingested events land. */
export interface IngestOptions {
  /** Target stream id (one stream per source calendar by default). */
  streamId: string;
  /** Stream display name; defaults to the id. */
  streamName?: string;
}

/** Outcome of an ingest run. */
export interface IngestResult {
  /** VEVENTs in the source document. */
  total: number;
  /** Events created this run. */
  created: number;
  /** Events skipped (already present by UID, or no start). */
  skipped: number;
}

function existingUid (content: unknown): string | undefined {
  if (content != null && typeof content === 'object') {
    const uid = (content as { uid?: unknown }).uid;
    if (typeof uid === 'string') return uid;
  }
  return undefined;
}

/**
 * Ingest an iCalendar document into Pryv. Idempotent by VEVENT UID within the
 * target stream.
 */
export async function ingestCalendar (ics: string, options: IngestOptions, client: PryvClient): Promise<IngestResult> {
  const parsed = parseCalendar(ics);
  await client.ensureStream(options.streamId, options.streamName ?? options.streamId);

  const existing = await client.getEvents({ streams: [options.streamId], types: [CALENDAR_EVENT_TYPE] });
  const seen = new Set<string>();
  for (const event of existing) {
    const uid = existingUid(event.content);
    if (uid != null) seen.add(uid);
  }

  let created = 0;
  let skipped = 0;
  for (const event of parsed.events) {
    const pryvEvent = parsedEventToPryvEvent(event, options.streamId);
    if (pryvEvent == null) { skipped++; continue; }
    const uid = pryvEvent.content.uid;
    if (uid != null && seen.has(uid)) { skipped++; continue; }
    await client.createEvent(pryvEvent);
    if (uid != null) seen.add(uid);
    created++;
  }

  return { total: parsed.events.length, created, skipped };
}
